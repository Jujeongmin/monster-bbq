# VX Shop 상품 등록표

등록은 사용자가 직접 한다: Verse8 게임 관리 → VX Shop → Add New Item → 양식 작성 → **Active 스위치 켜기** → 저장. 가격 기준: 100 VX ≈ $1([공식 문서](https://docs.verse8.io/ko/docs/vxshop/registering-products)). 등록만으로는 팔리지 않고 게임 상점 화면과 서버 지급(`$onItemPurchased`)이 있어야 한다 — 06b-1에서 구현됨.

- Product ID는 `shared/content/products.ts`와 **글자까지 같아야** 한다(서버가 그 표로 지급하고 VIP를 센다. 웹훅에는 가격이 없다).
- 지급은 서버 웹훅만, 같은 `purchaseId`는 한 번만. 스타터팩은 대시보드 Lifetime Limit 1로도 막는다(서버도 두 번째는 지급하지 않음).
- 숯 묶음은 모두 같은 비율(100 VX = 숯 30, 사용자 2026-10-16)이라 효율 띠가 없다. 스타터팩만 게임 상점에 효율 띠(서버 규칙 `shopOffer`가 계정마다 실제 값으로)를 단다. 대시보드 설명에는 숫자 띠를 쓰지 않는다.
- 이미지: `art-src/products-512/<id>.png`(승인된 게임 아이콘 `art/test/shop/products/<id>.png`을 정수 배율 17~20배로 키워 512×512, 바탕 `#2b1408`, 2026-10-16 승인).

## 06b-1 상품 6개 (2026-10-16 사용자 승인 설계 2장)

| Product ID | Product Name | Price (VX) | Stock Quantity | Lifetime Limit | Period Limit | Time-Limited Sale | Image | Description (대시보드에 넣을 글, 영어) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `starter_pack` | Starter Pack | 100 | 999999 | 1 | — | — | `art-src/products-512/starter_pack.png` | 75 golden charcoal and 5,000 gold to start your growth. Shown after you beat the Charge King. One per account. Counts toward VIP. |
| `charcoal_1` | Charcoal Pouch | 100 | 999999 | — | — | — | `art-src/products-512/charcoal_1.png` | 30 golden charcoal to awaken your gear and dishes. Double on your first purchase of this pouch. VIP bonus included. Counts toward VIP. |
| `charcoal_2` | Charcoal Sack | 500 | 999999 | — | — | — | `art-src/products-512/charcoal_2.png` | 150 golden charcoal. Double on your first purchase of this sack. VIP bonus included. Counts toward VIP. |
| `charcoal_3` | Charcoal Crate | 1500 | 999999 | — | — | — | `art-src/products-512/charcoal_3.png` | 450 golden charcoal. Double on your first purchase of this crate. VIP bonus included. Counts toward VIP. |
| `charcoal_4` | Charcoal Kiln | 5000 | 999999 | — | — | — | `art-src/products-512/charcoal_4.png` | 1,500 golden charcoal. Double on your first purchase of this kiln. VIP bonus included. Counts toward VIP. |
| `charcoal_5` | Charcoal Forge | 30000 | 999999 | — | — | — | `art-src/products-512/charcoal_5.png` | 9,000 golden charcoal. Double on your first purchase of this forge. VIP bonus included. Counts toward VIP. |

한국어 설명(참고):
- 스타터팩: 황금 숯 75개와 골드 5,000. 돌진대왕을 쓰러뜨린 뒤 나온다. 계정당 1번. VIP에 포함.
- 숯 주머니: 황금 숯 30개(장비·요리 각성에 쓴다). 이 주머니 첫 구매는 2배. VIP 보너스 포함.
- 숯 자루: 150개. 첫 구매 2배.
- 숯 상자: 450개. 첫 구매 2배.
- 숯 가마: 1,500개. 첫 구매 2배.
- 숯 대장간: 9,000개. 첫 구매 2배.

## 등록 뒤 확인

- 출시판에서 상점 가격이 VX로 보이는지(목록에 없으면 버튼이 꺼져 있다), 게임 콘솔 오류가 없는지.
- 테스트 결제 한 번: 숯이 늘고, 같은 결제가 두 번 지급되지 않는지, VIP 누적이 가격만큼 오르는지. (결과)
