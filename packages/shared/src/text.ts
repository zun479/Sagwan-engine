// 퀴즈 정답 비교와 금칙어 검사에 쓰는 문자열 정규화.

const INVISIBLE = /[​-‍⁠﻿­]/g;

/** 퀴즈 정답용: NFC, 소문자, 공백·문장부호·기호 제거 */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

export function isCorrectAnswer(input: string, answers: readonly string[]): boolean {
  const n = normalizeAnswer(input);
  if (n === '') return false;
  return answers.some((a) => normalizeAnswer(a) === n);
}

/** 금칙어용: NFKC(전각·호환 문자 통일) 후 같은 정규화. "ㅅ ㅂ", "ｓｐａｍ", "s.p.a.m" 같은 우회를 줄인다. */
export function normalizeForFilter(s: string): string {
  return normalizeAnswer(s.normalize('NFKC'));
}

/** 본문에 들어 있는 첫 금칙어를 돌려준다. 없으면 null. words는 DB에 정규화된 형태로 저장된 값. */
export function findBannedWord(text: string, words: readonly string[]): string | null {
  const hay = normalizeForFilter(text);
  for (const w of words) {
    const needle = normalizeForFilter(w);
    if (needle !== '' && hay.includes(needle)) return w;
  }
  return null;
}

/** 슬러그: 소문자, 공백→하이픈, 한글 허용, 그 외 기호 제거 */
export function slugify(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
