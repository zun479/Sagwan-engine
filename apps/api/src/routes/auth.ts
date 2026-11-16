import { hashPassword, randomToken, sha256Hex, verifyPassword } from '@sagwan/shared';
import type { Ctx } from '../context.ts';
import { appendAudit, managerRef } from '../repos/audit.ts';
import { SESSION_TTL, consumeResetToken, createSession, deleteSession, findByUsername, findResetToken } from '../repos/managers.ts';
import { SESSION_COOKIE, rateLimit, readCookie, sessionCookie } from '../http/guards.ts';
import { HttpError, json, readJson, str, type Router } from '../http/router.ts';

// 없는 아이디일 때도 같은 시간이 걸리도록 쓰는 더미 해시 (값 자체는 의미 없음)
let dummyHash: Promise<string> | null = null;
const getDummy = () => (dummyHash ??= hashPassword('sagwan-dummy-password'));

export function authRoutes(r: Router<Ctx>) {
  r.post('/api/auth/login', async (req, ctx) => {
    const body = await readJson(req);
    const username = str(body.username, 'username', { min: 1, max: 40 });
    const password = str(body.password, 'password', { min: 1, max: 200 });
    await rateLimit(ctx, `login-ip:${ctx.ipHash}`, 900, 10);
    await rateLimit(ctx, `login-user:${username.toLowerCase()}`, 3600, 20);

    const m = await findByUsername(ctx.deps.db, username);
    const ok = await verifyPassword(password, m?.password_hash ?? (await getDummy()));
    if (!m || !ok) throw new HttpError(401, 'BAD_LOGIN', '아이디 또는 비밀번호가 맞지 않습니다.');

    const token = randomToken();
    const now = ctx.deps.now();
    await createSession(ctx.deps.db, await sha256Hex(token), m.id, now);
    await appendAudit(ctx.deps.db, now, m.id, 'auth.login', managerRef(m.id));
    return json({ manager: { id: m.id, name: m.name, role: m.role } }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL) });
  });

  r.post('/api/auth/logout', async (req, ctx) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await deleteSession(ctx.deps.db, await sha256Hex(token));
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  });

  // 게스트는 401 대신 manager: null (브라우저 콘솔에 오류가 쌓이지 않도록)
  r.get('/api/auth/me', (_req, ctx) => {
    const m = ctx.manager;
    return json({ manager: m ? { id: m.id, name: m.name, role: m.role, username: m.username } : null });
  });

  // 슈퍼가 만들어 준 1회용 링크(/reset#토큰)로 새 비밀번호 설정
  r.post('/api/auth/reset', async (req, ctx) => {
    const body = await readJson(req);
    const token = str(body.token, 'token', { min: 20, max: 200 });
    const password = str(body.password, 'password', { min: 10, max: 200 });
    await rateLimit(ctx, `reset-ip:${ctx.ipHash}`, 900, 10);
    const now = ctx.deps.now();
    const tokenHash = await sha256Hex(token);
    const t = await findResetToken(ctx.deps.db, tokenHash, now);
    if (!t) throw new HttpError(400, 'RESET_INVALID', '링크가 만료되었거나 이미 사용되었습니다.');
    await consumeResetToken(ctx.deps.db, tokenHash, t.manager_id, await hashPassword(password), now);
    await appendAudit(ctx.deps.db, now, t.manager_id, 'auth.password_reset_used', managerRef(t.manager_id));
    return json({ ok: true });
  });
}
