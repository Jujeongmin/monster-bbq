# Verse8 배포 규칙

공식 문서: https://docs.verse8.io/ko/docs (서버 SDK, 광고, VXShop, Local Cache)

## 현재 상태 (2026-10-14)

- 로컬 전용 프로토타입이다. GitLab(Verse8 배포) 연동과 `.env` / `.agent8.lock`은 아직 없다.
- 연동할 때는 Verse8 에디터에서 프로젝트를 만들고 받은 `.env`, `.agent8.lock`을 그대로 넣는다. 주소와 토큰은 `.git/config`에만 둔다. 그 뒤 이 문서에 원격·브랜치·점검표를 적는다(myeongtoe-hero의 docs/VERSE8.md 참고).
- 서버(`server/src/server.ts`, `export class Server`)도 아직 없다. 만들 때는 `npx -y @agent8/gameserver-node init`으로 뼈대를 받는다. 핸들러 파일은 `server/src/` 바로 아래에 둔다(하위 폴더는 빌드가 안 읽는다).

## 지우면 안 되는 것

- `index.html`의 `GAME_SIZE_RESPONSE` 응답 스크립트: Verse8 iframe이 게임 크기를 묻는다.
- `src/main.tsx` 맨 위의 `import "./storageFallback"`: 에디터 iframe에서 localStorage가 막히면 SDK가 import 시점에 죽는다.
- `vite.config.ts`의 `cssCacheBust()`, `artVersions()`, `base: "./"`, `resolve.dedupe`, `optimizeDeps.include`
- Verse8 템플릿의 Tailwind/PostCSS 설정은 넣지 않는다(빌드를 깬다).
- 단일 파일/IIFE 빌드 금지(`import.meta.env`가 사라져 verse가 "default"가 된다).

## 서버 연결 (연동 후)

- 개발 빌드(`npm run dev`)는 `.env`의 verse 뒤에 `-preview`를 붙인 미리보기 서버에 붙는다. 배포 빌드는 본 서버에 붙는다.
- 서버 메서드는 누구나 부를 수 있는 공개 엔드포인트다. 인자를 믿지 말고 `$sender.account`로 계정을 정한다. 재화는 `$asset`, `mint`/`burn`을 클라이언트에 그대로 열지 않는다.
- 저장한 유저 상태는 계정 ID만 알면 누구나 읽을 수 있다. 세이브에 개인 정보를 넣지 않는다.

## 광고 (`@verse8/ads`)

- `Verse8Ads.showRewarded({ placementId })`는 항상 resolve한다. `status`가 `rewarded`일 때만 보상한다. 큰 보상은 서버에서 `requestId`로 검증한다.
- 클릭·탭 같은 사용자 동작 안에서만 부른다(페이지 로드 시 금지).
- `unsupported_env`면 그 세션 동안 광고 버튼을 숨기고, `busy`면 버튼을 잠근다.
