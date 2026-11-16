import type { DbAdapter } from '../db/types.ts';
import type { Manager } from '../context.ts';

const COLS = 'id, username, name, role, status, last_active_at';
export const SESSION_TTL = 7 * 24 * 3600;
export const RESET_TTL = 24 * 3600;

export function findByUsername(db: DbAdapter, username: string) {
  return db.first<Manager & { password_hash: string }>(
    `SELECT ${COLS}, password_hash FROM managers WHERE username = ? AND status != 'resigned'`,
    username,
  );
}

export function findById(db: DbAdapter, id: number) {
  return db.first<Manager>(`SELECT ${COLS} FROM managers WHERE id = ?`, id);
}

export function listManagers(db: DbAdapter) {
  return db.all<Manager>(`SELECT ${COLS} FROM managers WHERE status != 'resigned' ORDER BY role DESC, id`);
}

export function touchActive(db: DbAdapter, id: number, now: number) {
  return db.run('UPDATE managers SET last_active_at = ? WHERE id = ?', now, id);
}

export function createSession(db: DbAdapter, tokenHash: string, managerId: number, now: number) {
  return db.run('INSERT INTO sessions (token_hash, manager_id, expires_at, created_at) VALUES (?,?,?,?)', tokenHash, managerId, now + SESSION_TTL, now);
}

export function findSession(db: DbAdapter, tokenHash: string, now: number) {
  return db.first<Manager>(
    `SELECT m.id, m.username, m.name, m.role, m.status, m.last_active_at FROM sessions s JOIN managers m ON m.id = s.manager_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND m.status != 'resigned'`,
    tokenHash, now,
  );
}

export function deleteSession(db: DbAdapter, tokenHash: string) {
  return db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
}

export function createResetToken(db: DbAdapter, tokenHash: string, managerId: number, createdBy: number, now: number) {
  return db.batch([
    // 같은 운영자에게 걸린 이전 링크는 무효화
    { sql: 'UPDATE password_reset_tokens SET used_at = ? WHERE manager_id = ? AND used_at IS NULL', params: [now, managerId] },
    { sql: 'INSERT INTO password_reset_tokens (token_hash, manager_id, created_by, expires_at) VALUES (?,?,?,?)', params: [tokenHash, managerId, createdBy, now + RESET_TTL] },
  ]);
}

export function findResetToken(db: DbAdapter, tokenHash: string, now: number) {
  return db.first<{ manager_id: number }>(
    'SELECT manager_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
    tokenHash, now,
  );
}

/** 비밀번호 교체 + 링크 사용 처리 + 그 운영자의 모든 세션 종료를 한 번에. */
export async function consumeResetToken(db: DbAdapter, tokenHash: string, managerId: number, passwordHash: string, now: number) {
  await db.batch([
    { sql: 'UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', params: [now, tokenHash] },
    { sql: 'UPDATE managers SET password_hash = ? WHERE id = ? AND changes() = 1', params: [passwordHash, managerId] },
    { sql: 'DELETE FROM sessions WHERE manager_id = ?', params: [managerId] },
  ]);
}
