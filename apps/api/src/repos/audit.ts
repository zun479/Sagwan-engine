import { GENESIS, chainHash, type AuditRow } from '@sagwan/shared';
import type { DbAdapter } from '../db/types.ts';

// 감사 로그에는 운영자를 번호(manager#id)로만 남긴다. 아이디·비밀번호·토큰·이메일은 넣지 않는다.
const FORBIDDEN_KEY = /pass|token|secret|email|username|cookie/i;

export function assertNoSecrets(detail: Record<string, unknown>): void {
  for (const k of Object.keys(detail)) {
    if (FORBIDDEN_KEY.test(k)) throw new Error(`audit detail key not allowed: ${k}`);
  }
}

export const managerRef = (id: number) => `manager#${id}`;

export async function appendAudit(
  db: DbAdapter,
  now: number,
  actor: number | null,
  action: string,
  target: string,
  detail: Record<string, unknown> = {},
): Promise<string> {
  assertNoSecrets(detail);
  const detail_json = JSON.stringify(detail);
  // prev_hash UNIQUE: 동시에 두 요청이 같은 꼬리에 붙으려 하면 하나가 실패하고 다시 시도한다.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.first<{ hash: string }>('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
    const prev = last?.hash ?? GENESIS;
    const entry = { actor_manager_id: actor, action, target_info: target, detail_json, created_at: now };
    const hash = await chainHash(prev, entry);
    try {
      await db.run(
        'INSERT INTO audit_logs (actor_manager_id, action, target_info, detail_json, prev_hash, hash, created_at) VALUES (?,?,?,?,?,?,?)',
        actor, action, target, detail_json, prev, hash, now,
      );
      return hash;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e))) throw e;
    }
  }
  throw new Error('audit append contention');
}

export function listAudit(db: DbAdapter, limit: number, beforeId?: number) {
  return beforeId
    ? db.all<AuditRow>('SELECT * FROM audit_logs WHERE id < ? ORDER BY id DESC LIMIT ?', beforeId, limit)
    : db.all<AuditRow>('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', limit);
}

export function allAuditAsc(db: DbAdapter) {
  return db.all<AuditRow>('SELECT * FROM audit_logs ORDER BY id ASC');
}

export async function auditHead(db: DbAdapter) {
  const r = await db.first<{ n: number; head: string | null }>(
    'SELECT count(*) AS n, (SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1) AS head FROM audit_logs',
  );
  return { count: r?.n ?? 0, head: r?.head ?? GENESIS };
}
