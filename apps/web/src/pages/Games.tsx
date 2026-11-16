import { useEffect, useState } from 'react';
import { EXTERNAL_LINK_REL, embedUrl } from '@sagwan/shared';
import { api, ApiError, fmtDate, fmtTime, type GameDetail, type GameSummary } from '../api.ts';
import { Link, navigate, useLocation } from '../router.tsx';
import { useSession } from '../session.tsx';

const STATUS: Record<string, string> = { pending: '검증 전', verified: '검증됨', hidden: '숨김' };
const FIELD: Record<string, string> = { description: '설명', released: '출시', platforms: '플랫폼' };

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError(null);
    api<T>(path).then((d) => live && setData(d), (e: unknown) => live && setError(e instanceof ApiError ? e.message : '불러오지 못했습니다.'));
    return () => { live = false; };
  }, [path, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

export function GameList() {
  const { query } = useLocation();
  const q = query.get('q') ?? '';
  const [input, setInput] = useState(q);
  const { data, error } = useLoad<{ items: GameSummary[] }>(`/api/games?q=${encodeURIComponent(q)}`);
  return (
    <section>
      <h1>플레이한 게임 DB</h1>
      <form className="search" onSubmit={(e) => { e.preventDefault(); navigate(`/games?q=${encodeURIComponent(input.trim())}`); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="게임 이름이나 설명으로 찾기" aria-label="검색" />
        <button>찾기</button>
      </form>
      {error && <p className="error">{error}</p>}
      {data && !data.items.length && <p className="muted">찾는 게임이 없습니다.</p>}
      <table className="table">
        <thead><tr><th>게임</th><th>장르</th><th>출시</th><th>상태</th></tr></thead>
        <tbody>
          {data?.items.map((g) => (
            <tr key={g.id}>
              <td><Link to={`/games/${g.slug}`}>{g.title}</Link></td>
              <td>{g.genre ?? ''}</td>
              <td>{g.released}</td>
              <td><span className={`badge ${g.status}`}>{STATUS[g.status]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function GameView({ slug }: { slug: string }) {
  const { data: g, error } = useLoad<GameDetail>(`/api/games/${encodeURIComponent(slug)}`);
  if (error) return <p className="error">{error}</p>;
  if (!g) return <p className="muted">불러오는 중…</p>;
  return (
    <article className="doc">
      <div className="doc-head">
        <h1>{g.title} <span className={`badge ${g.status}`}>{STATUS[g.status]}</span></h1>
        <div className="doc-actions">
          <Link to={`/games/${g.slug}/edit`}>편집</Link>
          <Link to={`/games/${g.slug}/history`}>기록</Link>
        </div>
      </div>
      <dl className="facts">
        <dt>장르</dt><dd>{g.genre ?? '-'}</dd>
        <dt>출시</dt><dd>{g.released || '-'}</dd>
        <dt>플랫폼</dt><dd>{g.platforms || '-'}</dd>
        <dt>태그</dt><dd>{g.tags.join(', ') || '-'}</dd>
        {g.play && <><dt>첫 방송</dt><dd>{fmtDate(g.play.first_played_at) || '-'}</dd></>}
      </dl>
      <p className="prose">{g.description || '아직 설명이 없습니다.'}</p>
      {g.play?.comment && <blockquote>{g.play.comment}</blockquote>}
      {g.play && g.play.videos.length > 0 && (
        <section>
          <h2>다시보기</h2>
          <div className="videos">
            {g.play.videos.map((v) => (
              <figure key={v.youtube_id + v.start_sec}>
                <iframe src={embedUrl({ id: v.youtube_id, startSec: v.start_sec })} title={v.title || g.title} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                {v.title && <figcaption>{v.title}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}
      {g.links.length > 0 && (
        <section>
          <h2>링크</h2>
          <ul>
            {g.links.map((l) => (
              <li key={l.url}>
                {l.link_class === 'trusted'
                  ? <a href={l.url} target="_blank" rel={EXTERNAL_LINK_REL}>{l.label || l.url} ↗</a>
                  : <Link to={`/leaving?to=${encodeURIComponent(l.url)}`}>{l.label || l.url} ↗ <span className="muted">(확인 후 이동)</span></Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {g.memes.length > 0 && (
        <section>
          <h2>이 게임에서 나온 밈</h2>
          <ul>{g.memes.map((m) => <li key={m.slug}><Link to={`/memes/${m.slug}`}>{m.title}</Link></li>)}</ul>
        </section>
      )}
    </article>
  );
}

type Fields = { description: string; released: string; platforms: string };

export function GameEdit({ slug }: { slug: string }) {
  const { site } = useSession();
  const { data: g, error, reload } = useLoad<GameDetail>(`/api/games/${encodeURIComponent(slug)}`);
  const [draft, setDraft] = useState<Fields | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [summary, setSummary] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'conflict'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (g && draft === null) {
      setDraft({ description: g.description, released: g.released, platforms: g.platforms });
      setBase(g.current_revision_id);
    }
  }, [g, draft]);

  if (error) return <p className="error">{error}</p>;
  if (!g || !draft || !site) return <p className="muted">불러오는 중…</p>;

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/games/${encodeURIComponent(slug)}/edit`, {
        method: 'POST',
        body: { base_revision_id: base, fields: draft, summary, terms_version: site.terms_version },
      });
      navigate(`/games/${slug}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EDIT_CONFLICT') {
        setMsg({ kind: 'conflict', text: e.message });
      } else if (e instanceof ApiError && e.code === 'BANNED') {
        const until = typeof e.extra.until === 'number' ? `${fmtTime(e.extra.until)}까지` : '기한 없음';
        setMsg({ kind: 'error', text: `${e.message} 사유: ${String(e.extra.reason ?? '')} (${until})` });
      } else {
        setMsg({ kind: 'error', text: e instanceof ApiError ? e.message : '저장하지 못했습니다.' });
      }
    } finally {
      setBusy(false);
    }
  };

  // 충돌 시: 내 초안은 그대로 두고 최신 내용을 옆에 보여준 뒤, 기준 리비전만 최신으로 옮긴다.
  const takeLatest = () => {
    reload();
    setBase(g.current_revision_id);
    setMsg(null);
  };

  return (
    <section className="edit">
      <h1>{g.title} 편집</h1>
      {msg?.kind === 'conflict' && (
        <div className="notice conflict">
          <p>{msg.text}</p>
          <details open>
            <summary>지금 저장된 내용</summary>
            <p className="prose">{g.description}</p>
            <p className="muted">출시 {g.released} · 플랫폼 {g.platforms}</p>
          </details>
          <button onClick={takeLatest}>최신 내용 확인함 — 내 초안을 이어서 저장</button>
        </div>
      )}
      <label>출시<input value={draft.released} onChange={set('released')} maxLength={200} /></label>
      <label>플랫폼<input value={draft.platforms} onChange={set('platforms')} maxLength={200} /></label>
      <label>설명<textarea rows={12} value={draft.description} onChange={set('description')} maxLength={20000} /></label>
      <label>편집 요약<input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder="무엇을 고쳤는지 짧게" /></label>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          <Link to="/terms" target="_blank">기여 약관</Link>(버전 {site.terms_version})에 동의합니다. 내 편집은 이 위키의 현재 라이선스로 공개되고, IP는 해시로만 기록됩니다.
        </span>
      </label>
      {msg?.kind === 'error' && <p className="error">{msg.text}</p>}
      <div className="row">
        <button className="primary" disabled={!agreed || busy || msg?.kind === 'conflict'} onClick={save}>저장</button>
        <Link to={`/games/${slug}`}>취소</Link>
      </div>
    </section>
  );
}

export function GameHistory({ slug }: { slug: string }) {
  const { me } = useSession();
  const { data, error } = useLoad<{ items: { id: number; changed_fields: string[]; summary: string; ip_hash: string; manager_id: number | null; created_at: number }[] }>(`/api/games/${encodeURIComponent(slug)}/history`);
  if (error) return <p className="error">{error}</p>;
  return (
    <section>
      <h1>편집 기록</h1>
      <p><Link to={`/games/${slug}`}>← 문서로</Link></p>
      <table className="table">
        <thead><tr><th>#</th><th>시각</th><th>바뀐 항목</th><th>요약</th><th>편집자</th></tr></thead>
        <tbody>
          {data?.items.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{fmtTime(r.created_at)}</td>
              <td className="changed">{r.changed_fields.map((f) => FIELD[f] ?? f).join(', ')}</td>
              <td>{r.summary}</td>
              <td>
                <code title={r.ip_hash}>{r.manager_id ? `운영자 #${r.manager_id}` : r.ip_hash.slice(0, 8)}</code>
                {me && !r.manager_id && <> <Link className="small" to={`/console?tab=bans&ip=${r.ip_hash}`}>차단</Link></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
