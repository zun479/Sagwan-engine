import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, hashIp, hashAuthRef, aesEncrypt, aesDecrypt, maskEmail, toB64, PBKDF2_ITERATIONS,
} from '../src/crypto.ts';
import { GENESIS, chainHash, verifyChain, type AuditRow } from '../src/auditChain.ts';
import { redact, REDACTED } from '../src/redact.ts';

const key = toB64(new Uint8Array(32).fill(7));

test('비밀번호: 맞으면 통과, 틀리면 실패, 반복 횟수는 Workers 상한', async () => {
  const h = await hashPassword('correct horse battery');
  assert.match(h, new RegExp(`^pbkdf2\\$sha256\\$${PBKDF2_ITERATIONS}\\$`));
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('correct horse batterx', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  // 상한보다 큰 반복 횟수가 저장된 값은 거부 (DoS 방지)
  const tampered = h.replace(`$${PBKDF2_ITERATIONS}$`, '$9999999$');
  assert.equal(await verifyPassword('correct horse battery', tampered), false);
});

test('비밀번호: 너무 짧으면 거부', async () => {
  await assert.rejects(() => hashPassword('short'));
});

test('IP·이메일 해시는 같은 입력에 같은 값, 원문이 드러나지 않음', async () => {
  const a = await hashIp(key, '203.0.113.7');
  assert.equal(a, await hashIp(key, ' 203.0.113.7 '));
  assert.notEqual(a, await hashIp(key, '203.0.113.8'));
  assert.equal(a.includes('203'), false);
  assert.equal(await hashAuthRef(key, 'Me@Example.com'), await hashAuthRef(key, 'me@example.com'));
});

test('AES-256-GCM 왕복과 마스킹', async () => {
  const c = await aesEncrypt(key, 'zorius@gmail.com');
  assert.equal(c.includes('zorius'), false);
  assert.equal(await aesDecrypt(key, c), 'zorius@gmail.com');
  assert.equal(maskEmail('zorius@gmail.com'), 'zo***@gmail.com');
});

async function buildChain(n: number): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const e = { actor_manager_id: i % 2, action: 'test_' + i, target_info: 't' + i, detail_json: '{}', created_at: 1000 + i };
    const hash = await chainHash(prev, e);
    rows.push({ id: i, ...e, prev_hash: prev, hash });
    prev = hash;
  }
  return rows;
}

test('감사 로그 해시 체인: 정상', async () => {
  const rows = await buildChain(5);
  const r = await verifyChain(rows);
  assert.equal(r.ok, true);
  assert.equal(r.checked, 5);
  assert.equal(r.head, rows[4]!.hash);
});

test('감사 로그 해시 체인: 중간 행 수정·삭제를 잡는다', async () => {
  const rows = await buildChain(5);
  const edited = rows.map((r) => (r.id === 3 ? { ...r, target_info: '조작됨' } : r));
  assert.deepEqual(await verifyChain(edited).then((x) => [x.ok, x.brokenAtId, x.reason]), [false, 3, 'hash_mismatch']);
  const deleted = rows.filter((r) => r.id !== 2);
  assert.deepEqual(await verifyChain(deleted).then((x) => [x.ok, x.brokenAtId, x.reason]), [false, 3, 'prev_mismatch']);
});

test('프롬프트 마스킹: 이메일·토큰·환경변수·알려진 비밀값', () => {
  const secret = 'S3cretValueXYZ';
  const out = redact(
    [
      'operator zorius@gmail.com failed',
      'Authorization: Bearer abcdefghijklmnop',
      'AUTH_PEPPER=c29tZXRoaW5nc2VjcmV0',
      'token: ' + 'a'.repeat(48),
      'raw secret ' + secret,
      'Error: Authentication error [code: 10000]',
    ].join('\n'),
    [secret],
  );
  assert.equal(out.includes('zorius'), false);
  assert.equal(out.includes('abcdefghijklmnop'), false);
  assert.equal(out.includes('c29tZXRoaW5nc2VjcmV0'), false);
  assert.equal(out.includes('a'.repeat(48)), false);
  assert.equal(out.includes(secret), false);
  assert.ok(out.includes('AUTH_PEPPER=' + REDACTED));
  assert.ok(out.includes('[code: 10000]'), '평범한 오류 문구는 남는다');
});
