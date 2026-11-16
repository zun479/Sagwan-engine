// 의존성 없는 작은 라우터. Workers와 Node 테스트 양쪽에서 표준 Request/Response만 쓴다.

export class HttpError extends Error {
  // 생성자 매개변수 속성은 Node 타입 제거 모드에서 안 되므로 풀어 쓴다 (tsconfig erasableSyntaxOnly 취지)
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export type Params = Record<string, string>;
export type Handler<C> = (req: Request, ctx: C, params: Params) => Promise<Response> | Response;

interface Route<C> {
  method: string;
  parts: string[];
  handler: Handler<C>;
}

export class Router<C> {
  private routes: Route<C>[] = [];

  on(method: string, path: string, handler: Handler<C>): this {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler });
    return this;
  }
  get(p: string, h: Handler<C>) { return this.on('GET', p, h); }
  post(p: string, h: Handler<C>) { return this.on('POST', p, h); }
  put(p: string, h: Handler<C>) { return this.on('PUT', p, h); }
  delete(p: string, h: Handler<C>) { return this.on('DELETE', p, h); }

  match(method: string, pathname: string): { handler: Handler<C>; params: Params } | 'method' | null {
    const segs = pathname.split('/').filter(Boolean);
    let methodMismatch = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Params = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i]!;
        const s = segs[i]!;
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s);
        else if (p !== s) { ok = false; break; }
      }
      if (!ok) continue;
      if (r.method !== method) { methodMismatch = true; continue; }
      return { handler: r.handler, params };
    }
    return methodMismatch ? 'method' : null;
  }
}

const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message, ...e.extra } }, e.status);
  // 내부 오류는 내용(경로·SQL·비밀값)을 밖으로 내보내지 않는다.
  return json({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' } }, 500);
}

const MAX_JSON_BYTES = 64 * 1024;

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_JSON_BYTES) throw new HttpError(413, 'TOO_LARGE', '요청이 너무 큽니다.');
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, 'TOO_LARGE', '요청이 너무 큽니다.');
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'JSON 본문이 필요합니다.');
  }
}

export function str(v: unknown, field: string, { min = 0, max = 10_000 } = {}): string {
  if (typeof v !== 'string') throw new HttpError(400, 'BAD_INPUT', `${field}: 문자열이어야 합니다.`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, 'BAD_INPUT', `${field}: ${min}~${max}자여야 합니다.`);
  return s;
}

export function int(v: unknown, field: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw new HttpError(400, 'BAD_INPUT', `${field}: 정수여야 합니다.`);
  return n;
}
