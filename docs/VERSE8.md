# Verse8 배포 규칙

공식 문서: https://docs.verse8.io/ko/docs (서버 SDK, 광고, VXShop, Local Cache)

## 저장소 (2026-10-15 연동)

| 원격 | 브랜치 | 용도 |
|---|---|---|
| `gitlab` (gitlab.verse8.io/anjshdkdl99/game-yzrr) | `develop` | Verse8 배포용이자 지금의 작업 브랜치. **푸시하면 자동 배포된다** |
| `github` (github.com/Jujeongmin/monster-bbq, 공개) | `main` | 공개 저장소. `develop`을 그대로 `main`으로 올린다(`git push github develop:main`). GitHub에는 `main` 브랜치만 둔다 |

- `develop`은 Verse8 템플릿(에디터 첫 커밋)에서 시작해 우리 기록(`feat/service`까지)을 `--allow-unrelated-histories`로 합쳤다. 템플릿의 `.env`, `.agent8.lock`, `PROJECT/`, `committedAt`은 그대로 두고 Tailwind/PostCSS와 자리표시 앱은 뺐다.
- 사용자 지시(2026-10-15): 작업이 하나 끝날 때마다 점검표를 돌리고 GitLab `develop`과 GitHub `main`에 함께 자동 푸시한다.
- 원격 주소의 토큰은 `.git/config`에만 둔다. 새 컴퓨터에서는 `git remote add gitlab https://oauth2:<GitLab 토큰>@gitlab.verse8.io/anjshdkdl99/game-yzrr.git`.
- Git Bash에서 `git show <브랜치>:<경로>`는 `MSYS_NO_PATHCONV=1`을 붙인다.

## 푸시 전 점검표

1. `npm test`, `npm run typecheck`, `npm --prefix server run typecheck`
2. `npm run check:bundle` (레시피 정답이 번들에 없는지), `dist/index.html`에 `GAME_SIZE_RESPONSE`가 있는지
3. 서버 코드를 바꿨으면 `npm run test:server` (Windows에서 isolated-vm 오류 창이 뜰 수 있어 사용자에게 미리 알린다)
4. `git push gitlab develop` 그리고 `git push github develop:main`, 에디터 미리보기에서 콘솔 오류와 서버 저장(새로고침 후 유지)을 확인

## 지우면 안 되는 것

- `.agent8.lock`, `.env`: Verse8 프로젝트 ID. 바꾸면 배포된 게임과 서버 데이터에서 끊긴다.

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
