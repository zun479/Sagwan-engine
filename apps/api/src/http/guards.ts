import { sha256Hex } from '@sagwan/shared';
import type { Ctx, Manager } from '../context.ts';
import { findSession, touchActive } from '../repos/managers.ts';
import { activeBan, hitRateLimit } from '../repos/moderation.ts';
import { HttpError } from './router.ts';

export const SESSION_COOKIE = 'sg_session';

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export async function loadManager(req: Request, ctx: Ctx): Promise<Manager | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const now = ctx.deps.now();
  const m = await findSession(ctx.deps.db, await sha256Hex(token), now);
  // 활동 시각은 한 시간에 한 번만 갱신 (쓰기 횟수 절약). 장기 미활동 판정에 쓰인다.
  if (m && now - m.last_active_at > 3600) await touchActive(ctx.deps.db, m.id, now);
  return m;
}

/**
 * 상태를 바꾸는 요청에는 사용자 지정 헤더를 요구한다.
 * 다른 사이트의 폼·이미지 태그로는 이 헤더를 붙일 수 없어 CSRF를 막는다 (SameSite=Strict와 이중 방어).
 */
export function requireCsrfHeader(req: Request): void {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.get('x-sagwan') !== '1') {
    throw new HttpError(403, 'CSRF', '잘못된 요청입니다.');
  }
}

export function requireManager(ctx: Ctx): Manager {
  if (!ctx.manager) throw new HttpError(401, 'LOGIN_REQUIRED', '운영자 로그인이 필요합니다.');
  return ctx.manager;
}

export function requireSuper(ctx: Ctx): Manager {
  const m = requireManager(ctx);
  if (m.role !== 'super') throw new HttpError(403, 'SUPER_ONLY', '슈퍼 운영자만 할 수 있습니다.');
  return m;
}

export async function rejectIfBanned(ctx: Ctx): Promise<void> {
  if (ctx.manager) return;
  const ban = await activeBan(ctx.deps.db, ctx.ipHash, ctx.deps.now());
  if (ban) {
    throw new HttpError(403, 'BANNED', '이 접속 환경에서는 편집이 제한되어 있습니다.', {
      reason: ban.reason,
      until: ban.expires_at,
    });
  }
}

export async function rateLimit(ctx: Ctx, bucket: string, windowSec: number, limit: number): Promise<void> {
  const ok = await hitRateLimit(ctx.deps.db, bucket, windowSec, limit, ctx.deps.now());
  if (!ok) throw new HttpError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.');
}
