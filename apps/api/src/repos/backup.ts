// 위키 콘솔 [백업 받기]. 운영자 계정·인증 관련 테이블은 절대 포함하지 않는다.
import type { DbAdapter, Row } from '../db/types.ts';

/** 백업에서 빠지는 테이블. 계정(아이디·비밀번호 해시·이메일), 세션, 재설정 링크, 투표, 일시 데이터. */
export const BACKUP_EXCLUDED = new Set([
  'managers',
  'manager_proposals',
  'manager_votes',
  'password_reset_tokens',
  'sessions',
  'rate_limits',
  'quiz_challenges',
]);

const INTERNAL = /^(sqlite_|_cf_|d1_)|_fts($|_)/;

export interface Backup {
  format: 'sagwan-backup';
  format_version: 1;
  engine_version: string;
  created_at: number;
  excluded_tables: string[];
  note: string;
  tables: Record<string, Row[]>;
}

export async function exportBackup(db: DbAdapter, engineVersion: string, now: number): Promise<Backup> {
  const names = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"))
    .map((r) => r.name)
    .filter((n) => !INTERNAL.test(n) && !BACKUP_EXCLUDED.has(n));
  const tables: Record<string, Row[]> = {};
  for (const n of names) {
    // 테이블 이름은 sqlite_master에서 온 값이지만 그래도 식별자를 따옴표로 감싼다.
    tables[n] = await db.all(`SELECT * FROM "${n.replace(/"/g, '""')}"`);
  }
  return {
    format: 'sagwan-backup',
    format_version: 1,
    engine_version: engineVersion,
    created_at: now,
    excluded_tables: [...BACKUP_EXCLUDED].sort(),
    note: '운영자 계정은 포함되지 않습니다. 복원 후 슈퍼 운영자 계정을 새로 만들어야 합니다. 미디어 파일은 저장소 버킷에 따로 있습니다.',
    tables,
  };
}
