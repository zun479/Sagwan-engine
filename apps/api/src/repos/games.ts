import type { DbAdapter } from '../db/types.ts';

export const EDITABLE_GAME_FIELDS = ['description', 'released', 'platforms'] as const;
export type EditableGameField = (typeof EDITABLE_GAME_FIELDS)[number];

export interface GameRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  released: string;
  platforms: string;
  genre: string | null;
  status: 'pending' | 'verified' | 'hidden';
  current_revision_id: number | null;
  updated_at: number;
}

const SELECT_GAME = `SELECT g.id, g.slug, g.title, g.description, g.released, g.platforms, gr.name AS genre, g.status, g.current_revision_id, g.updated_at
  FROM games g LEFT JOIN genres gr ON gr.id = g.genre_id`;

export async function listGames(db: DbAdapter, q: string, limit: number, offset: number, includeHidden: boolean) {
  const hidden = includeHidden ? '' : "AND g.status != 'hidden'";
  const query = q.trim();
  if (query.length >= 3) {
    // trigram FTS는 3글자 이상에서만 동작한다. 따옴표로 감싸 연산자 해석을 막는다.
    const phrase = `"${query.replace(/"/g, '""')}"`;
    return db.all<GameRow>(
      `${SELECT_GAME} WHERE g.id IN (SELECT rowid FROM games_fts WHERE games_fts MATCH ?) ${hidden} ORDER BY g.title LIMIT ? OFFSET ?`,
      phrase, limit, offset,
    );
  }
  if (query.length > 0) {
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return db.all<GameRow>(`${SELECT_GAME} WHERE (g.title LIKE ? ESCAPE '\\') ${hidden} ORDER BY g.title LIMIT ? OFFSET ?`, like, limit, offset);
  }
  return db.all<GameRow>(`${SELECT_GAME} WHERE 1=1 ${hidden} ORDER BY g.title LIMIT ? OFFSET ?`, limit, offset);
}

export function findGame(db: DbAdapter, slug: string) {
  return db.first<GameRow>(`${SELECT_GAME} WHERE g.slug = ?`, slug);
}

export async function gameDetail(db: DbAdapter, game: GameRow) {
  const [tags, play, links, memes] = await Promise.all([
    db.all<{ name: string }>('SELECT t.name FROM game_tags gt JOIN tags t ON t.id = gt.tag_id WHERE gt.game_id = ? ORDER BY t.name', game.id),
    db.first<{ id: number; first_played_at: number | null; comment: string }>('SELECT id, first_played_at, comment FROM plays WHERE game_id = ?', game.id),
    db.all<{ kind: string; url: string; label: string; link_class: string }>('SELECT kind, url, label, link_class FROM links WHERE game_id = ? ORDER BY id', game.id),
    db.all<{ slug: string; title: string }>("SELECT m.slug, m.title FROM meme_games mg JOIN memes m ON m.id = mg.meme_id WHERE mg.game_id = ? AND m.status != 'hidden'", game.id),
  ]);
  const videos = play
    ? await db.all<{ youtube_id: string; start_sec: number; title: string }>('SELECT youtube_id, start_sec, title FROM videos WHERE play_id = ? ORDER BY sort_order, id', play.id)
    : [];
  return { ...game, tags: tags.map((t) => t.name), play: play ? { first_played_at: play.first_played_at, comment: play.comment, videos } : null, links, memes };
}

export function gameHistory(db: DbAdapter, gameId: number, limit: number) {
  return db.all<{ id: number; changed_fields: string; summary: string; status: string; ip_hash: string; manager_id: number | null; created_at: number }>(
    "SELECT id, changed_fields, summary, status, ip_hash, manager_id, created_at FROM revisions WHERE entity_type = 'game' AND entity_id = ? ORDER BY id DESC LIMIT ?",
    gameId, limit,
  );
}

export function getRevision(db: DbAdapter, id: number) {
  return db.first<{ id: number; entity_type: string; entity_id: number; data: string; ip_hash: string; created_at: number }>('SELECT id, entity_type, entity_id, data, ip_hash, created_at FROM revisions WHERE id = ?', id);
}

export interface GameEdit {
  game: GameRow;
  baseRevisionId: number | null;
  next: Record<EditableGameField, string>;
  changed: EditableGameField[];
  summary: string;
  ipHash: string;
  managerId: number | null;
  termsVersion: string;
  now: number;
}

/**
 * 편집 적용. 편집 시작 시점(base)의 리비전이 아직 최신일 때만 들어간다.
 * D1 batch는 중간에 멈출 수 없으므로 조건부 INSERT + changes() 조건부 UPDATE로 원자성을 맞춘다.
 * 반환: 새 리비전 id, 충돌이면 null
 */
export async function applyGameEdit(db: DbAdapter, e: GameEdit): Promise<number | null> {
  const snapshot = JSON.stringify({ title: e.game.title, ...e.next });
  await db.batch([
    {
      sql: `INSERT INTO revisions (entity_type, entity_id, data, changed_fields, summary, ip_hash, manager_id, base_revision_id, terms_version, created_at)
            SELECT 'game', ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM games WHERE id = ? AND current_revision_id IS ?)`,
      params: [e.game.id, snapshot, JSON.stringify(e.changed), e.summary, e.ipHash, e.managerId, e.baseRevisionId, e.termsVersion, e.now, e.game.id, e.baseRevisionId],
    },
    {
      sql: `UPDATE games SET description = ?, released = ?, platforms = ?, current_revision_id = last_insert_rowid(), updated_at = ?
            WHERE id = ? AND changes() = 1`,
      params: [e.next.description, e.next.released, e.next.platforms, e.now, e.game.id],
    },
  ]);
  const after = await db.first<{ current_revision_id: number | null }>('SELECT current_revision_id FROM games WHERE id = ?', e.game.id);
  const rid = after?.current_revision_id ?? null;
  if (rid === null || rid === e.baseRevisionId) return null;
  const mine = await db.first<{ ok: number }>('SELECT 1 AS ok FROM revisions WHERE id = ? AND ip_hash = ? AND created_at = ? AND data = ?', rid, e.ipHash, e.now, snapshot);
  return mine ? rid : null;
}

export function setGameStatus(db: DbAdapter, id: number, status: GameRow['status'], now: number) {
  return db.run('UPDATE games SET status = ?, updated_at = ? WHERE id = ?', status, now, id);
}

export function listMemes(db: DbAdapter, limit: number, offset: number) {
  return db.all<{ slug: string; title: string; description: string; status: string }>(
    "SELECT slug, title, description, status FROM memes WHERE status != 'hidden' ORDER BY title LIMIT ? OFFSET ?",
    limit, offset,
  );
}

export async function memeDetail(db: DbAdapter, slug: string) {
  const m = await db.first<{ id: number; slug: string; title: string; description: string; status: string; origin_date: number | null }>(
    "SELECT id, slug, title, description, status, origin_date FROM memes WHERE slug = ? AND status != 'hidden'",
    slug,
  );
  if (!m) return null;
  const games = await db.all<{ slug: string; title: string }>("SELECT g.slug, g.title FROM meme_games mg JOIN games g ON g.id = mg.game_id WHERE mg.meme_id = ? AND g.status != 'hidden'", m.id);
  const { id: _id, ...rest } = m;
  return { ...rest, games };
}
