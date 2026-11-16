// 개발·테스트용 어댑터 (Node 22 내장 node:sqlite). Workers 번들에는 들어가지 않는다.
import { DatabaseSync } from 'node:sqlite';
import { bindable, type DbAdapter, type Row, type Stmt } from './types.ts';

type Bind = null | number | bigint | string | Uint8Array;

export function nodeSqliteAdapter(path = ':memory:'): DbAdapter & { exec(sql: string): void } {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  const b = (params: unknown[]) => params.map(bindable) as Bind[];
  return {
    exec: (sql: string) => db.exec(sql),
    async all<T = Row>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...b(params)) as T[];
    },
    async first<T = Row>(sql: string, ...params: unknown[]) {
      return (db.prepare(sql).get(...b(params)) as T | undefined) ?? null;
    },
    async run(sql: string, ...params: unknown[]) {
      const r = db.prepare(sql).run(...b(params));
      return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    },
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try {
        for (const s of stmts) db.prepare(s.sql).run(...b(s.params));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
