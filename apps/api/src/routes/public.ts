import { CONTRIBUTOR_TERMS_VERSION, findBannedWord } from '@sagwan/shared';
import type { Ctx } from '../context.ts';
import { auditHead } from '../repos/audit.ts';
import { EDITABLE_GAME_FIELDS, applyGameEdit, findGame, gameDetail, gameHistory, getRevision, listGames, listMemes, memeDetail, type EditableGameField } from '../repos/games.ts';
import { listWords } from '../repos/moderation.ts';
import { getLegal, getSite, isModuleEnabled } from '../repos/site.ts';
import { rateLimit, rejectIfBanned } from '../http/guards.ts';
import { HttpError, json, readJson, str, type Router } from '../http/router.ts';

const PAGE = 30;
const page = (url: URL) => Math.max(0, Math.min(1000, Number(url.searchParams.get('page') ?? '0') | 0));

async function requireModule(ctx: Ctx, module: string) {
  if (!(await isModuleEnabled(ctx.deps.db, module))) throw new HttpError(404, 'MODULE_OFF', '이 위키에서 사용하지 않는 기능입니다.');
}

/** 공개 화면에는 IP 해시 앞 8자리만 보인다 (같은 사람인지 구분하는 용도). */
const shortIp = (h: string) => h.slice(0, 8);

export function publicRoutes(r: Router<Ctx>) {
  r.get('/api/site', async (_req, ctx) => {
    const site = await getSite(ctx.deps.db);
    if (!site) throw new HttpError(503, 'NOT_INSTALLED', '위키가 아직 설치되지 않았습니다.');
    return json({ ...site, terms_version: CONTRIBUTOR_TERMS_VERSION, engine_version: ctx.deps.engineVersion });
  });

  r.get('/api/legal/:slug', async (_req, ctx, p) => {
    if (p.slug !== 'terms' && p.slug !== 'privacy') throw new HttpError(404, 'NOT_FOUND', '없는 문서입니다.');
    const doc = await getLegal(ctx.deps.db, p.slug);
    if (!doc) throw new HttpError(404, 'NOT_FOUND', '아직 작성되지 않았습니다.');
    return json(doc);
  });

  r.get('/api/games', async (req, ctx) => {
    await requireModule(ctx, 'games');
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').slice(0, 100);
    const items = await listGames(ctx.deps.db, q, PAGE, page(url) * PAGE, !!ctx.manager);
    return json({ items });
  });

  r.get('/api/games/:slug', async (_req, ctx, p) => {
    await requireModule(ctx, 'games');
    const g = await findGame(ctx.deps.db, p.slug!);
    if (!g || (g.status === 'hidden' && !ctx.manager)) throw new HttpError(404, 'NOT_FOUND', '없는 게임입니다.');
    return json(await gameDetail(ctx.deps.db, g));
  });

  r.get('/api/games/:slug/history', async (_req, ctx, p) => {
    await requireModule(ctx, 'games');
    const g = await findGame(ctx.deps.db, p.slug!);
    if (!g || (g.status === 'hidden' && !ctx.manager)) throw new HttpError(404, 'NOT_FOUND', '없는 게임입니다.');
    const rows = await gameHistory(ctx.deps.db, g.id, 100);
    return json({
      items: rows.map((row) => ({
        ...row,
        changed_fields: JSON.parse(row.changed_fields) as string[],
        // 운영자만 전체 해시를 본다 (차단 도구용). 원본 IP는 어디에도 없다.
        ip_hash: ctx.manager ? row.ip_hash : shortIp(row.ip_hash),
      })),
    });
  });

  r.get('/api/revisions/:id', async (_req, ctx, p) => {
    const rev = await getRevision(ctx.deps.db, Number(p.id));
    if (!rev) throw new HttpError(404, 'NOT_FOUND', '없는 리비전입니다.');
    return json({ ...rev, data: JSON.parse(rev.data) as unknown, ip_hash: ctx.manager ? rev.ip_hash : shortIp(rev.ip_hash) });
  });

  r.post('/api/games/:slug/edit', async (req, ctx, p) => {
    await requireModule(ctx, 'games');
    await rejectIfBanned(ctx);
    const body = await readJson(req);
    if (!ctx.manager) {
      await rateLimit(ctx, `edit:${ctx.ipHash}`, 600, 10);
      if (!(await ctx.deps.captcha.verify(typeof body.captcha === 'string' ? body.captcha : undefined, ctx.ip))) {
        throw new HttpError(400, 'CAPTCHA', '사람인지 확인이 필요합니다.');
      }
    }
    if (body.terms_version !== CONTRIBUTOR_TERMS_VERSION) {
      throw new HttpError(409, 'TERMS_OUTDATED', '기여 약관이 바뀌었습니다. 새 약관에 동의해 주세요.', { terms_version: CONTRIBUTOR_TERMS_VERSION });
    }
    const g = await findGame(ctx.deps.db, p.slug!);
    if (!g || (g.status === 'hidden' && !ctx.manager)) throw new HttpError(404, 'NOT_FOUND', '없는 게임입니다.');

    const fields = (body.fields ?? {}) as Record<string, unknown>;
    const next = { description: g.description, released: g.released, platforms: g.platforms } as Record<EditableGameField, string>;
    const changed: EditableGameField[] = [];
    for (const f of EDITABLE_GAME_FIELDS) {
      if (fields[f] === undefined) continue;
      const v = str(fields[f], f, { max: f === 'description' ? 20_000 : 200 });
      if (v !== next[f]) { next[f] = v; changed.push(f); }
    }
    if (!changed.length) throw new HttpError(400, 'NO_CHANGE', '바뀐 내용이 없습니다.');
    const summary = body.summary === undefined ? '' : str(body.summary, 'summary', { max: 200 });

    const words = await listWords(ctx.deps.db);
    const hit = findBannedWord([summary, ...changed.map((f) => next[f])].join('\n'), words);
    if (hit) throw new HttpError(400, 'BANNED_WORD', '사용할 수 없는 단어가 들어 있습니다.');

    const base = body.base_revision_id === null || body.base_revision_id === undefined ? null : Number(body.base_revision_id);
    if (base !== g.current_revision_id) {
      throw new HttpError(409, 'EDIT_CONFLICT', '편집하는 동안 다른 사람이 먼저 고쳤습니다. 최신 내용을 확인해 주세요.', { current_revision_id: g.current_revision_id });
    }
    const rid = await applyGameEdit(ctx.deps.db, {
      game: g, baseRevisionId: base, next, changed, summary,
      ipHash: ctx.ipHash, managerId: ctx.manager?.id ?? null, termsVersion: CONTRIBUTOR_TERMS_VERSION, now: ctx.deps.now(),
    });
    if (rid === null) throw new HttpError(409, 'EDIT_CONFLICT', '편집하는 동안 다른 사람이 먼저 고쳤습니다. 최신 내용을 확인해 주세요.');
    return json({ revision_id: rid, changed_fields: changed });
  });

  r.get('/api/memes', async (req, ctx) => {
    await requireModule(ctx, 'memes');
    return json({ items: await listMemes(ctx.deps.db, PAGE, page(new URL(req.url)) * PAGE) });
  });

  r.get('/api/memes/:slug', async (_req, ctx, p) => {
    await requireModule(ctx, 'memes');
    const m = await memeDetail(ctx.deps.db, p.slug!);
    if (!m) throw new HttpError(404, 'NOT_FOUND', '없는 밈입니다.');
    return json(m);
  });

  // 외부에서 R2 공개 덤프와 대조할 수 있도록 체인 꼬리만 공개
  r.get('/api/audit/head', async (_req, ctx) => json(await auditHead(ctx.deps.db)));
}
