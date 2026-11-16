// AI 질문용 프롬프트·로그를 밖으로 내보내기 전에 비밀값과 이메일을 가린다.

export const REDACTED = '[REDACTED]';

const PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // 이메일
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, // Authorization 헤더
  /\b(?:AUTH_PEPPER|DATA_ENCRYPTION_KEY|S3_SECRET_ACCESS_KEY|S3_ACCESS_KEY_ID|CLOUDFLARE_API_TOKEN|TURNSTILE_SECRET_KEY)\s*[=:]\s*\S+/g,
  /\b[A-Za-z0-9_-]{40,}\b/g, // 긴 토큰류 (API 토큰, 키)
];

/** knownSecrets: 이번 실행에서 다룬 실제 비밀값들. 패턴에 안 걸려도 문자열 그대로 가린다. */
export function redact(text: string, knownSecrets: readonly string[] = []): string {
  let out = text;
  for (const s of knownSecrets) {
    if (s && s.length >= 6) out = out.split(s).join(REDACTED);
  }
  for (const re of PATTERNS) {
    out = out.replace(re, (m) => {
      const eq = m.search(/[=:]/);
      if (/^[A-Z_]+\s*[=:]/.test(m) && eq > 0) return m.slice(0, eq + 1) + REDACTED;
      if (/^Bearer/i.test(m)) return 'Bearer ' + REDACTED;
      return REDACTED;
    });
  }
  return out;
}
