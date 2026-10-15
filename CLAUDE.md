# 몬스터 고깃집 (monster-bbq)

Verse8 횡스크롤 사냥 + 고깃집 경영 게임 (Vite + React + TypeScript, 게임 화면은 Phaser 3).
낮에는 옆모습 사냥터에서 몬스터를 잡고, 밤에는 그 고기로 고깃집을 운영한다.

**작업 전에 [docs/VERSE8.md](docs/VERSE8.md)를 읽는다.** 아래 "Verse8 Development Rules"도 따른다.

- 사용자에게는 항상 한국어로 말한다.
- 구현 중 애매하면 추측하지 말고 먼저 질문한다.
- 스토리가 중요하다. 스토리(세계관·인물·전개·대사 방향)를 설계할 때는 후보를 여러 개 뽑아 사용자에게 보여 주고 승인받은 뒤에만 정한다.
- 그림은 게임에 넣기 전에 사용자에게 보여 주고 승인받는다. 그림은 진짜 픽셀아트로(코드로 그리지 않는다).
- **Kenney·itch.io·OpenGameArt 에셋은 쓰지 않는다**(사용자가 이미 너무 많이 썼다). 소리는 Mixkit.
- UI 요소(창·버튼·배경)는 CSS 색 박스로 만들지 않는다. PixelLab으로 생성한다.
- 사냥 시점은 쿼터뷰 탑다운(MMORPG 카메라, 참고: 도깨비의세계). 캐릭터·몬스터는 PixelLab low top-down 각도, 4/8방향. 가게는 옆모습 단면도.
- 사냥 조작은 데이브 더 다이브식: PC는 WASD 이동 + 마우스 조준(좌클릭 작살, 우클릭 베기), 모바일은 가상 조이스틱 + 오른쪽 눌러 조준·떼면 발사 + 베기 버튼. 가게·주방 화면은 클릭/탭.
- 그림은 PixelLab 외에 Codex로 만들어도 된다(사용자 허락, 2026-10-14). 단 컨셉(코믹·아기자기 픽셀아트, 쿼터뷰 시점)을 지킨다.
  - Codex 사용법: 프롬프트를 파일로 써서 `codex exec --skip-git-repo-check -s workspace-write -C <프로젝트> --image <참고그림> - < prompt.txt`. `--image`는 뒤의 인자를 전부 이미지로 먹으니 프롬프트는 표준입력으로 넘긴다. `-s workspace-write`가 없으면 저장을 못 하고, 생성본은 `~/.codex/generated_images/<세션>/`에만 남는다.
  - 원본은 `art-src/codex/raw/`에 두고 `art-src/codex/slice.py`처럼 잘라 줄여서 `art/`에 넣는다(코드로 그리지 않고 크기만 맞춘다).
- PixelLab `create_image_pixflux(no_background=True)`로 만든 큰 배경 레이어는 실제로 투명하지 않다. `art-src/test/keyfix.py`로 배경을 지운 뒤 `art/`에 넣는다. 원본은 `art-src/`에 둔다.
- 그림은 `art/` 아래에 두고 `src/game/art.ts`의 `artUrl("경로")`로 불러온다.
- 개발 서버 포트는 5190(`npm run dev`). 5173은 grove hunters, 5180은 myeongtoe-hero, 5199는 day-hero-night-demon이 쓴다.
- GitLab(Verse8 배포) 연동은 아직 안 했다. 연동하면 docs/VERSE8.md를 갱신한다.
- 설계: [docs/superpowers/specs/2026-10-14-monster-bbq-design.md](docs/superpowers/specs/2026-10-14-monster-bbq-design.md)
- **아래 규칙 3과 다른 결정:** 재화(골드, 황금 숯)를 포함한 세이브 전체를 Global User State 하나에 두고 `$lock` 안에서 한 번에 바꾼다. `$asset`은 쓰지 않는다(이유는 설계 문서 7장, 2026-10-14 사용자 결정).
- 레시피 정답 표는 `server/src/recipes.ts`에만 둔다(클라이언트 번들 금지). 로컬 모드는 개발 빌드에서만 동적 import로 읽는다. 빌드 후 `npm run check:bundle`로 정답이 번들에 없는지 확인한다.
- 수익은 소수 고액 결제자의 IAP만 본다(광고 수익 0 기준, 무료 유저 완주 보장 안 함). VX 상품에는 실제 계산값으로 "효율 200%" 같은 강조 띠를 단다.

---

# Verse8 Development Rules

이 프로젝트는 JavaScript / TypeScript 기반 웹게임이며 최종적으로 Verse8 플랫폼에 배포됩니다.

일반적인 웹게임 개발 원칙뿐만 아니라 Verse8 공식 문서를 기준으로 개발해주세요.

공식 문서:
https://docs.verse8.io/ko/docs

Verse8와 관련된 기능을 구현할 때는 일반적인 웹 개발 방식이나 임의의 API를 사용하기 전에 반드시 프로젝트에 설치된 Verse8 / Agent8 SDK 구조와 공식 문서를 먼저 확인해주세요.

공식 SDK에서 제공하는 기능이 있다면 자체 구현보다 공식 SDK 사용을 우선해주세요.

---

## 1. Client / Server 책임 분리

클라이언트에서 처리할 것과 서버에서 처리할 것을 명확하게 구분해주세요.

클라이언트는 주로 다음을 담당합니다.

* Input
* UI
* Rendering
* Animation
* Audio
* 로컬 게임 표현
* 서버 결과 표시

서버는 조작되면 안 되는 중요한 게임 데이터를 담당하도록 설계해주세요.

예:

* 계정 기반 데이터
* 영구 진행 데이터
* 재화
* 아이템
* 보상 지급
* 리더보드 기록
* 멀티플레이 상태
* 중요한 게임 결과 검증

클라이언트에서 전달된 값은 신뢰하지 마세요.

---

## 2. Remote Function 보안

Verse8 Game Server의 Server 메서드는 클라이언트에서 호출 가능한 public endpoint라는 전제로 작성해주세요.

따라서 Remote Function의 arguments를 신뢰하지 마세요.

특히 다음 값을 클라이언트가 임의로 결정해서 서버에 저장하는 구조를 피해주세요.

* account
* currency
* reward
* item ownership
* score
* progression
* purchase result

사용자 식별이 필요한 경우 공식 SDK에서 제공하는 sender/account 정보를 사용해주세요.

가능한 경우 서버가 직접 결과를 계산하거나 검증한 뒤 데이터를 변경하도록 구현해주세요.

---

## 3. Verse8 State 구조

데이터 성격에 따라 Verse8에서 제공하는 적절한 저장 방식을 사용해주세요.

영구적인 플레이어 진행 데이터:
→ Global User State

전체 플레이어가 공유해야 하는 데이터:
→ Global State

랭킹, 기록, 로그처럼 여러 항목을 조회/정렬해야 하는 데이터:
→ Global Collection

방 내부에서만 유지되는 게임 상태:
→ Room State

방 내부 플레이어별 상태:
→ Room User State

방 내부의 여러 데이터 항목:
→ Room Collection

재화, 자원, 소비형 자산 등 Asset 시스템에 적합한 데이터:
→ Verse8 Asset

무조건 하나의 저장 방식에 모든 데이터를 넣지 말고 데이터의 생명주기와 용도에 따라 적절한 저장 방식을 선택해주세요.

---

## 4. 저장 시스템

Verse8에서 계정 기반으로 영구 보존해야 하는 데이터가 있다면 브라우저 LocalStorage만을 유일한 저장소로 사용하지 마세요.

예:

* 진행도
* 레벨
* 업그레이드
* 계정 재화
* 해금 콘텐츠
* 최고 기록
* 인벤토리

Verse8 SDK에서 제공하는 영구 저장 기능이 적합한지 먼저 검토해주세요.

LocalStorage / Local Cache는 서버 데이터가 필요한 기능과 구분해서 사용해주세요.

---

## 5. Leaderboard

리더보드를 구현할 경우 Verse8 공식 Game Server SDK의 Leaderboard / Global Collection 구조를 우선 검토해주세요.

게임 요구사항에 따라 다음 정책을 명확하게 정의해주세요.

예:

* 계정 단위 기록
* 계정당 최고 기록 하나만 반영
* 기존 기록보다 높은 경우에만 갱신
* Top N 조회
* 자신의 순위 조회

리더보드 기록을 단순히 클라이언트가 전달한 값만 믿고 저장하지 않도록 보안과 검증 구조도 함께 고려해주세요.

---

## 6. Multiplayer

멀티플레이 기능이 필요한 경우 별도의 임의 서버 구조를 먼저 만들지 말고 Verse8 Game Server의 Room 기능을 우선 검토해주세요.

Room State
Room User State
Room Collection
Real-time Messaging

중 어떤 기능이 현재 요구사항에 적합한지 판단해주세요.

영구 저장 데이터와 한 판에서만 필요한 Room 데이터를 혼동하지 마세요.

---

## 7. Monetization

게임에 다음 기능이 필요할 경우 직접 결제 시스템을 구현하지 말고 Verse8 공식 기능을 먼저 검토해주세요.

* 상품 구매
* 인게임 상품
* 광고
* 광고 보상
* 프리미엄 기능
* 가챠

VXShop / Verse8 Ads 등 공식 플랫폼 기능을 우선 사용해주세요.

결제 또는 광고 보상처럼 중요한 결과는 가능한 경우 서버 측 검증 방식을 사용해주세요.

---

## 8. 플랫폼 의존 코드 분리

Verse8 SDK 코드가 게임 핵심 로직 전체에 흩어지지 않도록 해주세요.

가능하다면 다음과 같이 역할을 분리해주세요.

Game Logic
↕
Platform / Service Layer
↕
Verse8 SDK

예:

SaveService
LeaderboardService
AuthService
AdService
ShopService
GameServerService

게임 시스템이 Verse8 SDK를 직접 여러 곳에서 호출하는 구조보다 플랫폼 연동 코드를 특정 Service Layer에 모으는 방식을 우선 고려해주세요.

단, 프로젝트 규모가 작다면 필요 이상으로 많은 Service나 Interface를 만들지 마세요.

---

## 9. 네트워크 호출 최적화

Game Loop에서 불필요한 서버 요청을 반복하지 마세요.

특히 매 프레임 Remote Function을 호출하는 구조를 만들지 마세요.

서버 통신은 필요한 이벤트가 발생했을 때 수행해주세요.

예:

게임 종료
웨이브 완료
아이템 구매
보상 획득
저장 시점
랭킹 조회

실시간 동기화가 필요한 기능은 Verse8에서 제공하는 Room / Messaging / Subscription 기능을 먼저 검토해주세요.

---

## 10. 오류 처리

Verse8 서버 연결이나 API 호출이 항상 성공한다고 가정하지 마세요.

다음을 고려해주세요.

* 서버 연결 실패
* 연결 지연
* 중복 요청
* 요청 중 버튼 연속 클릭
* 저장 실패
* 응답 지연
* Room 연결 해제
* 잘못된 서버 응답

네트워크 오류가 발생해도 게임 전체가 멈추거나 진행 데이터가 쉽게 손상되지 않도록 구현해주세요.

---

## 11. Verse8 문서 우선 원칙

Verse8 관련 기능을 구현할 때 SDK 사용법을 추측하지 마세요.

현재 프로젝트 코드와 Verse8 공식 문서를 먼저 확인해주세요.

특히 다음 기능은 구현 전 공식 문서를 확인해주세요.

* Authentication
* Game Server
* Remote Function
* Global State
* Global User State
* Global Collection
* Room
* Asset
* Leaderboard
* VXShop
* Ads
* Local Cache

문서와 기존 프로젝트 구현이 충돌한다면 바로 수정하지 말고 차이점을 먼저 알려주세요.

Deprecated API나 과거 SDK 사용 방식이 있다면 현재 공식 문서를 기준으로 판단해주세요.

---

# 기존 Web Game Guidelines와 함께 적용

이 Verse8 규칙은 기존 Web Game Development Guidelines를 대체하는 것이 아닙니다.

두 지침을 함께 적용해주세요.

우선순위는 다음과 같습니다.

1. Verse8 공식 SDK 및 플랫폼 요구사항
2. 데이터 안전성 / 서버 검증
3. 기존 기능 안정성
4. 게임 로직 정확성
5. 유지보수성
6. 확장성
7. 성능
8. 코드 간결성

Verse8 공식 기능이 존재하는 영역을 불필요하게 자체 구현하지 말고, 플랫폼 기능을 최대한 활용하면서 게임 로직과 플랫폼 연동 코드는 가능한 한 명확하게 분리해주세요.
