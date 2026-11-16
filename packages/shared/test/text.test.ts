import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCorrectAnswer, findBannedWord, slugify } from '../src/text.ts';

test('퀴즈 정답: 공백·문장부호·대소문자 흔들림 허용', () => {
  const answers = ['한 칸만 더', 'One More'];
  assert.equal(isCorrectAnswer('한칸만더', answers), true);
  assert.equal(isCorrectAnswer('  한 칸만 더!! ', answers), true);
  assert.equal(isCorrectAnswer('one-more', answers), true);
  assert.equal(isCorrectAnswer('두 칸만 더', answers), false);
  assert.equal(isCorrectAnswer('', answers), false);
  assert.equal(isCorrectAnswer('!!!', answers), false);
});

test('퀴즈 정답: 한글 자모 분해(NFD) 입력도 같게 본다', () => {
  assert.equal(isCorrectAnswer('곰돌이'.normalize('NFD'), ['곰돌이']), true);
});

test('금칙어: 띄어쓰기·전각·기호·숨은 문자 우회를 잡는다', () => {
  const words = ['스팸광고'];
  assert.equal(findBannedWord('여기 스 팸 광 고 있음', words), '스팸광고');
  assert.equal(findBannedWord('스.팸.광.고', words), '스팸광고');
  assert.equal(findBannedWord('스​팸광고', words), '스팸광고');
  assert.equal(findBannedWord('ＳＰＡＭ', ['spam']), 'spam');
  assert.equal(findBannedWord('평범한 문장', words), null);
});

test('슬러그', () => {
  assert.equal(slugify('Getting Over It!'), 'getting-over-it');
  assert.equal(slugify('  한 칸만 더  '), '한-칸만-더');
});
