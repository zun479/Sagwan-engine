// 운영자 콘솔: 백업 받기, 재설정 링크, IP 차단, 금칙어, 감사 로그, 메인 꾸미기
import { useCallback, useEffect, useState } from 'react';
import type { HomeLayout, SiteConfig } from '@sagwan/shared';
import { api, ApiError, fmtTime, type Site } from '../api.ts';
import { navigate, useLocation } from '../router.tsx';
import { useSession } from '../session.tsx';
import { HomeView } from './Home.tsx';

type Tab = 'backup' | 'managers' | 'bans' | 'words' | 'audit' | 'home';
const TABS: { id: Tab; label: string; superOnly?: boolean }[] = [
  { id: 'home', label: '메인 꾸미기' },
  { id: 'bans', label: '차단' },
  { id: 'words', label: '금칙어' },
  { id: 'audit', label: '감사 로그' },
  { id: 'managers', label: '운영자' },
  { id: 'backup', label: '백업 받기' },
];

const errText = (e: unknown) => (e instanceof ApiError ? e.message : '요청하지 못했습니다.');

function Backup() {
  const [state, setState] = useState<string | null>(null);
  const download = async () => {
    setState('만드는 중…');
    try {
      const res = await fetch('/api/admin/backup', { credentials: 'same-origin' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'sagwan-backup.json';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setState(`${name} 저장됨`);
    } catch {
      setState('백업을 받지 못했습니다.');
    }
  };
  return (
    <div>
      <p>위키의 문서·기록·설정을 JSON 파일 하나로 내려받습니다. 받은 파일은 직접 보관하세요. Wiki Hub는 위키 파일을 갖고 있지 않습니다.</p>
      <ul className="muted">
        <li><strong>운영자 계정은 포함되지 않습니다</strong> (아이디, 비밀번호 해시, 이메일, 로그인 세션, 재설정 링크, 운영자 투표).</li>
        <li>감사 로그에는 운영자가 번호(#1, #2…)로만 남습니다.</li>
        <li>이미지·음원 파일은 저장소 버킷에 따로 있습니다.</li>
      </ul>
      <button className="primary" onClick={download}>백업 받기</button>
      {state && <p className="muted">{state}</p>}
    </div>
  );
}

function Managers({ isSuper }: { isSuper: boolean }) {
  const [items, setItems] = useState<{ id: number; name: string; role: string; last_active_at: number }[]>([]);
  const [link, setLink] = useState<{ id: number; url: string; expires_at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ items: typeof items }>('/api/admin/managers').then((d) => setItems(d.items), (e) => setError(errText(e))); }, []);
  const make = async (id: number) => {
    try {
      const r = await api<{ path: string; expires_at: number }>(`/api/admin/managers/${id}/reset-link`, { method: 'POST', body: {} });
      setLink({ id, url: location.origin + r.path, expires_at: r.expires_at });
    } catch (e) { setError(errText(e)); }
  };
  return (
    <div>
      <table className="table">
        <thead><tr><th>#</th><th>이름</th><th>역할</th><th>마지막 활동</th>{isSuper && <th />}</tr></thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td>{m.id}</td><td>{m.name}</td><td>{m.role === 'super' ? '슈퍼' : '운영자'}</td><td>{m.last_active_at ? fmtTime(m.last_active_at) : '-'}</td>
              {isSuper && <td><button onClick={() => make(m.id)}>재설정 링크 만들기</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {link && (
        <div className="notice">
          <p><strong>운영자 #{link.id}</strong>에게 이 링크를 디스코드 등으로 직접 전달하세요. 한 번만 쓸 수 있고 {fmtTime(link.expires_at)}에 만료됩니다. 이 창을 닫으면 다시 볼 수 없습니다.</p>
          <div className="row"><input readOnly value={link.url} onFocus={(e) => e.target.select()} /><button onClick={() => navigator.clipboard.writeText(link.url)}>복사</button></div>
        </div>
      )}
      {!isSuper && <p className="muted small">재설정 링크는 슈퍼 운영자만 만들 수 있습니다.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Bans({ prefill }: { prefill: string }) {
  const [items, setItems] = useState<{ id: number; ip_hash: string; reason: string; expires_at: number | null; created_at: number }[]>([]);
  const [form, setForm] = useState({ ip_hash: prefill, reason: '', days: '7' });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<{ items: typeof items }>('/api/admin/bans').then((d) => setItems(d.items), (e) => setError(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    setError(null);
    try {
      await api('/api/admin/bans', { method: 'POST', body: { ip_hash: form.ip_hash.trim(), reason: form.reason, days: form.days ? Number(form.days) : null } });
      setForm({ ip_hash: '', reason: '', days: '7' });
      await load();
    } catch (e) { setError(errText(e)); }
  };
  const lift = async (id: number) => { await api(`/api/admin/bans/${id}`, { method: 'DELETE' }).catch((e) => setError(errText(e))); await load(); };
  return (
    <div>
      <p className="muted">원본 IP는 저장되지 않습니다. 편집 기록의 [차단]을 누르면 그 편집자의 해시(64자)가 채워집니다. 모든 차단은 감사 로그에 남습니다.</p>
      <div className="form-grid">
        <label>IP 해시<input value={form.ip_hash} onChange={(e) => setForm({ ...form, ip_hash: e.target.value })} placeholder="64자 해시" /></label>
        <label>사유 (필수)<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={300} /></label>
        <label>기간(일, 비우면 영구)<input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, '') })} /></label>
        <button className="primary" disabled={!form.reason.trim() || form.ip_hash.trim().length !== 64} onClick={add}>차단</button>
      </div>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead><tr><th>#</th><th>대상</th><th>사유</th><th>풀리는 때</th><th /></tr></thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id}><td>{b.id}</td><td><code title={b.ip_hash}>{b.ip_hash.slice(0, 8)}</code></td><td>{b.reason}</td><td>{b.expires_at ? fmtTime(b.expires_at) : '영구'}</td><td><button onClick={() => lift(b.id)}>해제</button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Words() {
  const [items, setItems] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<{ items: string[] }>('/api/admin/banned-words').then((d) => setItems(d.items), (e) => setError(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <p className="muted">공백·특수문자·전각·숨은 문자를 빼고 비교합니다. 예: “스 팸”, “ｓｐａｍ”도 걸립니다.</p>
      <div className="row">
        <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={50} placeholder="추가할 단어" />
        <button className="primary" disabled={!word.trim()} onClick={async () => { await api('/api/admin/banned-words', { method: 'POST', body: { word } }).catch((e) => setError(errText(e))); setWord(''); await load(); }}>추가</button>
      </div>
      {error && <p className="error">{error}</p>}
      <ul className="chips">
        {items.map((w) => <li key={w}>{w} <button aria-label={`${w} 삭제`} onClick={async () => { await api(`/api/admin/banned-words/${encodeURIComponent(w)}`, { method: 'DELETE' }); await load(); }}>×</button></li>)}
      </ul>
    </div>
  );
}

function Audit() {
  const [items, setItems] = useState<{ id: number; actor_manager_id: number | null; action: string; target_info: string; created_at: number; hash: string }[]>([]);
  const [check, setCheck] = useState<{ ok: boolean; checked: number; brokenAtId?: number; head: string } | null>(null);
  useEffect(() => { void api<{ items: typeof items }>('/api/admin/audit').then((d) => setItems(d.items)); }, []);
  return (
    <div>
      <p className="muted">슈퍼 운영자는 기술적으로 무엇이든 할 수 있습니다. 감사 로그는 그것을 막는 장치가 아니라 <strong>드러내는 장치</strong>입니다. 각 줄은 앞줄의 해시를 품고 있어 중간을 고치거나 지우면 검증에서 드러나고, 매일 공개 사본이 저장소에 내보내집니다.</p>
      <button onClick={async () => setCheck(await api('/api/admin/audit/verify'))}>체인 검증</button>
      {check && (
        <p className={check.ok ? 'ok' : 'error'}>
          {check.ok ? `정상: ${check.checked}줄 확인, 마지막 해시 ${check.head.slice(0, 12)}…` : `#${check.brokenAtId}번 줄부터 기록이 어긋났습니다.`}
        </p>
      )}
      <table className="table">
        <thead><tr><th>#</th><th>시각</th><th>운영자</th><th>행동</th><th>대상</th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}><td>{a.id}</td><td>{fmtTime(a.created_at)}</td><td>{a.actor_manager_id ? `#${a.actor_manager_id}` : '-'}</td><td><code>{a.action}</code></td><td>{a.target_info}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LAYOUTS: { id: HomeLayout; label: string }[] = [
  { id: 'diagonal', label: '대각선 큰 버튼' },
  { id: 'tiles', label: '정사각 타일' },
  { id: 'cards', label: '설명 카드' },
  { id: 'list', label: '목록' },
  { id: 'hero', label: '큰 배너 + 버튼 줄' },
];

function HomeDesigner({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const [home, setHome] = useState(site.config.theme.home);
  const [headerColor, setHeaderColor] = useState(site.config.theme.headerColor);
  const [msg, setMsg] = useState<string | null>(null);
  const preview: Site = { ...site, config: { ...site.config, theme: { ...site.config.theme, headerColor, home } } };
  const save = async () => {
    try {
      const theme: Partial<SiteConfig['theme']> = { headerColor, home };
      await api('/api/admin/site/config', { method: 'PUT', body: { config: { theme } } });
      setMsg('저장했습니다.');
      onSaved();
    } catch (e) { setMsg(errText(e)); }
  };
  return (
    <div className="designer">
      <div className="designer-controls">
        <fieldset>
          <legend>버튼 배치</legend>
          {LAYOUTS.map((l) => (
            <label key={l.id} className="radio"><input type="radio" name="layout" checked={home.layout === l.id} onChange={() => setHome({ ...home, layout: l.id })} />{l.label}</label>
          ))}
        </fieldset>
        <fieldset>
          <legend>색</legend>
          <label className="radio"><input type="radio" checked={home.fill === 'gradient'} onChange={() => setHome({ ...home, fill: 'gradient' })} />그라데이션</label>
          <label className="radio"><input type="radio" checked={home.fill === 'solid'} onChange={() => setHome({ ...home, fill: 'solid' })} />단색</label>
          <label>색 1<input type="color" value={home.color1} onChange={(e) => setHome({ ...home, color1: e.target.value.toUpperCase() })} /></label>
          {home.fill === 'gradient' && <label>색 2<input type="color" value={home.color2} onChange={(e) => setHome({ ...home, color2: e.target.value.toUpperCase() })} /></label>}
          <label>상단바<input type="color" value={headerColor} onChange={(e) => setHeaderColor(e.target.value.toUpperCase())} /></label>
        </fieldset>
        <fieldset>
          <legend>반투명 그림</legend>
          <label className="radio"><input type="radio" checked={home.art === 'mascot'} onChange={() => setHome({ ...home, art: 'mascot' })} />엔진 마스코트</label>
          <label className="radio"><input type="radio" checked={home.art === 'none'} onChange={() => setHome({ ...home, art: 'none' })} />없음</label>
          <label className="radio muted"><input type="radio" disabled />직접 올린 그림 (미디어 업로드 단계에서 열림)</label>
          <label>투명도 {Math.round(home.artOpacity * 100)}%<input type="range" min={0} max={100} value={Math.round(home.artOpacity * 100)} onChange={(e) => setHome({ ...home, artOpacity: Number(e.target.value) / 100 })} /></label>
        </fieldset>
        <button className="primary" onClick={save}>저장</button>
        {msg && <p className="muted">{msg}</p>}
      </div>
      <div className="designer-preview" style={{ ['--header' as string]: headerColor }}>
        <div className="preview-bar">{site.name}</div>
        <HomeView site={preview} />
      </div>
    </div>
  );
}

export default function Console() {
  const { me, site, reloadSite } = useSession();
  const { query } = useLocation();
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.id === query.get('tab')) ? (query.get('tab') as Tab) : 'home'));
  useEffect(() => { if (me === null) { const t = setTimeout(() => navigate('/login', true), 300); return () => clearTimeout(t); } }, [me]);
  if (!me || !site) return <p className="muted">운영자 로그인이 필요합니다.</p>;
  return (
    <section className="console">
      <h1>운영자 콘솔 <span className="muted small">{me.name} · {me.role === 'super' ? '슈퍼 운영자' : '운영자'}</span></h1>
      <nav className="tabs">
        {TABS.filter((t) => !t.superOnly || me.role === 'super').map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'backup' && <Backup />}
        {tab === 'managers' && <Managers isSuper={me.role === 'super'} />}
        {tab === 'bans' && <Bans prefill={/^[0-9a-f]{64}$/.test(query.get('ip') ?? '') ? query.get('ip')! : ''} />}
        {tab === 'words' && <Words />}
        {tab === 'audit' && <Audit />}
        {tab === 'home' && <HomeDesigner site={site} onSaved={reloadSite} />}
      </div>
    </section>
  );
}
