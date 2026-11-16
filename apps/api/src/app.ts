// 플랫폼과 무관한 앱 본체. entries/*가 Deps를 만들어 넘긴다.
import { hashIp } from '@sagwan/shared';
import type { Ctx, Deps } from './context.ts';
import { loadManager, requireCsrfHeader } from './http/guards.ts';
import { HttpError, Router, errorResponse, json } from './http/router.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { publicRoutes } from './routes/public.ts';

export const ENGINE_VERSION = '0.1.0';

export function createApp(deps: Deps, clientIp: (req: Request) => string) {
  const router = new Router<Ctx>();
  publicRoutes(router);
  authRoutes(router);
  adminRoutes(router);

  return async function handle(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const m = router.match(req.method, url.pathname);
      if (m === null) throw new HttpError(404, 'NOT_FOUND', '없는 주소입니다.');
      if (m === 'method') throw new HttpError(405, 'METHOD', '허용되지 않는 요청 방식입니다.');
      requireCsrfHeader(req);
      const ip = clientIp(req);
      // 원본 IP는 이 요청 처리 중 메모리에만 있다. 저장·로그는 해시만.
      const ctx: Ctx = { deps, ip, ipHash: await hashIp(deps.pepper, ip), manager: null };
      ctx.manager = await loadManager(req, ctx);
      return await m.handler(req, ctx, m.params);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error('[sagwan] unhandled', e instanceof Error ? e.name : 'error');
      return errorResponse(e);
    }
  };
}

export { json };
