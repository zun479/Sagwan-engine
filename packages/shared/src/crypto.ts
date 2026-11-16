// Web Crypto만 쓴다 (Workers·Node 22·브라우저 공통).

const enc = new TextEncoder();

/** Uint8Array → 독립 ArrayBuffer (TS 5.x/7.x 모두에서 BufferSource로 통과) */
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
const utf8 = (s: string): ArrayBuffer => ab(enc.encode(s));

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', utf8(text)));
}

export async function hmacSha256Hex(keyB64: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', ab(fromB64(keyB64)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, utf8(text)));
}

/** 원본 IP는 저장하지 않는다. 비밀값(AUTH_PEPPER)으로 HMAC한 값만 쓴다. */
export function hashIp(pepperB64: string, ip: string): Promise<string> {
  return hmacSha256Hex(pepperB64, 'ip:' + ip.trim().toLowerCase());
}

/** 이메일 조회용 해시 (복호화 불가) */
export function hashAuthRef(pepperB64: string, email: string): Promise<string> {
  return hmacSha256Hex(pepperB64, 'email:' + email.trim().toLowerCase());
}

export async function aesEncrypt(keyB64: string, plain: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', ab(fromB64(keyB64)), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ab(iv) }, key, utf8(plain));
  return toB64(iv) + '.' + toB64(ct);
}

export async function aesDecrypt(keyB64: string, packed: string): Promise<string> {
  const [ivB64, ctB64] = packed.split('.');
  if (!ivB64 || !ctB64) throw new Error('bad ciphertext');
  const key = await crypto.subtle.importKey('raw', ab(fromB64(keyB64)), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(fromB64(ivB64)) }, key, ab(fromB64(ctB64)));
  return new TextDecoder().decode(pt);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  return user.slice(0, 2) + '***@' + domain;
}

/**
 * 비밀번호 해시: PBKDF2-SHA256.
 * Cloudflare Workers의 Web Crypto는 PBKDF2 반복 횟수 상한이 100,000이라 기본값을 정확히 100,000으로 둔다.
 * 형식: pbkdf2$sha256$<반복>$<솔트b64>$<해시b64>
 */
export const PBKDF2_ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', utf8(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: ab(salt), iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (password.length < 10) throw new Error('비밀번호는 10자 이상이어야 합니다');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${toB64(salt)}$${toB64(h)}`;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  const h = await pbkdf2(password, fromB64(parts[3]!), iterations);
  return constantTimeEqual(h, fromB64(parts[4]!));
}
