// 운영자 콘솔 API
import { DEFAULT_SITE_CONFIG, MODULES, randomToken, sha256Hex, verifyChain, type SiteConfig } from '@sagwan/shared';
import type { Ctx } from '../context.ts';
import { allAuditAsc, appendAudit, listAudit, managerRef } from '../repos/audit.ts';
import { exportBackup } from '../repos/backup.ts';
import { RESET_TTL, createResetToken, findById, listManagers } from '../repos/managers.ts';
import { addWord, createBan, liftBan, listBans, listWords, removeWord } from '../repos/moderation.ts';
import { getSite, saveConfig, setLegal, setModule } from '../repos/site.ts';
import { requireManager, requireSuper } from '../http/guards.ts';
import { HttpError, int, json, readJson, str, type Router } from '../http/router.ts';

const MAX_BAN_DAYS = 3650;

export function adminRoutes(r: Router<Ctx>) {
  r.get('/api/admin/managers', async (_req, ctx) => {
    requireManager(ctx);
    const items = await listManagers(ctx.deps.db);
    return json({ items: items.map(({ id, name, role, status, last_active_at }) => ({ id, name, role, status, last_active_at })) });
  });

  // ── 비밀번호 재설정 링크 (이메일 발송 없음: 슈퍼가 직접 전달) ──
  r.post('/api/admin/managers/:id/reset-link', async (_req, ctx, p) => {
    const me = requireSuper(ctx);
    const target = await findById(ctx.deps.db, int(p.id, 'id'));
    if (!target || target.status === 'resigned') throw new HttpError(404, 'NOT_FOUND', '없는 운영자입니다.');
    const token = randomToken();
    const now = ctx.deps.now();
    await createResetToken(ctx.deps.db, await sha256Hex(token), target.id, me.id, now);
    await appendAudit(ctx.deps.db, now, me.id, 'auth.password_reset_issued', managerRef(target.id));
    // 토큰은 URL 조각(#)에 둔다: 서버 접근 로그·Referer에 남지 않는다.
    return json({ path: `/reset#${token}`, expires_at: now + RESET_TTL, once: true });
  });

  // ── IP 차단 (기간제) ──
  r.get('/api/admin/bans', async (_req, ctx) => {
    requireManager(ctx);
    return json({ items: await listBans(ctx.deps.db, ctx.deps.now()) });
  });

  r.post('/api/admin/bans', async (req, ctx) => {
    const me = requireManager(ctx);
    const body = await readJson(req);
    // 운영자는 원본 IP를 볼 수 없다. 편집 기록에 보이는 해시로 차단한다.
    const ipHash = str(body.ip_hash, 'ip_hash', { min: 64, max: 64 });
    if (!/^[0-9a-f]{64}$/.test(ipHash)) throw new HttpError(400, 'BAD_INPUT', 'ip_hash 형식이 아닙니다.');
    const reason = str(body.reason, 'reason', { min: 1, max: 300 });
    const days = body.days === null || body.days === undefined ? null : int(body.days, 'days');
    if (days !== null && (days < 1 || days > MAX_BAN_DAYS)) throw new HttpError(400, 'BAD_INPUT', `days: 1~${MAX_BAN_DAYS}`);
    const now = ctx.deps.now();
    const expiresAt = days === null ? null : now + days * 86400;
    const id = await createBan(ctx.deps.db, ipHash, reason, expiresAt, me.id, now);
    await appendAudit(ctx.deps.db, now, me.id, 'ban.create', `ban#${id}`, { ip: ipHash.slice(0, 8), reason, expires_at: expiresAt });
    return json({ id, expires_at: expiresAt }, 201);
  });

  r.delete('/api/admin/bans/:id', async (_req, ctx, p) => {
    const me = requireManager(ctx);
    const id = int(p.id, 'id');
    const now = ctx.deps.now();
    if (!(await liftBan(ctx.deps.db, id, me.id, now))) throw new HttpError(404, 'NOT_FOUND', '없거나 이미 풀린 차단입니다.');
    await appendAudit(ctx.deps.db, now, me.id, 'ban.lift', `ban#${id}`);
    return json({ ok: true });
  });

  // ── 금칙어 ──
  r.get('/api/admin/banned-words', async (_req, ctx) => {
    requireManager(ctx);
    return json({ items: await listWords(ctx.deps.db) });
  });

  r.post('/api/admin/banned-words', async (req, ctx) => {
    const me = requireManager(ctx);
    const body = await readJson(req);
    const now = ctx.deps.now();
    const word = await addWord(ctx.deps.db, str(body.word, 'word', { min: 1, max: 50 }), me.id, now);
    if (!word) throw new HttpError(400, 'BAD_INPUT', '정규화하면 빈 단어입니다.');
    // 금칙어 원문은 로그에 남기지 않는다 (로그 자체가 욕설 목록이 되지 않도록 길이만)
    await appendAudit(ctx.deps.db, now, me.id, 'banned_word.add', 'banned_words', { length: word.length });
    return json({ word }, 201);
  });

  r.delete('/api/admin/banned-words/:word', async (_req, ctx, p) => {
    const me = requireManager(ctx);
    if (!(await removeWord(ctx.deps.db, p.word!))) throw new HttpError(404, 'NOT_FOUND', '없는 금칙어입니다.');
    await appendAudit(ctx.deps.db, ctx.deps.now(), me.id, 'banned_word.remove', 'banned_words');
    return json({ ok: true });
  });

  // ── 감사 로그 ──
  r.get('/api/admin/audit', async (req, ctx) => {
    requireManager(ctx);
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    return json({ items: await listAudit(ctx.deps.db, 100, before ? Number(before) : undefined) });
  });

  r.get('/api/admin/audit/verify', async (_req, ctx) => {
    requireManager(ctx);
    return json(await verifyChain(await allAuditAsc(ctx.deps.db)));
  });

  // ── 백업 받기 (운영자 계정 제외) ──
  r.get('/api/admin/backup', async (_req, ctx) => {
    const me = requireManager(ctx);
    const now = ctx.deps.now();
    await appendAudit(ctx.deps.db, now, me.id, 'backup.export', 'site');
    const backup = await exportBackup(ctx.deps.db, ctx.deps.engineVersion, now);
    const date = new Date(now * 1000).toISOString().slice(0, 10);
    return json(backup, 200, { 'content-disposition': `attachment; filename="sagwan-backup-${date}.json"` });
  });

  // ── 사이트 설정 (메인 꾸미기 · 모듈 · 약관) ──
  r.put('/api/admin/site/config', async (req, ctx) => {
    const me = requireManager(ctx);
    const body = await readJson<{ config?: Partial<SiteConfig> }>(req);
    const site = await getSite(ctx.deps.db);
    if (!site) throw new HttpError(503, 'NOT_INSTALLED', '위키가 아직 설치되지 않았습니다.');
    const incoming = body.config ?? {};
    // 라이선스 전환은 합의 절차(manager_proposals)로만 바뀐다. 여기서는 받지 않는다.
    if ('license' in incoming) throw new HttpError(400, 'LICENSE_VIA_PROPOSAL', '라이선스는 운영자 합의 절차로만 바꿀 수 있습니다.');
    const theme = { ...site.config.theme, ...incoming.theme, home: { ...site.config.theme.home, ...incoming.theme?.home } };
    const config: SiteConfig = { ...site.config, ...incoming, theme };
    const layouts = ['diagonal', 'tiles', 'cards', 'list', 'hero'];
    if (!layouts.includes(theme.home.layout)) theme.home.layout = DEFAULT_SITE_CONFIG.theme.home.layout;
    // 색은 #RRGGBB만 허용 (CSS에 그대로 들어가므로 주입 차단)
    for (const c of [theme.headerColor, theme.backgroundColor, theme.accentColor, theme.home.color1, theme.home.color2]) {
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new HttpError(400, 'BAD_COLOR', `색상은 #RRGGBB 형식이어야 합니다: ${String(c).slice(0, 20)}`);
    }
    theme.home.artOpacity = Math.min(1, Math.max(0, Number(theme.home.artOpacity) || 0));
    const now = ctx.deps.now();
    await saveConfig(ctx.deps.db, config, now);
    await appendAudit(ctx.deps.db, now, me.id, 'site.config', 'site', { keys: Object.keys(incoming) });
    return json({ config });
  });

  r.put('/api/admin/modules/:module', async (req, ctx, p) => {
    const me = requireSuper(ctx);
    if (!(MODULES as readonly string[]).includes(p.module!)) throw new HttpError(404, 'NOT_FOUND', '없는 모듈입니다.');
    const body = await readJson(req);
    const now = ctx.deps.now();
    await setModule(ctx.deps.db, p.module!, body.enabled === true, me.id, now);
    await appendAudit(ctx.deps.db, now, me.id, 'site.module', p.module!, { enabled: body.enabled === true });
    return json({ ok: true });
  });

  r.put('/api/admin/legal/:slug', async (req, ctx, p) => {
    const me = requireSuper(ctx);
    if (p.slug !== 'terms' && p.slug !== 'privacy') throw new HttpError(404, 'NOT_FOUND', '없는 문서입니다.');
    const body = await readJson(req);
    const now = ctx.deps.now();
    await setLegal(ctx.deps.db, p.slug, str(body.body, 'body', { min: 1, max: 100_000 }), me.id, now);
    await appendAudit(ctx.deps.db, now, me.id, 'legal.update', p.slug);
    return json({ ok: true });
  });
}
