import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyUrl } from '../src/url.ts';

const cafe = [{ host: 'cafe.naver.com', pathPrefix: '/moraegom' }];

test('신뢰 목록 정상 주소', () => {
  assert.equal(classifyUrl('https://store.steampowered.com/app/240720/'), 'trusted');
  assert.equal(classifyUrl('https://discord.gg/abc123'), 'trusted');
  assert.equal(classifyUrl('https://discord.com/invite/abc123'), 'trusted');
  assert.equal(classifyUrl('https://cafe.naver.com/moraegom', cafe), 'trusted');
  assert.equal(classifyUrl('https://cafe.naver.com/moraegom/123', cafe), 'trusted');
  assert.equal(classifyUrl('HTTPS://STORE.STEAMPOWERED.COM/app/1'), 'trusted');
});

test('가짜 도메인은 신뢰하지 않는다', () => {
  assert.equal(classifyUrl('https://store.steampowered.com.evil.com/app/1'), 'untrusted');
  assert.equal(classifyUrl('https://evilstore.steampowered.com/app/1'), 'untrusted');
  assert.equal(classifyUrl('https://store-steampowered.com/app/1'), 'untrusted');
  assert.equal(classifyUrl('https://discord.gg.evil.com/x'), 'untrusted');
  assert.equal(classifyUrl('https://xn--discrd-3ya.gg/x'), 'untrusted');
});

test('사용자 정보로 위장한 주소', () => {
  assert.equal(classifyUrl('https://store.steampowered.com@evil.com/app/1'), 'untrusted');
  assert.equal(classifyUrl('https://user:pw@store.steampowered.com/app/1'), 'untrusted');
});

test('경로 조건', () => {
  assert.equal(classifyUrl('https://store.steampowered.com/news/'), 'untrusted');
  assert.equal(classifyUrl('https://discord.com/channels/1/2'), 'untrusted');
  // 아무 카페나 신뢰하지 않는다
  assert.equal(classifyUrl('https://cafe.naver.com/othercafe', cafe), 'untrusted');
  // 접두사만 같은 다른 카페
  assert.equal(classifyUrl('https://cafe.naver.com/moraegomfake', cafe), 'untrusted');
});

test('단축 URL과 포트', () => {
  assert.equal(classifyUrl('https://bit.ly/3xYz'), 'untrusted');
  assert.equal(classifyUrl('https://store.steampowered.com:8443/app/1'), 'untrusted');
});

test('위험한 스킴과 깨진 입력은 차단', () => {
  assert.equal(classifyUrl('javascript:alert(1)'), 'blocked');
  assert.equal(classifyUrl('JaVaScRiPt:alert(1)'), 'blocked');
  assert.equal(classifyUrl('data:text/html,<script>1</script>'), 'blocked');
  assert.equal(classifyUrl('file:///etc/passwd'), 'blocked');
  assert.equal(classifyUrl('not a url'), 'blocked');
  assert.equal(classifyUrl(''), 'blocked');
  assert.equal(classifyUrl('https://exa mple.com'), 'blocked');
});

test('끝 점이 붙은 호스트도 같은 호스트로 본다', () => {
  assert.equal(classifyUrl('https://store.steampowered.com./app/1'), 'trusted');
});
