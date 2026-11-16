// Cloudflare Workers 진입점
import { allAuditAsc, auditHead } from '../repos/audit.ts';
import { pruneRateLimits } from '../repos/moderation.ts';
import { createApp, ENGINE_VERSION } from '../app.ts';
import { noCaptcha, type CaptchaVerifier, type Deps } from '../context.ts';
import { d1Adapter, type D1Database } from '../db/d1.ts';
import { r2Storage, type R2Bucket } from '../storage/types.ts';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  AUTH_PEPPER: string;
  DATA_ENCRYPTION_KEY: string;
  TURNSTILE_SECRET?: string;
}

function turnstile(secret: string): CaptchaVerifier {
  return {
    async verify(token, ip) {
      if (!token) return false;
      const body = new FormData();
      body.set('secret', secret);
      body.set('response', token);
      body.set('remoteip', ip);
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
      const data = (await r.json()) as { success?: boolean };
      return data.success === true;
    },
  };
}

function deps(env: Env): Deps {
  if (!env.AUTH_PEPPER || !env.DATA_ENCRYPTION_KEY) throw new Error('missing secrets: AUTH_PEPPER / DATA_ENCRYPTION_KEY');
  return {
    db: d1Adapter(env.DB),
    storage: r2Storage(env.MEDIA),
    pepper: env.AUTH_PEPPER,
    encKey: env.DATA_ENCRYPTION_KEY,
    captcha: env.TURNSTILE_SECRET ? turnstile(env.TURNSTILE_SECRET) : noCaptcha,
    now: () => Math.floor(Date.now() / 1000),
    engineVersion: ENGINE_VERSION,
  };
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return createApp(deps(env), (r) => r.headers.get('cf-connecting-ip') ?? '0.0.0.0')(req);
  },

  /** 하루 한 번(wrangler.toml crons): 감사 로그 체인을 R2 공개 경로에 내보내고, 오래된 속도 제한 기록을 지운다. */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const d = deps(env);
    const rows = await allAuditAsc(d.db);
    const head = await auditHead(d.db);
    await d.storage.put('public/audit/chain.json', JSON.stringify({ exported_at: d.now(), ...head, rows }), 'application/json');
    await pruneRateLimits(d.db, d.now());
  },
};
