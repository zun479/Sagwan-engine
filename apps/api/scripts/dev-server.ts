// Cloudflare 없이 로컬에서 위키를 띄우는 미리보기 서버 (Node 22 내장 SQLite).
//   node scripts/dev-server.ts [웹 빌드 폴더] [포트]
// 메모리 DB에 마이그레이션 + 샘플 데이터 + 운영자 2명(owner / helper, 비밀번호 "dev password 1")을 넣는다.
// 개발 전용: 키를 매번 새로 만들고, 실제 배포에는 쓰지 않는다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { hashPassword, toB64 } from '@sagwan/shared';
import { createApp } from '../src/app.ts';
import { noCaptcha } from '../src/context.ts';
import { nodeSqliteAdapter } from '../src/db/nodeSqlite.ts';
import { memoryStorage } from '../src/storage/types.ts';

const root = new URL('../../../', import.meta.url);
const webDir = process.argv[2] ?? new URL('apps/web/dist', root).pathname;
const port = Number(process.argv[3] ?? 8787);

const db = nodeSqliteAdapter();
db.exec(readFileSync(new URL('migrations/sqlite/0001_init.sql', root), 'utf8'));
db.exec(readFileSync(new URL('scripts/seed-demo.sql', root), 'utf8'));
const pw = await hashPassword('dev password 1');
await db.run("INSERT INTO managers (username, name, role, password_hash, last_active_at, created_at) VALUES ('owner','위키지기','super',?,0,0)", pw);
await db.run("INSERT INTO managers (username, name, role, password_hash, last_active_at, created_at) VALUES ('helper','도우미','manager',?,0,0)", pw);
await db.run("INSERT INTO legal_pages (slug, body, updated_at) VALUES ('terms', ?, 0), ('privacy', ?, 0)",
  readFileSync(new URL('docs/legal/TERMS.template.md', root), 'utf8'), readFileSync(new URL('docs/legal/PRIVACY.template.md', root), 'utf8'));

const key = () => toB64(crypto.getRandomValues(new Uint8Array(32)));
const app = createApp(
  { db, storage: memoryStorage(), pepper: key(), encKey: key(), captcha: noCaptcha, now: () => Math.floor(Date.now() / 1000), engineVersion: 'dev' },
  () => '127.0.0.1',
);

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await app(new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
    // 로컬 http에서는 Secure 쿠키가 localhost 외 주소로 안 붙으므로 그대로 두되 localhost로 접속할 것
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  const joined = join(webDir, safe);
  const file = joined.endsWith('/') ? join(joined, 'index.html') : joined;
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA: 없는 경로는 index.html
    res.writeHead(200, { 'content-type': TYPES['.html']! });
    res.end(await readFile(join(webDir, 'index.html')));
  }
}).listen(port, () => console.log(`Sagwan 미리보기: http://localhost:${port}  (운영자 owner / helper, 비밀번호: dev password 1)`));
