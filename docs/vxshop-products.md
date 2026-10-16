# VX Shop 상품 등록표

등록은 사용자가 직접 한다: Verse8 게임 관리 → VX Shop → Add New Item → 양식 작성 → **Active 스위치 켜기** → 저장. 가격 기준: 100 VX ≈ $1([공식 문서](https://docs.verse8.io/ko/docs/vxshop/registering-products)). 등록만으로는 팔리지 않고 게임 상점 화면과 서버 지급(`$onItemPurchased`)이 있어야 한다 — 06b-1에서 구현됨.

- Product ID는 `shared/content/products.ts`와 **글자까지 같아야** 한다(서버가 그 표로 지급하고 VIP를 센다. 웹훅에는 가격이 없다).
- 지급은 서버 웹훅만, 같은 `purchaseId`는 한 번만. 스타터팩은 대시보드 Lifetime Limit 1로도 막는다(서버도 두 번째는 지급하지 않음).
- 게임 상점의 효율 띠는 서버 규칙(`shared/shop.ts` `shopOffer`)이 계정마다 실제 값으로 계산한다. 대시보드 설명에는 숫자 띠를 쓰지 않는다(첫 구매·VIP에 따라 달라짐).
- 이미지: 승인된 상품 아이콘 `art/test/shop/products/<id>.png`를 정수 배율로 키운 512×512(바탕 `#2b1408`). 아이콘 승인 전에는 비워 둔다.

## 06b-1 상품 6개 (2026-10-16 사용자 승인 설계 2장)

| Product ID | Product Name | Price (VX) | Stock Quantity | Lifetime Limit | Period Limit | Time-Limited Sale | Image | Description (대시보드에 넣을 글, 영어) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `starter_pack` | Starter Pack | 100 | 999999 | 1 | — | — | `art/test/shop/products/starter_pack.png` | 200 golden charcoal and 5,000 gold to start your growth. Shown after you beat the Charge King. One per account. Counts toward VIP. |
| `charcoal_1` | Charcoal Pouch | 100 | 999999 | — | — | — | `art/test/shop/products/charcoal_1.png` | 30 golden charcoal to awaken your gear and dishes. Double on your first purchase of this pouch. VIP bonus included. Counts toward VIP. |
| `charcoal_2` | Charcoal Sack | 500 | 999999 | — | — | — | `art/test/shop/products/charcoal_2.png` | 180 golden charcoal (20% more per VX than the Pouch). Double on your first purchase of this sack. VIP bonus included. Counts toward VIP. |
| `charcoal_3` | Charcoal Crate | 1500 | 999999 | — | — | — | `art/test/shop/products/charcoal_3.png` | 600 golden charcoal (33% more per VX than the Pouch). Double on your first purchase of this crate. VIP bonus included. Counts toward VIP. |
| `charcoal_4` | Charcoal Kiln | 5000 | 999999 | — | — | — | `art/test/shop/products/charcoal_4.png` | 2,250 golden charcoal (50% more per VX than the Pouch). Double on your first purchase of this kiln. VIP bonus included. Counts toward VIP. |
| `charcoal_5` | Charcoal Forge | 30000 | 999999 | — | — | — | `art/test/shop/products/charcoal_5.png` | 15,000 golden charcoal (67% more per VX than the Pouch) — the best value. Double on your first purchase of this forge. VIP bonus included. Counts toward VIP. |

한국어 설명(참고):
- 스타터팩: 황금 숯 200개와 골드 5,000. 돌진대왕을 쓰러뜨린 뒤 나온다. 계정당 1번. VIP에 포함.
- 숯 주머니: 황금 숯 30개(장비·요리 각성에 쓴다). 이 주머니 첫 구매는 2배. VIP 보너스 포함.
- 숯 자루: 180개(주머니보다 VX당 20% 더). 첫 구매 2배.
- 숯 상자: 600개(VX당 33% 더). 첫 구매 2배.
- 숯 가마: 2,250개(VX당 50% 더). 첫 구매 2배.
- 숯 대장간: 15,000개(VX당 67% 더, 가장 이득). 첫 구매 2배.

## 등록 뒤 확인

- 출시판에서 상점 가격이 VX로 보이는지(목록에 없으면 버튼이 꺼져 있다), 게임 콘솔 오류가 없는지.
- 테스트 결제 한 번: 숯이 늘고, 같은 결제가 두 번 지급되지 않는지, VIP 누적이 가격만큼 오르는지. (결과)
