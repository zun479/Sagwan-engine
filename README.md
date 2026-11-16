# Sagwan Engine (사관 엔진)

스트리머 팬 위키를 위한 독립형 엔진입니다. 사관이 하루하루를 기록했듯, 스트리머가 플레이한 게임·밈·팬게임·팬아트를 팬들이 함께 기록하고 보존합니다.

- **설치 1회 = 스트리머 1명 = 위키 1개.** 다른 스트리머 위키는 같은 엔진을 따로 설치합니다.
- **제작자 운영비 0원.** 각 위키는 운영자 본인의 클라우드 계정(Cloudflare 등)에서 돌아갑니다.
- **로그인 없는 익명 편집 + 시청자 인증 퀴즈 + 리비전.**

## 저장소 구성

```
apps/api        API (표준 Request/Response, 자체 라우터. Workers 진입점: src/entries/cloudflare.ts)
apps/web        React + Vite 위키 화면
packages/shared 서버·화면 공용 로직 (URL 분류, 정답 정규화, 금칙어, 해시 체인, 비밀번호)
migrations/     D1(SQLite) 스키마
docs/           거버넌스, 오류 가이드, 약관·개인정보처리방침 템플릿
scripts/        개발·배포 보조 스크립트
apps/hub        Wiki Hub (Windows PC 프로그램, Go). 인프라 블록·엔진 버전 관리, 배포 마법사(다음 단계)
```

## Wiki Hub 설치 (사용자)

[Releases](https://github.com/zun479/Sagwan-engine/releases)에서 `WikiHub-Setup-버전.exe`를 받아 실행 → 설치 폴더 선택 → 설치. 관리자 권한은 필요 없습니다.
Wiki Hub는 이 PC 안에서만 동작하며 계정이 없습니다. 창은 Windows에 기본으로 있는 Microsoft Edge의 앱 모드로 열립니다.

## 릴리스 만들기 (관리자)

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions(`.github/workflows/release.yml`)가 Windows에서 테스트 → `WikiHub.exe` 빌드(아이콘·버전 정보 포함) → NSIS로 `WikiHub-Setup-0.1.0.exe` 생성 → 엔진 소스 zip·체크섬과 함께 Releases에 **초안**으로 올립니다. 초안을 열어 확인한 뒤 [Publish release]를 누르면 공개됩니다. `v0.2.0-beta.1`처럼 `-`가 붙은 태그는 미리보기(pre-release)로 표시됩니다.

## 개발 시작

Node 22.18 이상이 필요합니다.

```bash
npm install
npm test                 # 공용 로직 + API 통합 테스트 (실제 마이그레이션을 Node 내장 SQLite에 적용)
npm run test:schema      # 마이그레이션 단독 검증 (python3 필요)
cp apps/api/wrangler.toml.example apps/api/wrangler.toml   # database_id 채우기
npm run db:migrate:local
npm run dev:api          # http://localhost:8787
npm run dev:web          # http://localhost:5173
```

Cloudflare 계정 없이 화면만 보고 싶으면 웹을 빌드한 뒤 Node 미리보기 서버를 씁니다. 메모리 DB에 샘플 데이터와 운영자 `owner`(슈퍼)·`helper`가 들어갑니다(비밀번호 `dev password 1`).

```bash
npm --workspace apps/web run build
node apps/api/scripts/dev-server.ts apps/web/dist 8787   # http://localhost:8787
```

슈퍼 운영자 계정은 이렇게 만듭니다(비밀번호는 인자로 넘기지 않음, 해시만 DB에 들어감). 슈퍼 비밀번호를 잊었을 때도 같은 명령으로 다시 씁니다.

```bash
cd apps/api
echo -n '새 비밀번호' | node scripts/super-sql.ts 아이디 표시이름 > super.sql
npx wrangler d1 execute DB --remote --file super.sql && rm super.sql
```

`apps/api/.dev.vars`에 로컬용 비밀값을 넣습니다.

```
AUTH_PEPPER=<32바이트 난수 base64>
DATA_ENCRYPTION_KEY=<32바이트 난수 base64>
```

## 라이선스와 운영 불간섭

**코드:** [GNU AGPL-3.0](LICENSE) 원문 그대로입니다.

**운영 불간섭 (공식 해석):**

1. 엔진을 **수정하지 않고** 배포해 위키를 운영하는 것은 영리·비영리를 가리지 않고 자유입니다.
2. 엔진 제작자는 개별 위키의 운영, 콘텐츠, 광고·수익에 관여하지 않습니다.
3. 위키에 쓰인 글·이미지 등 콘텐츠는 엔진의 2차 저작물이 아니며, 엔진 라이선스(AGPL)의 적용을 받지 않습니다. 콘텐츠 라이선스는 각 위키가 정합니다.
4. AGPL의 소스 공개 의무는 **엔진 코드를 수정해서** 네트워크로 서비스할 때 생깁니다. 이 경우 수정한 엔진 코드를 이용자에게 공개해야 합니다.

이 해석은 AGPL 본문을 바꾸지 않으며, 본문과 충돌하면 본문이 우선합니다.

**이름·아이콘·마스코트:** AGPL 허가 대상이 아닙니다. [TRADEMARK.md](TRADEMARK.md)를 보세요.

## 문서

- [거버넌스와 정직한 한계](docs/GOVERNANCE.md)
- [오류 코드 가이드](docs/ERRORS.md)
- [기여 약관](docs/legal/CONTRIBUTOR-TERMS.md) · [이용약관 템플릿](docs/legal/TERMS.template.md) · [개인정보처리방침 템플릿](docs/legal/PRIVACY.template.md)
