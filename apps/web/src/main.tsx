import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Layout } from './components/Layout.tsx';
import Console from './pages/Console.tsx';
import { GameEdit, GameHistory, GameList, GameView } from './pages/Games.tsx';
import Home from './pages/Home.tsx';
import { Leaving, Legal, Login, MemeView, Memes, NotFound, Reset, Soon } from './pages/Misc.tsx';
import { match, useLocation } from './router.tsx';
import { SessionProvider, useSession } from './session.tsx';

function Routes() {
  const { path } = useLocation();
  let p: Record<string, string> | null;
  if (path === '/') return <Home />;
  if (path === '/games') return <GameList />;
  if ((p = match('/games/:slug', path))) return <GameView slug={p.slug!} />;
  if ((p = match('/games/:slug/edit', path))) return <GameEdit slug={p.slug!} />;
  if ((p = match('/games/:slug/history', path))) return <GameHistory slug={p.slug!} />;
  if (path === '/memes') return <Memes />;
  if ((p = match('/memes/:slug', path))) return <MemeView slug={p.slug!} />;
  if (path === '/fangames') return <Soon title="팬게임 보관소" />;
  if (path === '/gallery') return <Soon title="갤러리" />;
  if (path === '/login') return <Login />;
  if (path === '/reset') return <Reset />;
  if (path === '/console') return <Console />;
  if (path === '/terms') return <Legal slug="terms" />;
  if (path === '/privacy') return <Legal slug="privacy" />;
  if (path === '/leaving') return <Leaving />;
  return <NotFound />;
}

function Themed() {
  const { site, siteError } = useSession();
  useEffect(() => {
    if (!site) return;
    const t = site.config.theme;
    const s = document.documentElement.style;
    s.setProperty('--header', t.headerColor);
    s.setProperty('--bg', t.backgroundColor);
    s.setProperty('--accent', t.accentColor);
    document.documentElement.dataset.font = t.font;
    document.documentElement.dataset.mode = t.darkMode;
  }, [site]);
  if (siteError) return <div className="fatal"><h1>위키를 열 수 없습니다</h1><p>{siteError}</p></div>;
  return (
    <Layout>
      <Routes />
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <Themed />
    </SessionProvider>
  </StrictMode>,
);
