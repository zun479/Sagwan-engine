// 외부 링크 분류. 문자열 비교(startsWith/includes)를 쓰지 않고 URL을 파싱한 뒤 hostname을 통째로 비교한다.

export type LinkClass = 'trusted' | 'untrusted' | 'blocked';

export interface TrustRule {
  /** 소문자 hostname. 정확히 같아야 한다. 하위 도메인은 따로 등록해야 한다. */
  host: string;
  /** 지정하면 경로가 이 접두사로 시작해야 한다. '/'로 끝나지 않으면 세그먼트 경계까지 확인한다. */
  pathPrefix?: string;
}

/** 엔진 기본 신뢰 목록. 위키별 추가분(공식 카페 경로 등)은 site.config에서 합친다. */
export const DEFAULT_TRUST_RULES: readonly TrustRule[] = [
  { host: 'store.steampowered.com', pathPrefix: '/app/' },
  { host: 'discord.gg' },
  { host: 'discord.com', pathPrefix: '/invite/' },
  { host: 'www.youtube.com' },
  { host: 'youtube.com' },
  { host: 'youtu.be' },
  { host: 'chzzk.naver.com' },
];

function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix.endsWith('/')) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function classifyUrl(raw: string, extraRules: readonly TrustRule[] = []): LinkClass {
  if (typeof raw !== 'string') return 'blocked';
  const trimmed = raw.trim();
  if (trimmed === '' || /[\u0000-\u001f\u007f\s]/.test(trimmed)) return 'blocked';

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return 'blocked';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'blocked'; // javascript:, data:, file: 등
  if (u.username || u.password) return 'untrusted'; // https://store.steampowered.com@evil.com 류 혼동 방지

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.port !== '') return 'untrusted';

  for (const rule of [...DEFAULT_TRUST_RULES, ...extraRules]) {
    if (rule.host.toLowerCase() !== host) continue;
    if (!rule.pathPrefix || pathMatches(u.pathname, rule.pathPrefix)) return 'trusted';
  }
  return 'untrusted';
}

/** 외부 링크에 붙일 rel 값 */
export const EXTERNAL_LINK_REL = 'noopener noreferrer nofollow ugc';
