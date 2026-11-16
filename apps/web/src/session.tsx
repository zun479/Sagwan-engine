import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Me, type Site } from './api.ts';

interface Session {
  site: Site | null;
  siteError: string | null;
  me: Me | null;
  reloadSite(): Promise<void>;
  reloadMe(): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<Site | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const reloadSite = useCallback(async () => {
    try {
      setSite(await api<Site>('/api/site'));
      setSiteError(null);
    } catch (e) {
      setSiteError(e instanceof ApiError ? e.message : '위키 정보를 불러오지 못했습니다.');
    }
  }, []);

  const reloadMe = useCallback(async () => {
    try {
      setMe((await api<{ manager: Me | null }>('/api/auth/me')).manager);
    } catch {
      setMe(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    setMe(null);
  }, []);

  useEffect(() => {
    void reloadSite();
    void reloadMe();
  }, [reloadSite, reloadMe]);

  useEffect(() => {
    if (site) document.title = site.name;
  }, [site]);

  return <Ctx.Provider value={{ site, siteError, me, reloadSite, reloadMe, logout }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}
