// 기간제 IP 차단, 금칙어, 속도 제한
import { normalizeForFilter } from '@sagwan/shared';
import type { DbAdapter } from '../db/types.ts';

export interface BanRow {
  id: number;
  ip_hash: string;
  reason: string;
  expires_at: number | null;
  created_by: number;
  created_at: number;
  lifted_at: number | null;
}

export function activeBan(db: DbAdapter, ipHash: string, now: number) {
  return db.first<BanRow>(
    'SELECT * FROM ip_bans WHERE ip_hash = ? AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC LIMIT 1',
    ipHash, now,
  );
}

export function listBans(db: DbAdapter, now: number) {
  return db.all<BanRow>(
    'SELECT * FROM ip_bans WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY id DESC',
    now,
  );
}

export async function createBan(db: DbAdapter, ipHash: string, reason: string, expiresAt: number | null, by: number, now: number) {
  const r = await db.run('INSERT INTO ip_bans (ip_hash, reason, expires_at, created_by, created_at) VALUES (?,?,?,?,?)', ipHash, reason, expiresAt, by, now);
  return r.lastId;
}

export async function liftBan(db: DbAdapter, id: number, by: number, now: number) {
  const r = await db.run('UPDATE ip_bans SET lifted_at = ?, lifted_by = ? WHERE id = ? AND lifted_at IS NULL', now, by, id);
  return r.changes === 1;
}

export async function listWords(db: DbAdapter): Promise<string[]> {
  return (await db.all<{ word: string }>('SELECT word FROM banned_words ORDER BY word')).map((r) => r.word);
}

export async function addWord(db: DbAdapter, raw: string, by: number, now: number) {
  const word = normalizeForFilter(raw);
  if (!word) return null;
  await db.run('INSERT OR IGNORE INTO banned_words (word, created_by, created_at) VALUES (?,?,?)', word, by, now);
  return word;
}

export async function removeWord(db: DbAdapter, raw: string) {
  const r = await db.run('DELETE FROM banned_words WHERE word = ?', normalizeForFilter(raw));
  return r.changes === 1;
}

/** 고정 창 카운터. 허용되면 true. */
export async function hitRateLimit(db: DbAdapter, bucket: string, windowSec: number, limit: number, now: number) {
  const windowStart = now - (now % windowSec);
  await db.run(
    'INSERT INTO rate_limits (bucket, window_start, count) VALUES (?,?,1) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1',
    bucket, windowStart,
  );
  const r = await db.first<{ count: number }>('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?', bucket, windowStart);
  return (r?.count ?? 0) <= limit;
}

export function pruneRateLimits(db: DbAdapter, now: number) {
  return db.run('DELETE FROM rate_limits WHERE window_start < ?', now - 86400);
}
