import type { SiteConfig } from '@sagwan/shared';

export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'x-sagwan': '1' } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } & Record<string, unknown> };
  if (!res.ok) {
    const e = data.error ?? { code: 'NETWORK', message: '서버에 연결할 수 없습니다.' };
    const { code, message, ...extra } = e;
    throw new ApiError(res.status, code, message, extra);
  }
  return data as T;
}

export interface Site {
  name: string;
  config: SiteConfig;
  modules: { id: string; enabled: boolean }[];
  terms_version: string;
  engine_version: string;
}

export interface Me {
  id: number;
  name: string;
  role: 'super' | 'manager';
  username: string;
}

export interface GameSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  released: string;
  platforms: string;
  genre: string | null;
  status: 'pending' | 'verified' | 'hidden';
  current_revision_id: number | null;
}

export interface GameDetail extends GameSummary {
  tags: string[];
  play: { first_played_at: number | null; comment: string; videos: { youtube_id: string; start_sec: number; title: string }[] } | null;
  links: { kind: string; url: string; label: string; link_class: 'trusted' | 'untrusted' }[];
  memes: { slug: string; title: string }[];
}

export const MODULE_LABEL: Record<string, string> = {
  games: '플레이한 게임 DB',
  memes: '밈 DB',
  fangames: '팬게임 보관소',
  gallery: '갤러리',
};

export const MODULE_PATH: Record<string, string> = {
  games: '/games',
  memes: '/memes',
  fangames: '/fangames',
  gallery: '/gallery',
};

export const fmtDate = (sec: number | null) => (sec ? new Date(sec * 1000).toLocaleDateString('ko-KR') : '');
export const fmtTime = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR');
