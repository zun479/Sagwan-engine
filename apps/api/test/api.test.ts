// 실제 마이그레이션을 node:sqlite에 적용하고 HTTP 요청 단위로 검증한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashPassword, toB64 } from '@sagwan/shared';
import { createApp } from '../src/app.ts';
import { nodeSqliteAdapter } from '../src/db/nodeSqlite.ts';
import { memoryStorage } from '../src/storage/types.ts';
import { noCaptcha, type Deps } from '../src/context.ts';
import { BACKUP_EXCLUDED } from '../src/repos/backup.ts';

const root = new URL('../../../', import.meta.url);
const key = () => toB64(crypto.getRandomValues(new Uint8Array(32)));

async function setup() {
  const db = nodeSqliteAdapter();
  db.exec(readFileSync(new URL('migrations/sqlite/0001_init.sql', root), 'utf8'));
  db.exec(readFileSync(new URL('scripts/seed-demo.sql', root), 'utf8'));
  const hash = await hashPassword('correct horse battery');
  await db.run("INSERT INTO managers (username, name, role, password_hash, last_active_at, created_at) VALUES ('owner','위키지기','super',?,0,0)", hash);
  await db.run("INSERT INTO managers (username, name, role, password_hash, last_active_at, created_at) VALUES ('helper','도우미','manager',?,0,0)", hash);
  let clock = 1_800_000_000;
  const deps: Deps = { db, storage: memoryStorage(), pepper: key(), encKey: key(), captcha: noCaptcha, now: () => clock, engineVersion: 'test' };
  let ip = '203.0.113.7';
  const app = createApp(deps, () => ip);
  const call = async (method: string, path: string, body?: unknown, cookie?: string) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (method !== 'GET') headers['x-sagwan'] = '1';
    if (cookie) headers.cookie = cookie;
    const res = await app(new Request(`https://wiki.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as any, headers: res.headers };
  };
  const login = async (username: string, password = 'correct horse battery') => {
    const r = await call('POST', '/api/auth/login', { username, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.headers.get('set-cookie')!.split(';')[0]!;
  };
  return { db, deps, call, login, setIp: (v: string) => (ip = v), tick: (s: number) => (clock += s) };
}

test('공개 조회: 사이트, 게임 목록, 한국어 부분 검색, 상세', async () => {
  const { call } = await setup();
  const site = await call('GET', '/api/site');
  assert.equal(site.body.name, '샘플 스트리머');
  assert.equal(site.body.config.theme.home.layout, 'diagonal');
  const list = await call('GET', '/api/games');
  assert.equal(list.body.items.length, 3);
  const found = await call('GET', '/api/games?q=' + encodeURIComponent('항아리'));
  assert.deepEqual(found.body.items.map((g: any) => g.slug), ['getting-over-it']);
  const short = await call('GET', '/api/games?q=Only');
  assert.equal(short.body.items[0].slug, 'only-up');
  const d = await call('GET', '/api/games/getting-over-it');
  assert.deepEqual(d.body.tags, ['분노유발', '장기방송']);
  assert.equal(d.body.memes[0].slug, 'one-more');
});

test('CSRF 헤더 없는 POST는 거부', async () => {
  const { deps } = await setup();
  const app = createApp(deps, () => '1.1.1.1');
  const r = await app(new Request('https://wiki.test/api/auth/login', { method: 'POST', body: '{}' }));
  assert.equal(r.status, 403);
});

test('편집: 약관 버전, 충돌 감지(base_revision_id), 리비전 기록', async () => {
  const { call, db } = await setup();
  const base = { terms_version: '2026-11-v1', base_revision_id: null };
  const old = await call('POST', '/api/games/only-up/edit', { ...base, terms_version: 'old', fields: { platforms: 'PC, PS5' } });
  assert.equal(old.status, 409);
  assert.equal(old.body.error.code, 'TERMS_OUTDATED');

  const a = await call('POST', '/api/games/only-up/edit', { ...base, fields: { platforms: 'PC, PS5' }, summary: '플랫폼 추가' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.deepEqual(a.body.changed_fields, ['platforms']);

  // 같은 base로 두 번째 사람이 저장하면 충돌
  const b = await call('POST', '/api/games/only-up/edit', { ...base, fields: { description: '다른 내용' } });
  assert.equal(b.status, 409);
  assert.equal(b.body.error.code, 'EDIT_CONFLICT');
  assert.equal(b.body.error.current_revision_id, a.body.revision_id);

  const c = await call('POST', '/api/games/only-up/edit', { ...base, base_revision_id: a.body.revision_id, fields: { description: '정상 편집' } });
  assert.equal(c.status, 200);
  const g = await db.first<any>("SELECT description, current_revision_id FROM games WHERE slug='only-up'");
  assert.equal(g.description, '정상 편집');
  assert.equal(g.current_revision_id, c.body.revision_id);

  const h = await call('GET', '/api/games/only-up/history');
  assert.equal(h.body.items.length, 2);
  assert.equal(h.body.items[0].ip_hash.length, 8, '공개 기록에는 해시 앞 8자리만');
  const raw = await db.all<any>('SELECT ip_hash FROM revisions');
  assert.ok(raw.every((r) => /^[0-9a-f]{64}$/.test(r.ip_hash) && !r.ip_hash.includes('203.0.113.7')), '원본 IP 저장 없음');
});

test('금칙어: 숨은 문자·전각으로 우회해도 걸림', async () => {
  const { call } = await setup();
  const r = await call('POST', '/api/games/only-up/edit', { terms_version: '2026-11-v1', base_revision_id: null, fields: { description: '스팸​광고 ｓ' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'BANNED_WORD');
});

test('IP 차단: 기간제, 만료 후 자동 해제, 감사 로그 연동', async () => {
  const { call, login, db, tick } = await setup();
  await call('POST', '/api/games/only-up/edit', { terms_version: '2026-11-v1', base_revision_id: null, fields: { platforms: 'X' } });
  const cookie = await login('helper');
  const hist = await call('GET', '/api/games/only-up/history', undefined, cookie);
  const ipHash = hist.body.items[0].ip_hash;
  assert.equal(ipHash.length, 64, '운영자는 전체 해시를 본다');

  const noReason = await call('POST', '/api/admin/bans', { ip_hash: ipHash, reason: '', days: 1 }, cookie);
  assert.equal(noReason.status, 400);
  const ban = await call('POST', '/api/admin/bans', { ip_hash: ipHash, reason: '반복 훼손', days: 1 }, cookie);
  assert.equal(ban.status, 201);

  const blocked = await call('POST', '/api/games/only-up/edit', { terms_version: '2026-11-v1', base_revision_id: null, fields: { platforms: 'Y' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.reason, '반복 훼손');

  tick(86400 + 1);
  const cur = await db.first<any>("SELECT current_revision_id FROM games WHERE slug='only-up'");
  const after = await call('POST', '/api/games/only-up/edit', { terms_version: '2026-11-v1', base_revision_id: cur.current_revision_id, fields: { platforms: 'Y' } });
  assert.equal(after.status, 200, '기간 지나면 풀림');

  const audit = await db.all<any>("SELECT action, target_info, detail_json FROM audit_logs WHERE action = 'ban.create'");
  assert.equal(audit.length, 1);
  assert.match(audit[0].target_info, /^ban#\d+$/);
});

test('로그인 실패 메시지는 아이디 존재 여부를 드러내지 않고, 반복 시 속도 제한', async () => {
  const { call } = await setup();
  const a = await call('POST', '/api/auth/login', { username: 'nobody', password: 'x' });
  const b = await call('POST', '/api/auth/login', { username: 'owner', password: 'wrong' });
  assert.equal(a.status, 401);
  assert.deepEqual(a.body, b.body);
  let last = 0;
  for (let i = 0; i < 10; i++) last = (await call('POST', '/api/auth/login', { username: 'owner', password: 'wrong' })).status;
  assert.equal(last, 429);
});

test('재설정 링크: 슈퍼만 발급, 1회용, 사용 시 기존 세션 종료', async () => {
  const { call, login } = await setup();
  const helper = await login('helper');
  const denied = await call('POST', '/api/admin/managers/2/reset-link', {}, helper);
  assert.equal(denied.status, 403);

  const owner = await login('owner');
  const link = await call('POST', '/api/admin/managers/2/reset-link', {}, owner);
  assert.equal(link.status, 200);
  const token = link.body.path.split('#')[1];

  const used = await call('POST', '/api/auth/reset', { token, password: 'new password 123' });
  assert.equal(used.status, 200);
  const again = await call('POST', '/api/auth/reset', { token, password: 'another pass 456' });
  assert.equal(again.status, 400, '두 번 못 씀');

  const me = await call('GET', '/api/auth/me', undefined, helper);
  assert.equal(me.body.manager, null, '옛 세션은 끊김');
  await login('helper', 'new password 123');
});

test('백업: 운영자 계정·세션·재설정 토큰은 빠지고 감사 로그는 번호로만', async () => {
  const { call, login } = await setup();
  const owner = await login('owner');
  await call('POST', '/api/admin/managers/2/reset-link', {}, owner);
  const r = await call('GET', '/api/admin/backup', undefined, owner);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition')!, /sagwan-backup-/);
  const tables = Object.keys(r.body.tables);
  for (const t of BACKUP_EXCLUDED) assert.ok(!tables.includes(t), `${t} 제외`);
  assert.ok(tables.includes('games') && tables.includes('audit_logs') && tables.includes('ip_bans'));
  assert.ok(!tables.some((t) => t.includes('_fts')));
  const text = JSON.stringify(r.body);
  for (const leak of ['owner', 'helper', 'pbkdf2$', '위키지기', '도우미']) assert.ok(!text.includes(leak), `백업에 ${leak} 없음`);
});

test('감사 로그 해시 체인: 검증 통과, DB 직접 수정은 드러남', async () => {
  const { call, login, db } = await setup();
  const owner = await login('owner');
  await call('POST', '/api/admin/banned-words', { word: '나쁜말' }, owner);
  await call('DELETE', '/api/admin/banned-words/' + encodeURIComponent('나쁜말'), undefined, owner);
  const ok = await call('GET', '/api/admin/audit/verify', undefined, owner);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.checked, 3);
  const head = await call('GET', '/api/audit/head');
  assert.equal(head.body.head, ok.body.head);

  await db.run("UPDATE audit_logs SET action = 'nothing' WHERE id = 2");
  const bad = await call('GET', '/api/admin/audit/verify', undefined, owner);
  assert.equal(bad.body.ok, false);
  assert.equal(bad.body.brokenAtId, 2);
});

test('사이트 설정: 라이선스는 여기서 못 바꾸고, 색은 #RRGGBB만', async () => {
  const { call, login } = await setup();
  const owner = await login('owner');
  const lic = await call('PUT', '/api/admin/site/config', { config: { license: { mode: 'proprietary' } } }, owner);
  assert.equal(lic.body.error.code, 'LICENSE_VIA_PROPOSAL');
  const css = await call('PUT', '/api/admin/site/config', { config: { theme: { accentColor: 'red;background:url(x)' } } }, owner);
  assert.equal(css.body.error.code, 'BAD_COLOR');
  const ok = await call('PUT', '/api/admin/site/config', { config: { theme: { home: { layout: 'tiles', artOpacity: 5 } } } }, owner);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.config.theme.home.layout, 'tiles');
  assert.equal(ok.body.config.theme.home.artOpacity, 1);
  assert.equal(ok.body.config.theme.home.color1, '#0A47B8', '나머지 홈 설정 유지');
});

test('모듈 끄면 해당 API가 닫힘 (슈퍼만)', async () => {
  const { call, login } = await setup();
  const helper = await login('helper');
  assert.equal((await call('PUT', '/api/admin/modules/memes', { enabled: false }, helper)).status, 403);
  const owner = await login('owner');
  await call('PUT', '/api/admin/modules/memes', { enabled: false }, owner);
  assert.equal((await call('GET', '/api/memes')).status, 404);
});

test('내부 오류는 세부 내용을 숨김', async () => {
  const { deps } = await setup();
  const broken = { ...deps, db: { ...deps.db, first: async () => { throw new Error('SQL secret path /home/x'); } } };
  const app = createApp(broken, () => '1.1.1.1');
  const r = await app(new Request('https://wiki.test/api/site'));
  assert.equal(r.status, 500);
  assert.ok(!(await r.text()).includes('secret'));
});

test('동시 저장 경쟁: 검사 통과 후 DB 단계에서도 늦은 쪽은 거부', async () => {
  const { db } = await setup();
  const { findGame, applyGameEdit } = await import('../src/repos/games.ts');
  const g = (await findGame(db, 'only-up'))!;
  const mk = (desc: string, now: number) => ({
    game: g, baseRevisionId: null, next: { description: desc, released: g.released, platforms: g.platforms },
    changed: ['description' as const], summary: '', ipHash: 'a'.repeat(64), managerId: null, termsVersion: '2026-11-v1', now,
  });
  const first = await applyGameEdit(db, mk('먼저', 1));
  const second = await applyGameEdit(db, mk('나중', 2)); // 같은 base(null)로 들어온 두 번째 요청
  assert.ok(first);
  assert.equal(second, null);
  assert.equal((await db.first<any>("SELECT description FROM games WHERE id = ?", g.id)).description, '먼저');
  assert.equal((await db.first<any>("SELECT count(*) n FROM revisions")).n, 1);
});

test('super-sql: 비밀번호는 해시로만 나오고 SQL이 실제로 적용됨', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['--no-warnings', 'scripts/super-sql.ts', 'boss', "O'Neil"], {
    input: 'super secret pw\n', encoding: 'utf8', cwd: new URL('..', import.meta.url),
  });
  assert.ok(!out.includes('super secret pw'));
  const { db } = await setup();
  await db.run('DELETE FROM managers'); // 새 설치 상태
  (db as any).exec(out);
  const m = await db.first<any>("SELECT name, role FROM managers WHERE username = 'boss'");
  assert.deepEqual({ ...m }, { name: "O'Neil", role: 'super' });
});
