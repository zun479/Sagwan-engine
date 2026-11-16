// DB 어댑터. 쿼리는 repos/ 안에서만 쓴다. 다른 DB로 옮길 때는 이 인터페이스만 새로 구현한다.

export type Row = Record<string, unknown>;

export interface Stmt {
  sql: string;
  params: unknown[];
}

export interface RunResult {
  changes: number;
  lastId: number;
}

export interface DbAdapter {
  all<T = Row>(sql: string, ...params: unknown[]): Promise<T[]>;
  first<T = Row>(sql: string, ...params: unknown[]): Promise<T | null>;
  run(sql: string, ...params: unknown[]): Promise<RunResult>;
  /** 전부 성공하거나 전부 취소된다. */
  batch(stmts: Stmt[]): Promise<void>;
}

export const stmt = (sql: string, ...params: unknown[]): Stmt => ({ sql, params });

/** SQLite 바인딩 값으로 정리 (undefined → null, boolean → 0/1). */
export function bindable(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
