import { bindable, type DbAdapter, type Row, type Stmt } from './types.ts';

// @cloudflare/workers-types 없이도 타입 검사가 되도록 쓰는 부분만 선언한다.
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export function d1Adapter(db: D1Database): DbAdapter {
  const prep = (sql: string, params: unknown[]) => db.prepare(sql).bind(...params.map(bindable));
  return {
    async all<T = Row>(sql: string, ...params: unknown[]) {
      return (await prep(sql, params).all<T>()).results;
    },
    first<T = Row>(sql: string, ...params: unknown[]) {
      return prep(sql, params).first<T>();
    },
    async run(sql: string, ...params: unknown[]) {
      const r = await prep(sql, params).run();
      return { changes: r.meta.changes, lastId: r.meta.last_row_id };
    },
    async batch(stmts: Stmt[]) {
      if (stmts.length) await db.batch(stmts.map((s) => prep(s.sql, s.params)));
    },
  };
}
