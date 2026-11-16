// 유튜브 주소에서 영상 ID와 시작 시간만 뽑는다. 재생은 youtube-nocookie.com/embed/{id}로 한다.

export interface YouTubeRef {
  id: string;
  startSec: number;
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);

/** "3735", "1h2m15s", "62m", "45s" → 초 */
export function parseTimestamp(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseYouTube(raw: string): YouTubeRef | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let id: string | null = null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') {
    id = parts[0] ?? null;
  } else if (u.pathname === '/watch') {
    id = u.searchParams.get('v');
  } else if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0]!)) {
    id = parts[1]!;
  }
  if (!id || !ID_RE.test(id)) return null;

  const startSec = parseTimestamp(u.searchParams.get('t') ?? u.searchParams.get('start'));
  return { id, startSec };
}

export function embedUrl(ref: YouTubeRef): string {
  const q = ref.startSec > 0 ? `?start=${ref.startSec}` : '';
  return `https://www.youtube-nocookie.com/embed/${ref.id}${q}`;
}
