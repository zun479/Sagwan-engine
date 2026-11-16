// 감사 로그 해시 체인. 위변조를 막지는 못하지만 드러나게 한다 (docs/GOVERNANCE.md).

import { sha256Hex } from './crypto.ts';

export const GENESIS = 'GENESIS';

export interface AuditEntry {
  actor_manager_id: number | null;
  action: string;
  target_info: string;
  detail_json: string;
  created_at: number;
}

export interface AuditRow extends AuditEntry {
  id: number;
  prev_hash: string;
  hash: string;
}

/** 필드 순서를 고정한 정규 문자열. 키 순서가 바뀌어도 해시가 같도록 배열로 직렬화한다. */
export function canonical(prevHash: string, e: AuditEntry): string {
  return JSON.stringify([prevHash, e.actor_manager_id, e.action, e.target_info, e.detail_json, e.created_at]);
}

export function chainHash(prevHash: string, e: AuditEntry): Promise<string> {
  return sha256Hex(canonical(prevHash, e));
}

export interface ChainCheck {
  ok: boolean;
  /** 처음으로 어긋난 행의 id */
  brokenAtId?: number;
  reason?: 'prev_mismatch' | 'hash_mismatch';
  checked: number;
  head: string;
}

/** rows는 id 오름차순이어야 한다. */
export async function verifyChain(rows: readonly AuditRow[]): Promise<ChainCheck> {
  let prev = GENESIS;
  let checked = 0;
  for (const r of rows) {
    if (r.prev_hash !== prev) return { ok: false, brokenAtId: r.id, reason: 'prev_mismatch', checked, head: prev };
    const h = await chainHash(prev, r);
    if (h !== r.hash) return { ok: false, brokenAtId: r.id, reason: 'hash_mismatch', checked, head: prev };
    prev = r.hash;
    checked++;
  }
  return { ok: true, checked, head: prev };
}
