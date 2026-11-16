import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classifyUrl, EXTERNAL_LINK_REL } from '@sagwan/shared';
import { MODULE_LABEL, MODULE_PATH } from '../api.ts';
import { Link, navigate } from '../router.tsx';
import { useSession } from '../session.tsx';

function UserMenu() {
  const { me, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const label = me ? (me.role === 'super' ? '슈퍼' : '운영자') : '게스트';
  return (
    <div className="usermenu" ref={ref}>
      <button className="userbtn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {me ? <>{me.name} <span className="role">{label}</span></> : label} ▾
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {me ? (
            <>
              <Link to="/console" onClick={() => setOpen(false)}>운영자 콘솔</Link>
              <button onClick={async () => { setOpen(false); await logout(); navigate('/'); }}>로그아웃</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)}>운영자 로그인</Link>
              <Link to="/terms" onClick={() => setOpen(false)}>이용약관</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { site } = useSession();
  if (!site) return <header className="topbar" />;
  const mods = site.modules.filter((m) => m.enabled);
  const ext = site.config.navExternalLinks.filter((l) => l.enabled && classifyUrl(l.url) !== 'blocked').sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src="/mascot.svg" alt="" width={34} height={42} />
        <span>{site.name}</span>
      </Link>
      <nav className="mainnav">
        {mods.map((m) => (
          <Link key={m.id} to={MODULE_PATH[m.id] ?? '/'}>{MODULE_LABEL[m.id] ?? m.id}</Link>
        ))}
        {ext.map((l) => (
          <a key={l.id} href={l.url} target="_blank" rel={EXTERNAL_LINK_REL}>{l.label} ↗</a>
        ))}
      </nav>
      <UserMenu />
    </header>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { site } = useSession();
  const ads = site?.config.ads.enabled ?? false;
  return (
    <>
      <Header />
      <div className={ads ? 'frame with-ads' : 'frame'}>
        {ads && <aside className="ad-rail" aria-label="광고" />}
        <main className="content">{children}</main>
        {ads && <aside className="ad-rail" aria-label="광고" />}
      </div>
      <footer className="footer">
        {site?.config.theme.footerText && <div>{site.config.theme.footerText}</div>}
        <div>
          <Link to="/terms">이용약관</Link> · <Link to="/privacy">개인정보처리방침</Link> · Sagwan Engine {site?.engine_version}
        </div>
      </footer>
    </>
  );
}
