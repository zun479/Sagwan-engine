// 메인. 버튼 배치는 프리셋(diagonal/tiles/cards/list/hero) 중 운영자가 고른다.
import type { CSSProperties, ReactNode } from 'react';
import type { HomeButton, HomeLayout } from '@sagwan/shared';
import { EXTERNAL_LINK_REL } from '@sagwan/shared';
import { MODULE_LABEL, MODULE_PATH, type Site } from '../api.ts';
import { Link } from '../router.tsx';
import { useSession } from '../session.tsx';

interface ResolvedButton {
  key: string;
  label: string;
  href: string;
  external: boolean;
  size: 'big' | 'half';
}

const MODULE_BLURB: Record<string, string> = {
  games: '방송에서 플레이한 게임과 다시보기',
  memes: '방송에서 생긴 말과 장면',
  fangames: '팬들이 만든 게임 보관소',
  gallery: '팬아트 온라인 전시관',
};

export function resolveButtons(site: Site): ResolvedButton[] {
  const enabled = new Set(site.modules.filter((m) => m.enabled).map((m) => m.id));
  const configured: HomeButton[] = site.config.theme.home.buttons.length
    ? site.config.theme.home.buttons
    : site.modules.filter((m) => m.enabled).map((m, i) => ({ label: MODULE_LABEL[m.id] ?? m.id, target: { kind: 'module', module: m.id as never }, size: i === 0 ? 'big' : 'half' }));
  const out: ResolvedButton[] = [];
  configured.forEach((b, i) => {
    if (b.target.kind === 'module') {
      if (!enabled.has(b.target.module)) return;
      out.push({ key: `m${i}`, label: b.label, href: MODULE_PATH[b.target.module] ?? '/', external: false, size: b.size });
    } else {
      const linkId = b.target.linkId;
      const l = site.config.navExternalLinks.find((x) => x.id === linkId && x.enabled);
      if (l) out.push({ key: `e${i}`, label: b.label, href: l.url, external: true, size: b.size });
    }
  });
  return out;
}

function Btn({ b, className, children }: { b: ResolvedButton; className: string; children?: ReactNode }) {
  const inner = (
    <>
      <span className="btn-label">{b.label}{b.external ? ' ↗' : ''}</span>
      {children}
    </>
  );
  return b.external ? (
    <a className={className} href={b.href} target="_blank" rel={EXTERNAL_LINK_REL}>{inner}</a>
  ) : (
    <Link className={className} to={b.href}>{inner}</Link>
  );
}

function blurbOf(b: ResolvedButton) {
  const mod = Object.entries(MODULE_PATH).find(([, p]) => p === b.href)?.[0];
  return mod ? MODULE_BLURB[mod] : b.href.replace(/^https?:\/\//, '');
}

export function HomeView({ site, layout }: { site: Site; layout?: HomeLayout }) {
  const h = site.config.theme.home;
  const mode = layout ?? h.layout;
  const buttons = resolveButtons(site);
  const artSrc = h.art === 'mascot' ? '/mascot.svg' : h.art === 'custom' && h.artMediaId ? `/media/${h.artMediaId}` : null;
  const fill = h.fill === 'gradient' ? `linear-gradient(115deg, ${h.color1}, ${h.color2})` : h.color1;
  const style = { '--home-fill': fill, '--home-c1': h.color1, '--home-c2': h.color2, '--art-opacity': String(h.artOpacity) } as CSSProperties;
  const art = artSrc ? <img className="home-art" src={artSrc} alt="" aria-hidden="true" /> : null;

  if (!buttons.length) return <p className="muted">메인에 표시할 메뉴가 없습니다. 운영자 콘솔에서 모듈을 켜 주세요.</p>;

  if (mode === 'hero') {
    return (
      <div className="home home-hero" style={style}>
        <section className="hero-band">
          <h1>{site.name} 위키</h1>
          {art}
        </section>
        <div className="hero-row">{buttons.map((b) => <Btn key={b.key} b={b} className="hero-btn" />)}</div>
      </div>
    );
  }
  if (mode === 'list') {
    return (
      <ul className="home home-list" style={style}>
        {buttons.map((b) => (
          <li key={b.key}><Btn b={b} className="list-btn"><span className="muted">{blurbOf(b)}</span></Btn></li>
        ))}
      </ul>
    );
  }
  if (mode === 'cards') {
    return (
      <div className="home home-cards" style={style}>
        {buttons.map((b) => (
          <Btn key={b.key} b={b} className="card-btn"><span className="card-sub">{blurbOf(b)}</span></Btn>
        ))}
      </div>
    );
  }
  if (mode === 'tiles') {
    return (
      <div className="home home-tiles" style={style}>
        {buttons.map((b) => <Btn key={b.key} b={b} className="tile-btn">{art}</Btn>)}
      </div>
    );
  }
  // diagonal: 스케치 그대로. 큰 버튼은 한 줄, half는 두 개씩. 대각선으로 잘린 면 + 반투명 마스코트
  return (
    <div className="home home-diagonal" style={style}>
      {buttons.map((b) => (
        <Btn key={b.key} b={b} className={`diag-btn ${b.size}`}>{b.size === 'big' ? art : null}</Btn>
      ))}
    </div>
  );
}

export default function Home() {
  const { site } = useSession();
  if (!site) return null;
  return <HomeView site={site} />;
}
