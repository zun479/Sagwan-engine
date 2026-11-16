// 작은 클라이언트 라우터 (의존성 없음)
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener('popstate', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('popstate', fn);
  };
};

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

export function useLocation() {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  const search = useSyncExternalStore(subscribe, () => location.search);
  return { path, query: new URLSearchParams(search) };
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(b[i]!);
    else if (p !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}
