# 오류 코드 가이드

Wiki Hub와 `scripts/setup.mjs`는 실패하면 아래에서 해당 코드의 절만 잘라 AI 질문용 프롬프트에 붙입니다.
각 절은 `## ERR_코드` 제목으로 시작하고, `- 원인:` / `- 해결:` 줄을 가집니다.

## ERR_WRANGLER_AUTH
- 원인: Cloudflare 로그인 세션이 없거나 만료됨.
- 해결: `npx wrangler logout` 후 `npx wrangler login`으로 다시 로그인.

## ERR_D1_CREATE
- 원인: 계정의 D1 데이터베이스 수 한도 초과, 또는 같은 이름의 DB가 이미 있음.
- 해결: 대시보드 → Workers & Pages → D1에서 쓰지 않는 DB를 지우거나 다른 이름으로 다시 시도.

## ERR_D1_MIGRATE
- 원인: 로그인 세션 만료, 또는 계정에 Workers/D1 권한(무료 플랜 약관 동의)이 없음.
- 해결: `npx wrangler logout` → `npx wrangler login`. 대시보드에서 Workers 무료 플랜 약관 동의 여부 확인.

## ERR_S3_AUTH
- 원인: S3 호환 저장소 접근 키가 틀렸거나 버킷 권한이 없음.
- 해결: 업체 콘솔에서 키를 다시 발급하고, 해당 버킷에 읽기·쓰기 권한이 있는지 확인.

## ERR_NCP_ENDPOINT
- 원인: 네이버 클라우드 Object Storage 엔드포인트를 내부용 주소로 입력함.
- 해결: 외부용 엔드포인트 `https://kr.object.ncloudstorage.com` 사용.
