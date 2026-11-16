import { useEffect, useState } from 'react';
import { EXTERNAL_LINK_REL, classifyUrl } from '@sagwan/shared';
import { api, ApiError } from '../api.ts';
import { Link, navigate, useLocation } from '../router.tsx';
import { useSession } from '../session.tsx';

export function Memes() {
  const [items, setItems] = useState<{ slug: string; title: string; description: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: typeof items }>('/api/memes').then((d) => setItems(d.items), (e) => setError(e instanceof ApiError ? e.message : '불러오지 못했습니다.')); }, []);
  return (
    <section>
      <h1>밈 DB</h1>
      {error && <p className="error">{error}</p>}
      <ul className="meme-list">
        {items?.map((m) => (
          <li key={m.slug}><Link to={`/memes/${m.slug}`}><strong>{m.title}</strong></Link><p className="muted">{m.description}</p></li>
        ))}
      </ul>
    </section>
  );
}

export function MemeView({ slug }: { slug: string }) {
  const [m, setM] = useState<{ title: string; description: string; games: { slug: string; title: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<NonNullable<typeof m>>(`/api/memes/${encodeURIComponent(slug)}`).then(setM, (e) => setError(e instanceof ApiError ? e.message : '불러오지 못했습니다.')); }, [slug]);
  if (error) return <p className="error">{error}</p>;
  if (!m) return <p className="muted">불러오는 중…</p>;
  return (
    <article className="doc">
      <h1>{m.title}</h1>
      <p className="prose">{m.description}</p>
      {m.games.length > 0 && <p>관련 게임: {m.games.map((g, i) => <span key={g.slug}>{i > 0 && ', '}<Link to={`/games/${g.slug}`}>{g.title}</Link></span>)}</p>}
    </article>
  );
}

export function Login() {
  const { reloadMe } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { username, password } });
      await reloadMe();
      navigate('/console');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '로그인하지 못했습니다.');
    }
  };
  return (
    <form className="narrow" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h1>운영자 로그인</h1>
      <p className="muted">일반 편집에는 로그인이 필요 없습니다. 운영자 계정은 이 위키에서만 쓰입니다.</p>
      <label>아이디<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
      <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary">로그인</button>
      <p className="muted small">비밀번호를 잊었다면 슈퍼 운영자에게 재설정 링크를 요청하세요.</p>
    </form>
  );
}

export function Reset() {
  // 토큰은 URL 조각(#)으로만 온다. 읽자마자 주소창에서 지운다.
  const [token] = useState(() => location.hash.slice(1));
  useEffect(() => { if (location.hash) history.replaceState(null, '', '/reset'); }, []);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [state, setState] = useState<'idle' | 'done' | string>('idle');
  const submit = async () => {
    if (pw.length < 10) return setState('비밀번호는 10자 이상이어야 합니다.');
    if (pw !== pw2) return setState('두 비밀번호가 다릅니다.');
    try {
      await api('/api/auth/reset', { method: 'POST', body: { token, password: pw } });
      setState('done');
    } catch (e) {
      setState(e instanceof ApiError ? e.message : '바꾸지 못했습니다.');
    }
  };
  if (!token) return <p className="error">재설정 링크가 올바르지 않습니다. 슈퍼 운영자에게 새 링크를 요청하세요.</p>;
  if (state === 'done') return <div className="narrow"><h1>비밀번호를 바꿨습니다</h1><p>다른 기기의 로그인은 모두 끊겼습니다.</p><Link to="/login">로그인하기</Link></div>;
  return (
    <form className="narrow" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h1>새 비밀번호 설정</h1>
      <p className="muted">이 링크는 한 번만 쓸 수 있고 24시간 뒤 만료됩니다.</p>
      <label>새 비밀번호 (10자 이상)<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
      <label>한 번 더<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
      {state !== 'idle' && <p className="error">{state}</p>}
      <button className="primary">바꾸기</button>
    </form>
  );
}

export function Legal({ slug }: { slug: 'terms' | 'privacy' }) {
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBody(null); api<{ body: string }>(`/api/legal/${slug}`).then((d) => setBody(d.body), (e) => setError(e instanceof ApiError ? e.message : '불러오지 못했습니다.')); }, [slug]);
  return (
    <article className="doc">
      <h1>{slug === 'terms' ? '이용약관' : '개인정보처리방침'}</h1>
      {error && <p className="muted">{error}</p>}
      {/* 마크다운 원문을 텍스트로 보여준다. HTML로 해석하지 않는다. */}
      {body && <pre className="legal">{body}</pre>}
    </article>
  );
}

/** 신뢰 목록 밖 링크는 이 경고 화면을 거친다. */
export function Leaving() {
  const { query } = useLocation();
  const to = query.get('to') ?? '';
  const cls = classifyUrl(to);
  if (cls === 'blocked') return <p className="error">열 수 없는 주소입니다.</p>;
  let host = '';
  try { host = new URL(to).host; } catch { /* blocked에서 걸러짐 */ }
  return (
    <div className="narrow notice">
      <h1>외부 사이트로 이동합니다</h1>
      <p>이 링크는 위키가 확인하지 않은 주소입니다. 계정 정보나 비밀번호를 입력하지 마세요.</p>
      <p><strong>{host}</strong></p>
      <p className="muted small break">{to}</p>
      <div className="row">
        <a className="button primary" href={to} rel={EXTERNAL_LINK_REL} target="_blank">이동</a>
        <button onClick={() => history.back()}>돌아가기</button>
      </div>
    </div>
  );
}

export function Soon({ title }: { title: string }) {
  return <section><h1>{title}</h1><p className="muted">이 기능은 다음 단계에서 열립니다.</p></section>;
}

export function NotFound() {
  return <section><h1>없는 페이지</h1><Link to="/">메인으로</Link></section>;
}
