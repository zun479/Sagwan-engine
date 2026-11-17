// 인프라 블록으로 추가할 수 있는 서비스 목록.
// 블록은 바로가기 + 만료일 알림이라 어떤 서비스든 등록할 수 있다.
// deploy: true 는 "새 위키 설치"에서 실제로 고를 수 있는(엔진 어댑터가 있는) 서비스.
// 로고 대신 글자 표시(mono)를 쓴다. 각 회사 로고는 해당 브랜드 가이드에 따라 따로 넣어야 한다.
'use strict';

const CATEGORIES = [
  { id: 'hosting', name: '호스팅 · 실행', color: '#B4561A' },
  { id: 'db', name: 'DB', color: '#2F6B4F' },
  { id: 'storage', name: '파일 저장소', color: '#3D5A80' },
  { id: 'cache', name: '캐시 · 큐', color: '#7A3E6B' },
  { id: 'kr', name: '국내 클라우드 · 호스팅', color: '#0F7A45' },
  { id: 'domain', name: '도메인', color: '#5B4FA8' },
  { id: 'etc', name: '기타', color: '#4A4A4A' },
];

const CATALOG = [
  { id: 'cloudflare', cat: 'hosting', name: 'Cloudflare', mono: 'CF', desc: 'Workers · Pages · D1 · R2', url: 'https://dash.cloudflare.com/', color: '#C8611B', deploy: true },
  { id: 'vercel', cat: 'hosting', name: 'Vercel', mono: 'Ve', desc: '프론트 · 서버리스 함수', url: 'https://vercel.com/dashboard' },
  { id: 'netlify', cat: 'hosting', name: 'Netlify', mono: 'Nf', desc: '프론트 · 서버리스 함수', url: 'https://app.netlify.com/' },
  { id: 'render', cat: 'hosting', name: 'Render', mono: 'Rn', desc: '웹 서비스 · 정적 사이트', url: 'https://dashboard.render.com/' },
  { id: 'railway', cat: 'hosting', name: 'Railway', mono: 'Ra', desc: '컨테이너 배포', url: 'https://railway.com/dashboard' },
  { id: 'flyio', cat: 'hosting', name: 'Fly.io', mono: 'Fl', desc: '컨테이너 · 전 세계 리전', url: 'https://fly.io/dashboard' },
  { id: 'github', cat: 'hosting', name: 'GitHub', mono: 'GH', desc: '저장소 · Pages · Actions', url: 'https://github.com/' },
  { id: 'oracle', cat: 'hosting', name: 'Oracle Cloud', mono: 'Or', desc: 'Always Free VM', url: 'https://cloud.oracle.com/', color: '#9E2B25' },
  { id: 'firebase', cat: 'hosting', name: 'Firebase', mono: 'Fb', desc: '호스팅 · Firestore', url: 'https://console.firebase.google.com/' },

  { id: 'turso', cat: 'db', name: 'Turso', mono: 'Tu', desc: 'SQLite 호환 (libSQL)', url: 'https://app.turso.tech/' },
  { id: 'neon', cat: 'db', name: 'Neon', mono: 'Ne', desc: '서버리스 Postgres', url: 'https://console.neon.tech/' },
  { id: 'supabase', cat: 'db', name: 'Supabase', mono: 'Sb', desc: 'Postgres · 스토리지', url: 'https://supabase.com/dashboard', color: '#2F7D5B' },
  { id: 'prisma', cat: 'db', name: 'Prisma Postgres', mono: 'Pr', desc: '자동 확장 Postgres', url: 'https://console.prisma.io/' },
  { id: 'nile', cat: 'db', name: 'Nile', mono: 'Ni', desc: 'Postgres', url: 'https://console.thenile.dev/' },
  { id: 'planetscale', cat: 'db', name: 'PlanetScale', mono: 'PS', desc: 'MySQL', url: 'https://app.planetscale.com/' },
  { id: 'tidb', cat: 'db', name: 'TiDB Cloud', mono: 'Ti', desc: 'MySQL 호환', url: 'https://tidbcloud.com/' },
  { id: 'mongodb', cat: 'db', name: 'MongoDB Atlas', mono: 'MD', desc: '문서형 DB', url: 'https://cloud.mongodb.com/' },
  { id: 'convex', cat: 'db', name: 'Convex', mono: 'Cx', desc: '반응형 DB', url: 'https://dashboard.convex.dev/' },

  { id: 'aws', cat: 'storage', name: 'AWS', mono: 'AW', desc: 'S3 · RDS · EC2 외', url: 'https://console.aws.amazon.com/' },
  { id: 'backblaze', cat: 'storage', name: 'Backblaze B2', mono: 'B2', desc: 'S3 호환 저장소', url: 'https://secure.backblaze.com/' },
  { id: 'wasabi', cat: 'storage', name: 'Wasabi', mono: 'Wa', desc: 'S3 호환 저장소', url: 'https://console.wasabisys.com/' },

  { id: 'upstash', cat: 'cache', name: 'Upstash', mono: 'Up', desc: 'Redis · 큐 · 벡터', url: 'https://console.upstash.com/' },
  { id: 'redis', cat: 'cache', name: 'Redis Cloud', mono: 'Rd', desc: '관리형 Redis', url: 'https://cloud.redis.io/' },

  { id: 'ncloud', cat: 'kr', name: '네이버 클라우드', mono: 'N', desc: '서버 · Object Storage · Cloud DB', url: 'https://console.ncloud.com/' },
  { id: 'nhncloud', cat: 'kr', name: 'NHN Cloud', mono: 'NH', desc: '인스턴스 · RDS · 오브젝트 스토리지', url: 'https://console.nhncloud.com/' },
  { id: 'kakaocloud', cat: 'kr', name: '카카오클라우드', mono: 'K', desc: 'VM · MySQL · 오브젝트 스토리지', url: 'https://console.kakaocloud.com/' },
  { id: 'iwinv', cat: 'kr', name: 'iwinv', mono: 'iw', desc: '클라우드 서버 · DBMS', url: 'https://www.iwinv.kr/' },
  { id: 'cafe24', cat: 'kr', name: '카페24', mono: 'C24', desc: '웹호스팅', url: 'https://hosting.cafe24.com/' },

  { id: 'gabia', cat: 'domain', name: '가비아', mono: 'Ga', desc: '도메인 · DNS', url: 'https://www.gabia.com/' },
  { id: 'porkbun', cat: 'domain', name: 'Porkbun', mono: 'Pb', desc: '도메인 · DNS', url: 'https://porkbun.com/account/domainsSpeedy' },
  { id: 'namecheap', cat: 'domain', name: 'Namecheap', mono: 'Nc', desc: '도메인 · DNS', url: 'https://ap.www.namecheap.com/' },
  { id: 'domain', cat: 'domain', name: '기타 도메인', mono: '.kr', desc: '등록 업체 직접 입력', url: '' },

  { id: 'other', cat: 'etc', name: '직접 입력', mono: '+', desc: '이름·관리 페이지 주소·만료일을 직접 적기', url: '' },
];

// 0.1 버전에서 쓰던 종류 이름
const LEGACY_KIND = { ncp: 'ncloud' };

function serviceOf(kind) {
  const id = LEGACY_KIND[kind] || kind;
  return CATALOG.find((s) => s.id === id) || CATALOG.find((s) => s.id === 'other');
}

function serviceColor(s) {
  return s.color || (CATEGORIES.find((c) => c.id === s.cat) || CATEGORIES[CATEGORIES.length - 1]).color;
}
