import type { DbAdapter } from './db/types.ts';
import type { StorageAdapter } from './storage/types.ts';

export interface CaptchaVerifier {
  verify(token: string | undefined, ip: string): Promise<boolean>;
}

/** 개발·테스트용: 항상 통과 */
export const noCaptcha: CaptchaVerifier = { verify: async () => true };

export interface Deps {
  db: DbAdapter;
  storage: StorageAdapter;
  /** HMAC 키 (base64). IP·이메일 해시용. Secret으로만 주입 */
  pepper: string;
  /** AES-256-GCM 키 (base64). Secret으로만 주입 */
  encKey: string;
  captcha: CaptchaVerifier;
  now: () => number;
  engineVersion: string;
}

export interface Manager {
  id: number;
  username: string;
  name: string;
  role: 'super' | 'manager';
  status: string;
  last_active_at: number;
}

export interface Ctx {
  deps: Deps;
  ip: string;
  ipHash: string;
  manager: Manager | null;
}
