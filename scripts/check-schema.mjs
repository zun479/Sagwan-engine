// 마이그레이션을 메모리 SQLite에 적용해 검증한다. python3의 sqlite3 모듈을 쓴다 (FTS5 trigram 필요: SQLite 3.34+).
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migDir = join(root, 'migrations', 'sqlite');
const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort().map((f) => join(migDir, f));
files.push(join(root, 'scripts', 'seed-demo.sql'));

const py = String.raw`
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys = ON')
for f in sys.argv[1:]:
    db.executescript(open(f, encoding='utf-8').read())
def q(sql, *a): return db.execute(sql, a).fetchall()
assert q("select title from games_fts where games_fts match ?", '항아리') == [('Getting Over It',)], 'FTS 한국어 부분 일치'
assert q("select title from games_fts where games_fts match ?", 'ver It') == [('Getting Over It',)], 'FTS 영문 부분 일치'
db.execute("update games set title='Getting Over It 2' where id=1")
assert q("select count(*) from games_fts where games_fts match ?", 'Over It 2')[0][0] == 1, 'FTS 갱신 트리거'
db.execute("insert into managers(username,name,role,password_hash,last_active_at,created_at) values('wiki','위키지기','super','x',0,0)")
try:
    db.execute("insert into managers(username,name,role,password_hash,last_active_at,created_at) values('wiki2','둘째','super','x',0,0)")
    raise SystemExit('슈퍼 운영자 2명이 허용됨')
except sqlite3.IntegrityError: pass
try:
    db.execute("insert into managers(username,name,role,password_hash,last_active_at,created_at) values('WIKI','대소문자','manager','x',0,0)")
    raise SystemExit('아이디 대소문자 중복이 허용됨')
except sqlite3.IntegrityError: pass
try:
    db.execute("insert into media(storage_key,kind,mime,size_bytes,sha256,origin,created_at) values('k','image','image/png',1,'h','stolen',0)")
    raise SystemExit('잘못된 origin이 허용됨')
except sqlite3.IntegrityError: pass
try:
    db.execute("insert into ip_bans(ip_hash,reason,created_by,created_at) values('h','',1,0)")
    raise SystemExit('사유 없는 차단이 허용됨')
except sqlite3.IntegrityError: pass
print('tables', q("select count(*) from sqlite_master where type='table'")[0][0])
print('SCHEMA_OK')
`;

const out = execFileSync('python3', ['-c', py, ...files], { encoding: 'utf8' });
process.stdout.write(out);
