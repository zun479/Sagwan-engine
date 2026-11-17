# 지원 서비스와 단계

Wiki Hub에는 서비스 목록이 두 곳에 나옵니다. 기준이 다릅니다.

| 화면 | 목록에 들어가는 기준 |
|---|---|
| **인프라 → 서비스 추가** | 어떤 서비스든. 블록은 바로가기 + 만료일 알림일 뿐이라 엔진과 상관없다. 목록에 없으면 [직접 입력] |
| **새 위키 설치** (호스팅·DB·파일 저장소 고르기) | 엔진 어댑터가 있는 것만 고를 수 있다. 나머지는 "곧 지원 / 준비 중"으로 보이되 누를 수 없다 |

목록 데이터: `apps/hub/ui/catalog.js`. 로고 대신 글자 표시를 쓴다(각 회사 로고는 브랜드 가이드를 확인한 뒤 따로 넣는다).

## 엔진 어댑터 단계

| 분류 | 지금 (0.1) | 2차 | 3차 | 4차 |
|---|---|---|---|---|
| 호스팅·실행 | Cloudflare Workers + Pages | Vercel · Netlify (같은 API 코드를 그 런타임 진입점으로) | Render · Railway · Fly.io · 자체 서버 (Node 서버 진입점, Docker) | |
| DB | Cloudflare D1 | Turso (SQLite 그대로, 스키마 변경 없음) | PostgreSQL 군: Neon · Supabase · Prisma Postgres · Nile · AWS RDS · 네이버/NHN/카카오 클라우드 (Postgres 어댑터 1개 + 마이그레이션 변환) | MySQL 군: PlanetScale · TiDB Cloud · iwinv |
| 파일 저장소 | Cloudflare R2 | S3 호환 전부: AWS S3 · Backblaze B2 · Wasabi · 네이버 Object Storage · NHN · 카카오 · Supabase Storage (S3 서명 하나로) | Vercel Blob | |
| 캐시·큐 (옵션) | — | Upstash · Redis (속도 제한 기록을 DB 대신 저장) | | |

### 함께 쓸 수 있는 조합

- D1은 Cloudflare 호스팅에서만 쓸 수 있다 (바인딩 방식).
- Turso와 Postgres 군은 HTTP 드라이버로 어느 호스팅에서나 쓸 수 있다. Postgres는 서버리스 드라이버를 지원하는 서비스만 고를 수 있다.
- 마법사는 앞 단계에서 고른 것과 맞지 않는 항목을 회색으로 두고 이유를 한 줄로 보여 준다.

### 위키 DB로 넣지 않는 것

MongoDB 같은 문서형 DB, MotherDuck 같은 분석용 DB, AI 메모리 DB(Mem0 등), 자체 실행 모델이 있는 DB(Convex 등), 설정 저장소(Edge Config 류)는 편집 기록·리비전·FTS 검색 구조와 맞지 않는다. 인프라 블록으로는 등록할 수 있다.

## 배포 방식 (제안 · 확정 필요)

서비스가 늘어나면 서비스마다 CLI(wrangler, vercel, turso…)와 그 실행 환경(Node 등)을 PC에 받는 방식은 감당이 안 된다. 그래서:

1. **Hub가 각 서비스의 공식 HTTP API를 직접 호출한다** (Go). PC에 Node.js나 CLI를 설치하지 않는다.
2. **빌드는 GitHub Actions에서 미리** 한다. 릴리스마다 호스팅별 결과물(Workers 번들, Node 서버 번들 등)을 Releases에 올리고, Hub는 그 파일을 받아 체크섬을 확인한 뒤 업로드만 한다.
3. **API 토큰은 배포하는 동안만 메모리에** 둔다. 업데이트 배포 때 다시 입력한다. (Windows 자격 증명 관리자에 저장하는 것은 사용자가 고르는 선택 기능으로만)
