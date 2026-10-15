# 08a 사냥 재설계 1단계 (뼈대: 층·기력·출구·하루 두 번) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사냥을 "숲 입구(1층) → 깊은 숲(2층)으로 내려가며, 기력이 다하기 전에 출구까지 가서 돌아오는" 한 판으로 바꾸고, 하루에 아침·오후 두 번 나가게 한다. 그림은 지금 것을 쓴다(출구·계단 그림만 새로, 승인 후).

**Architecture:** 층 정의(고정 지형·출구·계단·기력 감소 속도·몬스터 명단)는 `shared/content/floors.ts` 한 곳. 한 층의 배치는 순수 함수 `planFloor(seed, floor, period)`가 만든다(지형은 층마다 고정, 몬스터·채집물만 사냥 seed로). 서버 정산(`shared/actions.ts` `settleHunt`)은 보고를 층 순서대로 다시 따라가며 계단·출구·시간을 검사한다. 세이브는 v6: 날짜 단계에 `"lunch"`(점심)가 생기고, 진행 중인 사냥에 `period`(아침/오후)가 붙는다. 사냥 화면은 층이 바뀔 때 Phaser 장면을 같은 "한 판 상태"(기력·가방·보고)로 다시 시작한다.

**Tech Stack:** TypeScript 5.7, React 18, Phaser 3.90, vitest 3, Python 3 + Pillow(그림 자르기만).

**Spec:** [사냥 재설계 (hunt v3)](../specs/2026-10-15-hunt-v3-depths-design.md) 3장(하루 흐름·사냥 한 판·층), 5.2(화면 표시), 5.3(서버 검증), 5.4 1단계, 6장(테스트).

## Global Constraints

- 사용자에게 보이는 글은 전부 `t()` (ko.ts가 기준, en.ts도 같은 키). 사용자에게는 한국어로만 말한다(영어 재요약 금지).
- 숫자는 `BALANCE`·`FLOORS` 두 곳에만. **아래 숫자 초안은 계획 검토 때 사용자 승인을 받는다**: 기력 감소 1층 초당 0.25(기력 100이면 약 6분 40초), 2층 초당 0.4(약 4분 10초), 계단 한 번에 최소 8초(`minMsPerFloor`), 출구 1층 3곳·2층 2곳.
- 기력 최대치는 1단계에서 지금 "앞치마 갑옷" 업그레이드의 체력 표(100/130/170/220)를 그대로 쓴다(기력 통 장비는 3단계).
- 서버 행동은 public endpoint: 인자를 믿지 않고 `shared/actions.ts`가 전부 검사한다. 거부된 행동은 세이브를 바꾸지 않는다. 세이브 전체는 Global User State 하나에 `$lock`으로(CLAUDE.md 결정 그대로).
- 그림은 승인된 것만 `art/`에 넣는다. 코드로 그리지 않는다(자르기·배경 지우기·크기 맞추기만). 새 그림은 출구 수레·내려가는 계단 두 개뿐(작업 1, 승인 전에는 다음 작업으로 넘어가지 않는다).
- UI는 픽셀 키트(`art/test/ui2`)와 갈무리. 버튼·막대 글자는 그림의 안쪽 면에만. 바꾼 화면은 `art-src/mockups/tools/shot.mjs`로 실제 1280×720 화면을 찍어 확인하고 사용자에게 보여 준다.
- 서버 하네스 테스트(`npm run test:server`)는 실행 전에 사용자에게 알린다(Windows isolated-vm 오류 창).
- 작업 2~6 사이에는 `npm run typecheck`가 깨져 있을 수 있다(보고 형식·세이브 타입·월드 크기가 한꺼번에 바뀌고, 사냥 화면은 작업 7에서 따라온다). 각 작업은 **자기 테스트 파일**이 통과하면 커밋한다. 작업 7 끝부터 `npm test`와 `npm run typecheck`가 모두 통과해야 한다.
- 작업마다 커밋하고 GitLab `develop`과 GitHub `main`에 푸시한다(`git push -q gitlab develop; git push -q github develop:main`). 끝나면 docs/VERSE8.md 점검표.

## Review Focus

- 출구가 아닌 곳에서 끝난 보고(출구 id가 없거나 다른 층의 출구)는 서버가 거부한다. 기절(ko)은 출구 없이 끝나고 가방 절반만 남는다 → 작업 4 테스트.
- 2층 몬스터를 1층에 있는 채로 잡았다는 보고(층 순서가 틀림), 계단을 건너뛴 보고(1층 → 3층), 계단을 너무 빨리 탄 보고는 거부 → 작업 4 테스트.
- 아침 사냥 → 점심 → 오후 사냥 → 저녁, 세 번째 사냥과 점심에 하루 넘기기는 거부. 점심에 오후를 쉬면 바로 저녁 주방 → 작업 4 테스트.
- v5 세이브(사냥 중이던 것 포함)를 열어도 진행이 깨지지 않는다: 진행 중이던 사냥은 아침 사냥으로 읽힌다 → 작업 3 테스트.
- 층을 내려가도 기력·가방·보고·먹은 도시락이 이어지고, 새로고침하면 그 사냥은 1층에서 다시 시작한다(지금과 같은 수준) → 작업 7 직접 확인.

---

### Task 1: 출구 수레·계단 그림 (Codex, 승인 필요)

**Files:**
- Create: `art-src/codex/prompt-hunt-exit-stairs.txt`
- Create: `art-src/codex/raw/hunt_exit_stairs.png` (Codex 생성본)
- Create: `art-src/codex/slice_hunt_props.py`
- Create: `art/test/hunt/exit.png`, `art/test/hunt/stairs.png` (승인 후)
- Create: `art-src/preview/hunt_props_vs_objects.png`

**Interfaces:**
- Produces: 텍스처 파일 `art/test/hunt/exit.png`(반달이의 수레, 출구), `art/test/hunt/stairs.png`(아래로 내려가는 굴 입구). 작업 7이 `exit`·`stairs` 키로 불러온다.

- [ ] **Step 1: 프롬프트 쓰기**

`art-src/codex/prompt-hunt-exit-stairs.txt` (참고 그림: 지금 사냥터 물체 `art/test/objects/tree_round.png`, `rock_big.png`를 8배로 키운 시트):

```text
Use your image generation tool (do not write code to draw) to create ONE image, 1024x512: two objects side by side on a perfectly flat solid magenta #FF00FF background (no glow, no shadow, no floor), each centred in its half, nothing touching the edges. No text.

Style: the same chunky quarter-view (high top-down, about 60 degrees) pixel art as the attached forest objects — every art pixel a solid 8x8 block, 1-art-pixel dark outline, flat shading with 2-3 tones per material, the same palette, no gradients, no glow, no anti-aliasing.

left: "Bandal's cart" — a small wooden hand cart with two wheels, a red-and-cream striped cloth (the colours of Bandal's bandana) over a stack of crates and a little hanging lantern, the place the hunter leaves the forest from. About 40 x 32 art pixels.
right: "the way down" — a dark hole in the forest floor ringed by mossy stones and roots, with rough log steps going down into darkness. About 44 x 30 art pixels.

Save as art-src/codex/raw/hunt_exit_stairs.png. Reply only with the saved file path.
```

- [ ] **Step 2: 참고 시트를 만들고 Codex로 생성**

```bash
python -I -c "
from PIL import Image
ims=[Image.open(f'art/test/objects/{n}.png').convert('RGBA') for n in ['tree_round','rock_big','bush_pink']]
S=8; W=sum(i.width*S+16 for i in ims); H=max(i.height for i in ims)*S
o=Image.new('RGBA',(W,H),(255,0,255,255)); x=0
for i in ims: o.alpha_composite(i.resize((i.width*S,i.height*S),Image.NEAREST),(x,H-i.height*S)); x+=i.width*S+16
o.convert('RGB').save('art-src/codex/raw/ref_hunt_objects_x8.png')"
codex exec --skip-git-repo-check -s workspace-write -C "$(pwd)" --image art-src/codex/raw/ref_hunt_objects_x8.png - < art-src/codex/prompt-hunt-exit-stairs.txt
```

Expected: `art-src/codex/raw/hunt_exit_stairs.png` 생성.

- [ ] **Step 3: 자르기 스크립트**

`art-src/codex/slice_hunt_props.py`:

```python
"""Cut the Codex exit cart and way-down hole (raw/hunt_exit_stairs.png) into hunt props.

    python -I art-src/codex/slice_hunt_props.py

Nothing is drawn: magenta keyed out, each half cropped, box-shrunk by 8 (the sheet is drawn on an 8 px
grid), alpha snapped on/off. Output: art-src/codex/out/hunt/{exit,stairs}.png and a comparison next to
today's forest objects in art-src/preview/hunt_props_vs_objects.png. Approved files are copied to art/test/hunt.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "art-src/codex/raw/hunt_exit_stairs.png"
OUT = ROOT / "art-src/codex/out/hunt"
GRID = 8


def key(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128 or (r > 150 and b > 150 and g < 120) or (r > 80 and b > 80 and min(r, b) - g > 70):
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = key(Image.open(RAW))
    half = sheet.width // 2
    done = []
    for name, box in [("exit", (0, 0, half, sheet.height)), ("stairs", (half, 0, sheet.width, sheet.height))]:
        c = sheet.crop(box)
        c = c.crop(c.getbbox())
        s = c.resize((max(1, round(c.width / GRID)), max(1, round(c.height / GRID))), Image.BOX)
        s.putalpha(s.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        s.save(OUT / f"{name}.png")
        done.append(s)
        print(name, s.size)
    refs = [Image.open(ROOT / f"art/test/objects/{n}.png").convert("RGBA") for n in ["tree_round", "rock_big"]]
    row = refs + done
    S = 4
    W = sum(i.width * S + 20 for i in row)
    H = max(i.height for i in row) * S
    out = Image.new("RGBA", (W, H + 20), (70, 110, 60, 255))
    x = 10
    for i in row:
        out.alpha_composite(i.resize((i.width * S, i.height * S), Image.NEAREST), (x, 10 + H - i.height * S))
        x += i.width * S + 20
    out.save(ROOT / "art-src/preview/hunt_props_vs_objects.png")


if __name__ == "__main__":
    main()
```

Run: `python -I art-src/codex/slice_hunt_props.py`
Expected: `exit (≈40, ≈32)`, `stairs (≈44, ≈30)` 출력, 비교 그림 생성.

- [ ] **Step 4: 사용자에게 보여 주고 승인받기 (멈춤 지점)**

`art-src/preview/hunt_props_vs_objects.png`를 보내고 "지금 숲 물체와 어울리는지" 승인을 받는다. 고칠 곳을 말하면 Step 1 프롬프트를 고쳐 다시 생성한다. **승인 전에는 Step 5로 가지 않는다.**

- [ ] **Step 5: 승인본을 게임 폴더로 옮기고 커밋**

```bash
mkdir -p art/test/hunt && cp art-src/codex/out/hunt/exit.png art-src/codex/out/hunt/stairs.png art/test/hunt/
git add art-src/codex/prompt-hunt-exit-stairs.txt art-src/codex/raw/hunt_exit_stairs.png art-src/codex/raw/ref_hunt_objects_x8.png art-src/codex/slice_hunt_props.py art-src/codex/out/hunt art-src/preview/hunt_props_vs_objects.png art/test/hunt
git commit -m "art: Bandal's exit cart and the way-down hole for the hunt floors (approved)"
```

---

### Task 2: 층 정의와 층 배치

**Files:**
- Create: `shared/content/floors.ts`
- Create: `shared/content/floors.test.ts`
- Modify: `shared/hunt/plan.ts` (전체 교체: `planHunt` → `planFloor`)
- Modify: `shared/hunt/plan.test.ts` (전체 교체)
- Modify: `shared/balance.ts` (`hunt.minMsPerFloor` 추가, `hunt.world`·`hunt.field`·`boarCount` 삭제)

**Interfaces:**
- Produces:
  - `type FloorId = 1 | 2`, `isFloorId(v: unknown): v is FloorId`, `type Period = "morning" | "afternoon"`, `interface FloorExit { id: string; x: number; y: number }`, `interface FloorDef { world: { w: number; h: number }; field: Field; start: Vec; exits: FloorExit[]; down: Vec | null; drainPerSec: number; layoutSeed: number; roster: Record<Period, Roster> }`, `interface Roster { solo: [MonsterId, number][]; flocks: number; flockSize: number; waves: number; forage: [ItemId, number][] }`, `FLOORS: Record<FloorId, FloorDef>`, `nearestExit(pos: Vec, floor: FloorId): FloorExit` (`shared/content/floors.ts`)
  - `interface FloorPlan { floor: FloorId; objects: { kind: ObjectKind; x: number; y: number; foot: Rect }[]; spawns: { id: string; monster: MonsterId; x: number; y: number; wave: number; flock?: string }[]; nodes: { id: string; item: ItemId; x: number; y: number }[] }`, `planFloor(seed: number, floor: FloorId, period: Period): FloorPlan` (`shared/hunt/plan.ts`). id는 층을 앞에 붙인다: 몬스터 `"1-s0"`, 채집물 `"1-n0"`, 출구 `"1-e0"`.
  - `BALANCE.hunt.minMsPerFloor: number` (= 8000)

- [ ] **Step 1: 층 정의 테스트 쓰기**

`shared/content/floors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FLOORS, isFloorId, nearestExit } from "./floors";

describe("FLOORS", () => {
  it("has floors 1 and 2 only in stage 1", () => {
    expect(Object.keys(FLOORS)).toEqual(["1", "2"]);
    expect([isFloorId(1), isFloorId(2), isFloorId(3), isFloorId("1")]).toEqual([true, true, false, false]);
  });
  it("keeps the start, every exit and the way down inside the walkable field", () => {
    for (const f of Object.values(FLOORS)) {
      for (const p of [f.start, ...f.exits, ...(f.down ? [f.down] : [])]) {
        expect(p.x).toBeGreaterThanOrEqual(f.field.minX);
        expect(p.x).toBeLessThanOrEqual(f.field.maxX);
        expect(p.y).toBeGreaterThanOrEqual(f.field.minY);
        expect(p.y).toBeLessThanOrEqual(f.field.maxY);
      }
    }
  });
  it("gives every exit an id that names its floor, and fewer exits further down", () => {
    expect(FLOORS[1].exits.map((e) => e.id)).toEqual(["1-e0", "1-e1", "1-e2"]);
    expect(FLOORS[2].exits.map((e) => e.id)).toEqual(["2-e0", "2-e1"]);
  });
  it("drains stamina faster on the deeper floor", () => {
    expect(FLOORS[2].drainPerSec).toBeGreaterThan(FLOORS[1].drainPerSec);
  });
  it("leads down from floor 1 only (floor 3 needs the boots, stage 3)", () => {
    expect(FLOORS[1].down).not.toBeNull();
    expect(FLOORS[2].down).toBeNull();
  });
  it("finds the nearest exit of a floor", () => {
    const e = FLOORS[1].exits[1];
    expect(nearestExit({ x: e.x + 3, y: e.y - 2 }, 1).id).toBe(e.id);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run shared/content/floors.test.ts`
Expected: FAIL — `Cannot find module './floors'`.

- [ ] **Step 3: 층 정의 만들기**

`shared/content/floors.ts`:

```ts
import type { Field, Vec } from "../hunt/types";
import type { ItemId } from "./items";
import type { MonsterId } from "./monsters";

// The forest's floors (hunt v3 design 3): each a fixed ground (its layout comes from layoutSeed until the
// floor's own picture replaces it, stage 4), its exits (Bandal's carts: the only way home), the way down,
// how fast stamina drains there and who lives there in the morning and the afternoon. Floors 3-4 (boots,
// lantern) come in stage 3. The numbers are the user-approved draft (plan 08a), tuned in play.
export type FloorId = 1 | 2;
export type Period = "morning" | "afternoon";

export interface FloorExit {
  id: string;
  x: number;
  y: number;
}

export interface Roster {
  solo: [MonsterId, number][];
  flocks: number;
  flockSize: number;
  // wave 0 is there from the start; each later wave refills as monsters are taken on this floor
  waves: number;
  forage: [ItemId, number][];
}

export interface FloorDef {
  world: { w: number; h: number };
  field: Field;
  // where the hunter arrives: floor 1 from the forest path, deeper floors at the foot of the way down
  start: Vec;
  exits: FloorExit[];
  // the way down to the next floor, or null on the deepest floor there is
  down: Vec | null;
  drainPerSec: number;
  layoutSeed: number;
  roster: Record<Period, Roster>;
}

const W = 1536;
const H = 1024;
const FIELD: Field = { minX: 16, maxX: W - 16, minY: 24, maxY: H - 16 };

export const FLOORS: Record<FloorId, FloorDef> = {
  1: {
    world: { w: W, h: H },
    field: FIELD,
    start: { x: 128, y: 128 },
    exits: [
      { id: "1-e0", x: 96, y: 72 },
      { id: "1-e1", x: 1420, y: 180 },
      { id: "1-e2", x: 760, y: 960 },
    ],
    down: { x: 1380, y: 880 },
    drainPerSec: 0.25,
    layoutSeed: 0x51f15e,
    roster: {
      morning: { solo: [["rabbit", 3]], flocks: 2, flockSize: 3, waves: 3, forage: [["shiitake", 2], ["wild_garlic", 3], ["perilla", 3]] },
      afternoon: { solo: [["rabbit", 4]], flocks: 1, flockSize: 3, waves: 3, forage: [["shiitake", 2], ["wild_garlic", 3], ["perilla", 3]] },
    },
  },
  2: {
    world: { w: W, h: H },
    field: FIELD,
    start: { x: 180, y: 880 },
    exits: [
      { id: "2-e0", x: 1380, y: 150 },
      { id: "2-e1", x: 900, y: 960 },
    ],
    down: null,
    drainPerSec: 0.4,
    layoutSeed: 0x2d0e7a,
    roster: {
      morning: { solo: [["boar", 3], ["bee", 2], ["rabbit", 1]], flocks: 0, flockSize: 0, waves: 3, forage: [["shiitake", 3]] },
      afternoon: { solo: [["boar", 3], ["bee", 3]], flocks: 0, flockSize: 0, waves: 3, forage: [["shiitake", 3]] },
    },
  },
};

export function isFloorId(v: unknown): v is FloorId {
  return v === 1 || v === 2;
}

// The exit closest to `pos` on a floor (the HUD arrow points at it).
export function nearestExit(pos: Vec, floor: FloorId): FloorExit {
  let best = FLOORS[floor].exits[0];
  for (const e of FLOORS[floor].exits) if (Math.hypot(e.x - pos.x, e.y - pos.y) < Math.hypot(best.x - pos.x, best.y - pos.y)) best = e;
  return best;
}
```

- [ ] **Step 4: 층 정의 테스트 통과 확인**

Run: `npx vitest run shared/content/floors.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 층 배치 테스트 쓰기**

`shared/hunt/plan.test.ts` 전체 교체:

```ts
import { describe, expect, it } from "vitest";
import { FLOORS } from "../content/floors";
import { MONSTERS } from "../content/monsters";
import { planFloor, type FloorPlan } from "./plan";

const footOverlaps = (plan: FloorPlan, x: number, y: number, r: number) =>
  plan.objects.some((o) => x > o.foot.x0 - r && x < o.foot.x1 + r && y > o.foot.y0 - r && y < o.foot.y1 + r);

describe("planFloor", () => {
  it("lays out the same floor for the same seed", () => {
    expect(planFloor(42, 1, "morning")).toEqual(planFloor(42, 1, "morning"));
  });
  it("keeps the ground of a floor fixed and moves only who and what is on it", () => {
    const a = planFloor(42, 1, "morning");
    const b = planFloor(43, 1, "morning");
    expect(a.objects).toEqual(b.objects);
    expect(a.spawns).not.toEqual(b.spawns);
    expect(a.nodes).not.toEqual(b.nodes);
  });
  it("gives each floor its own ground", () => {
    expect(planFloor(42, 1, "morning").objects).not.toEqual(planFloor(42, 2, "morning").objects);
  });
  it("names every spawn and gathering spot after its floor, each once", () => {
    for (const floor of [1, 2] as const) {
      const p = planFloor(7, floor, "morning");
      const ids = [...p.spawns.map((s) => s.id), ...p.nodes.map((n) => n.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.startsWith(`${floor}-`)).toBe(true);
    }
  });
  it("brings the floor's roster for the time of day, with its refill waves", () => {
    const count = (p: FloorPlan, m: string, wave = 0) => p.spawns.filter((s) => s.wave === wave && s.monster === m).length;
    const m1 = planFloor(7, 1, "morning");
    expect([count(m1, "rabbit"), count(m1, "chicken"), count(m1, "boar")]).toEqual([3, 6, 0]);
    const a1 = planFloor(7, 1, "afternoon");
    expect([count(a1, "rabbit"), count(a1, "chicken")]).toEqual([4, 3]);
    const m2 = planFloor(7, 2, "morning");
    expect([count(m2, "boar"), count(m2, "bee"), count(m2, "rabbit"), count(m2, "chicken")]).toEqual([3, 2, 1, 0]);
    const wave0 = m1.spawns.filter((s) => s.wave === 0).length;
    expect(m1.spawns.filter((s) => s.wave === 2).length).toBe(wave0);
    expect(m1.nodes.length).toBe(8);
  });
  it("keeps monsters, gathering spots and trees clear of the start, the exits and the way down", () => {
    for (const floor of [1, 2] as const) {
      const f = FLOORS[floor];
      const keep = [f.start, ...f.exits, ...(f.down ? [f.down] : [])];
      for (const seed of [1, 2, 3]) {
        const p = planFloor(seed, floor, "morning");
        for (const s of p.spawns) {
          expect(footOverlaps(p, s.x, s.y, MONSTERS[s.monster].radius)).toBe(false);
          expect(Math.hypot(s.x - f.start.x, s.y - f.start.y)).toBeGreaterThanOrEqual(150);
        }
        for (const n of p.nodes) expect(footOverlaps(p, n.x, n.y, 6)).toBe(false);
        for (const k of keep) expect(footOverlaps(p, k.x, k.y, 24)).toBe(false);
      }
    }
  });
  it("keeps a chicken flock together", () => {
    const p = planFloor(9, 1, "morning");
    const flocks = new Map<string, { x: number; y: number }[]>();
    for (const s of p.spawns.filter((s) => s.flock)) flocks.set(s.flock!, [...(flocks.get(s.flock!) ?? []), s]);
    expect(flocks.size).toBe(6);
    for (const members of flocks.values()) {
      expect(members.length).toBe(3);
      for (const a of members) for (const b of members) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(80);
    }
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run shared/hunt/plan.test.ts`
Expected: FAIL — `planFloor` is not exported.

- [ ] **Step 7: `planFloor` 쓰기**

`shared/hunt/plan.ts` 전체 교체:

```ts
import { FLOORS, type FloorId, type Period } from "../content/floors";
import type { ItemId } from "../content/items";
import { MONSTERS, type MonsterId } from "../content/monsters";
import { OBJECT_KINDS, SMALL_OBJECTS, TREES, type ObjectKind } from "../content/objects";
import type { Rect } from "./geometry";
import { scatter, seededRandom } from "./scatter";

// One floor of the forest as one hunt finds it (hunt v3 design 3). The ground (trees, bushes, rocks) is
// the floor's own and never changes (FLOORS layoutSeed); who lives there and what grows there come from
// the hunt's seed, so the server re-creates the same floor to check the report. Every id starts with the
// floor ("1-s0"), so a report cannot pass a monster off as one from another floor.
export interface FloorPlan {
  floor: FloorId;
  objects: { kind: ObjectKind; x: number; y: number; foot: Rect }[];
  // wave 0 is there when the hunter arrives; wave n refills as monsters are taken on this floor
  spawns: { id: string; monster: MonsterId; x: number; y: number; wave: number; flock?: string }[];
  nodes: { id: string; item: ItemId; x: number; y: number }[];
}

// spots kept open for walking in and out: the arrival, the exits, the way down
const KEEP_OPEN = 60;
const START_KEEP_AWAY = 170;

export function planFloor(seed: number, floor: FloorId, period: Period): FloorPlan {
  const f = FLOORS[floor];
  const area = { minX: 30, maxX: f.world.w - 30, minY: 60, maxY: f.world.h - 10 };
  const open = [f.start, ...f.exits, ...(f.down ? [f.down] : [])].map((p) => ({ x: p.x, y: p.y, r: KEEP_OPEN }));

  // the fixed ground: trees spread out, then bushes and rocks in the gaps
  const ground = f.layoutSeed;
  const pick = seededRandom(ground ^ 0x5bd1e995);
  const objects: FloorPlan["objects"] = [];
  const place = (p: { x: number; y: number }, kind: ObjectKind) => {
    const { foot } = OBJECT_KINDS[kind];
    objects.push({ kind, x: p.x, y: p.y, foot: { x0: p.x - foot.w / 2, x1: p.x + foot.w / 2, y0: p.y - foot.h, y1: p.y } });
  };
  const treeSpots = scatter(ground, area, 46, 78, open);
  for (const p of treeSpots) place(p, TREES[Math.floor(pick() * TREES.length)]);
  for (const p of scatter(ground + 2, area, 34, 60, [...open, ...treeSpots.map((t) => ({ x: t.x, y: t.y, r: 46 }))]))
    place(p, SMALL_OBJECTS[Math.floor(pick() * SMALL_OBJECTS.length)]);

  // who and what: from the hunt's seed, mixed with the floor so each floor differs
  const s0 = seed ^ (floor * 0x9e3779b1);
  const rand = seededRandom(s0 ^ 0x27d4eb2f);
  const clearOf = (x: number, y: number, r: number) =>
    !objects.some((o) => x > o.foot.x0 - r && x < o.foot.x1 + r && y > o.foot.y0 - r && y < o.foot.y1 + r);
  const spots = (s: number, n: number, minDist: number, r: number) =>
    scatter(s, area, n * 4, minDist, [{ ...f.start, r: START_KEEP_AWAY }, ...open]).filter((p) => clearOf(p.x, p.y, r)).slice(0, n);

  const roster = f.roster[period];
  const spawns: FloorPlan["spawns"] = [];
  let n = 0;
  for (let wave = 0; wave < roster.waves; wave++) {
    const solos = roster.solo.flatMap(([m, c]) => Array.from({ length: c }, () => m));
    const soloSpots = spots(s0 + 100 + wave, solos.length, 90, 12);
    solos.forEach((monster, i) => {
      const p = soloSpots[i % soloSpots.length];
      spawns.push({ id: `${floor}-s${n++}`, monster, x: p.x, y: p.y, wave });
    });
    const centres = spots(s0 + 200 + wave, roster.flocks, 160, 40);
    centres.forEach((c, k) => {
      const flock = `${floor}-f${wave}-${k}`;
      for (let m = 0; m < roster.flockSize; m++) {
        // members around the centre, nudged until clear of tree bases
        let x = c.x;
        let y = c.y;
        for (let tries = 0; tries < 12; tries++) {
          const a = rand() * Math.PI * 2;
          const d = 10 + rand() * 24;
          x = c.x + Math.cos(a) * d;
          y = c.y + Math.sin(a) * d;
          if (clearOf(x, y, MONSTERS.chicken.radius)) break;
          x = c.x;
          y = c.y;
        }
        spawns.push({ id: `${floor}-s${n++}`, monster: "chicken", x, y, wave, flock });
      }
    });
  }

  const forage = roster.forage.flatMap(([item, c]) => Array.from({ length: c }, () => item));
  const nodeSpots = spots(s0 + 300, forage.length, 70, 6);
  const nodes = forage.map((item, i) => ({ id: `${floor}-n${i}`, item, x: nodeSpots[i % nodeSpots.length].x, y: nodeSpots[i % nodeSpots.length].y }));

  return { floor, objects, spawns, nodes };
}
```

`shared/balance.ts`: 타입의 `hunt` 블록에서 `world`, `field`, `boarCount` 줄을 지우고 `minMsPerKill` 아래에 다음을 넣는다.

```ts
    // a hunt report needs at least this long per way down taken (server check, hunt v3 design 5.3)
    minMsPerFloor: number;
```

값의 `hunt` 블록에서 `world: …`, `field: …`, `boarCount: 8,`을 지우고 `minMsPerKill: 1500,` 아래에 `minMsPerFloor: 8000,`을 넣는다(월드 크기와 걸을 수 있는 땅은 이제 층마다 `FLOORS`에 있다).

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run shared/content/floors.test.ts shared/hunt/plan.test.ts`
Expected: PASS (13 tests). `scatter` 후보가 모자라 출구 근처 테스트가 깨지면 `spots`의 후보 수(`n * 4`)를 `n * 6`으로 늘린다(Ruling으로 적는다).

- [ ] **Step 9: 커밋**

```bash
git add shared/content/floors.ts shared/content/floors.test.ts shared/hunt/plan.ts shared/hunt/plan.test.ts shared/balance.ts
git commit -m "feat(hunt): forest floors 1-2 with fixed ground, exits and the way down; planFloor per floor and time of day"
```

---

### Task 3: 세이브 v6 (점심 단계, 아침·오후 사냥)

**Files:**
- Modify: `shared/save.ts`
- Modify: `shared/save.test.ts` (테스트 추가)

**Interfaces:**
- Consumes: `type Period` (`shared/content/floors.ts`, 작업 2)
- Produces:
  - `type Stage = "hunt" | "lunch" | "kitchen" | "settle"` — `"hunt"` = 아침 사냥을 기다리거나 하는 중, `"lunch"` = 아침 사냥을 마친 점심(오후 사냥을 기다리거나 하는 중).
  - `interface PendingHunt { id: string; seed: number; zone: Zone; period: Period; startedAt: number }`
  - `SaveData.version: 6`, `newSave()`는 version 6.

- [ ] **Step 1: 테스트 쓰기**

`shared/save.test.ts` 끝에 추가:

```ts
describe("save version 6 (hunt v3: two hunts a day)", () => {
  it("starts a new save at version 6, before the morning hunt", () => {
    expect(newSave()).toMatchObject({ version: 6, stage: "hunt", hunt: null });
  });
  it("keeps the lunch stage and a hunt's time of day", () => {
    const s = readSave({ ...newSave(), stage: "lunch", hunt: { id: "h1", seed: 3, zone: "forest", period: "afternoon", startedAt: 5 } });
    expect(s.stage).toBe("lunch");
    expect(s.hunt).toEqual({ id: "h1", seed: 3, zone: "forest", period: "afternoon", startedAt: 5 });
  });
  it("reads a version 5 save as version 6, a hunt in progress as the morning hunt", () => {
    const v5 = { ...newSave(), version: 5, stage: "hunt", hunt: { id: "h1", seed: 3, zone: "forest", startedAt: 5 } };
    const s = readSave(v5);
    expect(s.version).toBe(6);
    expect(s.hunt?.period).toBe("morning");
  });
  it("reads an unknown time of day as the morning", () => {
    expect(readSave({ ...newSave(), hunt: { id: "h1", seed: 3, zone: "forest", period: "midnight", startedAt: 5 } }).hunt?.period).toBe("morning");
  });
});
```

(`readSave`, `newSave`는 이 파일 위에서 이미 불러온다. 없으면 `import { newSave, readSave } from "./save";`를 맨 위에 더한다.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run shared/save.test.ts`
Expected: FAIL — version 5 ≠ 6, `"lunch"`가 `"hunt"`로 읽힘.

- [ ] **Step 3: 세이브 고치기**

`shared/save.ts`:

1. 맨 위 import에 `import type { Period } from "./content/floors";` 추가.
2. `PendingHunt`에 `period: Period;`를 `zone` 다음 줄에 추가하고 주석을 고친다:

```ts
// A hunt the server has started and not yet settled: its seed decides every floor's monsters and
// gathering spots; `period` is the morning or the afternoon hunt (hunt v3 design 3).
export interface PendingHunt {
  id: string;
  seed: number;
  zone: Zone;
  period: Period;
  startedAt: number;
}
```

3. `Stage`를 바꾼다:

```ts
// Where the day is (hunt v3 design 3): the morning hunt, lunch (after it; the afternoon hunt starts from
// here), the evening kitchen, the settle screen. The server moves it along, so a reload cannot skip ahead
// or hunt a third time in one day.
export type Stage = "hunt" | "lunch" | "kitchen" | "settle";
```

4. `SaveData`의 `version: 5;` → `version: 6;`, `newSave()`의 `version: 5,` → `version: 6,`.
5. 단계 읽기를 한 함수로 모은다(파일 안 `readSave`·`fromV4` 위에):

```ts
const isStage = (v: unknown): v is Stage => v === "hunt" || v === "lunch" || v === "kitchen" || v === "settle";
```

`fromV4`의 `r.stage === "hunt" || r.stage === "kitchen" || r.stage === "settle" ? r.stage : "hunt"` → `isStage(r.stage) ? r.stage : "hunt"`, `readSave` 끝의 같은 식도 `isStage(r.stage) ? r.stage : "hunt"`로.

6. `readHunt`:

```ts
function readHunt(raw: unknown): PendingHunt | null {
  const h = raw as Partial<PendingHunt> | null;
  if (!h || typeof h !== "object") return null;
  if (typeof h.id !== "string" || typeof h.seed !== "number" || h.zone !== "forest" || typeof h.startedAt !== "number") return null;
  // a hunt saved before hunt v3 (or with an unknown time of day) is the morning hunt
  const period = h.period === "afternoon" ? "afternoon" : "morning";
  return { id: h.id, seed: h.seed, zone: h.zone, period, startedAt: h.startedAt };
}
```

7. `readSave`의 버전 분기: `if (r.version === 2 || r.version === 3 || r.version === 4) return readSave(fromV4(r));` 아래에

```ts
  // version 6 (hunt v3) only adds the lunch stage and the hunt's time of day, both read with defaults
  if (r.version === 5) return readSave({ ...r, version: 6 });
```

를 넣고, `if (r.version !== 5) return newSave();` → `if (r.version !== 6) return newSave();`, 반환 객체의 `version: 5,` → `version: 6,`. `fromV4`가 돌려주는 `version: 5`는 그대로 둔다(v5 → v6 분기를 한 번 더 지난다).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run shared/save.test.ts`
Expected: PASS. 기존 테스트 중 `version: 5`를 기대하던 줄이 있으면 6으로 고친다(마이그레이션 의미는 그대로).

- [ ] **Step 5: 커밋**

```bash
git add shared/save.ts shared/save.test.ts
git commit -m "feat(save): version 6 with the lunch stage and the hunt's time of day; version 5 reads as the morning"
```

---

### Task 4: 서버 규칙 — 하루 두 번, 층·계단·출구 정산

**Files:**
- Modify: `shared/actions.ts`
- Create: `shared/hunt/settle.test.ts`
- Modify: `shared/stage.test.ts` (단계 테스트 교체·추가)
- Modify: `shared/actions.test.ts`, `shared/growth.test.ts`, `shared/kitchen/actions.test.ts`, `shared/lunch.test.ts` (보고에 `exit` 추가)

**Interfaces:**
- Consumes: `FLOORS`, `FloorId`, `isFloorId`, `Period` (작업 2), `planFloor`, `FloorPlan` (작업 2), `BALANCE.hunt.minMsPerFloor` (작업 2), `Stage`·`PendingHunt.period` (작업 3)
- Produces:
  - `type HuntEvent = { kill: string; grade: "premium" | "normal" } | { gather: string } | { down: FloorId }`
  - `Action`의 `finishHunt`가 `{ type: "finishHunt"; huntId: string; events: HuntEvent[]; exit: string | null; ko: boolean }`로, 새 행동 `{ type: "skipHunt" }`.
  - 규칙: `startHunt`는 `"hunt"` 단계면 아침, `"lunch"` 단계면 오후. `finishHunt`는 아침이면 `"lunch"`, 오후면 `"kitchen"`. `skipHunt`는 `"lunch"`에서 `"kitchen"`으로. `endDay`는 `"hunt"`·`"lunch"`·장사 중이면 거부.

- [ ] **Step 1: 정산 테스트 쓰기**

`shared/hunt/settle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyAction, type ActionContext, type HuntEvent } from "../actions";
import { BALANCE } from "../balance";
import { FLOORS } from "../content/floors";
import { newSave, type SaveData } from "../save";
import { planFloor } from "./plan";

const T0 = 1_000_000;
const ctx = (now = T0): ActionContext => ({ now, random: () => 0.4 });
const H = BALANCE.hunt;

function started(save: SaveData = newSave()): SaveData {
  const r = applyAction(save, { type: "startHunt", zone: "forest" }, ctx());
  if (r.error) throw new Error(r.error);
  return r.save;
}
const finish = (s: SaveData, events: HuntEvent[], exit: string | null, ko = false, now = T0 + 600_000) =>
  applyAction(s, { type: "finishHunt", huntId: s.hunt!.id, events, exit, ko }, ctx(now));
const count = (items: Record<string, number>) => Object.values(items).reduce((a, b) => a + b, 0);

describe("finishHunt on the forest floors", () => {
  it("comes home through an exit of the floor the hunter is on", () => {
    const s = started();
    expect(finish(s, [], "1-e0").error).toBeUndefined();
    expect(finish(s, [], "2-e0").error).toBe("bad_hunt");
    expect(finish(s, [], "nowhere").error).toBe("bad_hunt");
    expect(finish(s, [], null).error).toBe("bad_hunt");
  });
  it("comes home without an exit only when knocked out, with half the bag", () => {
    const s = started();
    const plan = planFloor(s.hunt!.seed, 1, "morning");
    const four = plan.spawns.filter((x) => x.wave === 0).slice(0, 4).map((x): HuntEvent => ({ kill: x.id, grade: "normal" }));
    const ko = finish(s, four, null, true);
    expect(ko.error).toBeUndefined();
    expect(count(ko.save.items)).toBeLessThanOrEqual(2);
    expect(finish(s, four, "1-e0", true).error).toBe("bad_hunt");
  });
  it("takes floor 2 monsters only after going down, and the way out is then on floor 2", () => {
    const s = started();
    const two = planFloor(s.hunt!.seed, 2, "morning").spawns[0];
    expect(finish(s, [{ kill: two.id, grade: "normal" }], "1-e0").error).toBe("bad_hunt");
    const ok = finish(s, [{ down: 2 }, { kill: two.id, grade: "normal" }], "2-e1");
    expect(ok.error).toBeUndefined();
    expect(count(ok.save.items)).toBe(1);
    expect(finish(s, [{ down: 2 }], "1-e0").error).toBe("bad_hunt");
  });
  it("refuses a floor-1 monster after going down, a skipped floor and a way down that is not there", () => {
    const s = started();
    const one = planFloor(s.hunt!.seed, 1, "morning").spawns[0];
    expect(finish(s, [{ down: 2 }, { kill: one.id, grade: "normal" }], "2-e0").error).toBe("bad_hunt");
    expect(finish(s, [{ down: 3 as never }], "1-e0").error).toBe("bad_hunt");
    expect(finish(s, [{ down: 2 }, { down: 3 as never }], "2-e0").error).toBe("bad_hunt");
  });
  it("needs time for every way down and every monster taken", () => {
    const s = started();
    const two = planFloor(s.hunt!.seed, 2, "morning").spawns[0];
    const events: HuntEvent[] = [{ down: 2 }, { kill: two.id, grade: "normal" }];
    const need = H.minMsPerFloor + H.minMsPerKill;
    expect(finish(s, events, "2-e0", false, T0 + need - 1).error).toBe("bad_hunt");
    expect(finish(s, events, "2-e0", false, T0 + need).error).toBeUndefined();
  });
  it("counts refills per floor: a floor's r-th refill only after r+1 kills on that floor", () => {
    const s = started();
    const p1 = planFloor(s.hunt!.seed, 1, "morning");
    const firstRefill = p1.spawns.find((x) => x.wave > 0)!;
    expect(finish(s, [{ kill: firstRefill.id, grade: "normal" }], "1-e0").error).toBe("bad_hunt");
    const w0 = p1.spawns.find((x) => x.wave === 0)!;
    expect(finish(s, [{ kill: w0.id, grade: "normal" }, { kill: firstRefill.id, grade: "normal" }], "1-e0").error).toBeUndefined();
  });
  it("lists the floors' exits the way the scene shows them", () => {
    expect(FLOORS[1].exits.length).toBe(3);
  });
});

describe("two hunts a day", () => {
  it("goes morning hunt -> lunch -> afternoon hunt -> evening kitchen", () => {
    const morning = started();
    expect(morning.hunt!.period).toBe("morning");
    const lunch = finish(morning, [], "1-e0").save;
    expect(lunch.stage).toBe("lunch");
    const afternoon = started(lunch);
    expect(afternoon.hunt!.period).toBe("afternoon");
    const evening = finish(afternoon, [], "1-e2").save;
    expect(evening.stage).toBe("kitchen");
    expect(applyAction(evening, { type: "startHunt", zone: "forest" }, ctx()).error).toBe("wrong_stage");
  });
  it("brings the afternoon roster on the afternoon hunt", () => {
    const afternoon = started(finish(started(), [], "1-e0").save);
    const p = planFloor(afternoon.hunt!.seed, 1, "afternoon");
    const rabbits = p.spawns.filter((x) => x.wave === 0 && x.monster === "rabbit");
    const r = finish(afternoon, rabbits.map((x): HuntEvent => ({ kill: x.id, grade: "normal" })), "1-e0");
    expect(r.error).toBeUndefined();
    expect(rabbits.length).toBe(4);
  });
  it("lets lunch skip the afternoon straight to the evening kitchen, and only from lunch", () => {
    const lunch = finish(started(), [], "1-e0").save;
    expect(applyAction(lunch, { type: "skipHunt" }, ctx()).save.stage).toBe("kitchen");
    expect(applyAction(newSave(), { type: "skipHunt" }, ctx()).error).toBe("wrong_stage");
    expect(applyAction(started(lunch), { type: "skipHunt" }, ctx()).error).toBe("wrong_stage");
  });
  it("does not end the day at lunch", () => {
    const lunch = finish(started(), [], "1-e0").save;
    expect(applyAction(lunch, { type: "endDay" }, ctx()).error).toBe("wrong_stage");
  });
  it("packs a lunchbox at lunch for the afternoon", () => {
    const lunch = { ...finish(started(), [], "1-e0").save, dishes: { grilled_belly: 1 }, items: { "boar_belly:normal": 1 } };
    expect(applyAction(lunch, { type: "packLunch", dishes: ["grilled_belly"] }, ctx()).save.lunchbox).toEqual(["grilled_belly"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run shared/hunt/settle.test.ts`
Expected: FAIL — 지금 규칙은 `exit`를 모르고(`finish(s, [], "2-e0")`도 통과) `"lunch"`가 없다.

- [ ] **Step 3: 서버 규칙 고치기**

`shared/actions.ts`:

1. import: `import { planHunt } from "./hunt/plan";` → `import { planFloor, type FloorPlan } from "./hunt/plan";`, 그리고 `import { FLOORS, isFloorId, type FloorId } from "./content/floors";` 추가.
2. `HuntEvent`와 `Action`:

```ts
// What a hunt report lists, in the order things happened (hunt v3 design 5.3: the client says what it
// took and where it went, the server re-creates each floor from the seed to check it and decides the
// drops itself). `down` is taking the way down to that floor.
export type HuntEvent = { kill: string; grade: "premium" | "normal" } | { gather: string } | { down: FloorId };

export type Action =
  | { type: "startHunt"; zone: Zone }
  | { type: "finishHunt"; huntId: string; events: HuntEvent[]; exit: string | null; ko: boolean }
  | { type: "skipHunt" }
  // …(나머지 줄은 그대로)
```

3. `settleHunt` 전체 교체:

```ts
// Re-creates the hunt floor by floor from its seed and follows the report: every way down taken from the
// floor the hunter is on to the next one that exists; every kill a real spawn of the current floor, taken
// once, the floor's r-th refill only after r+1 kills on that floor; every gathering spot of the current
// floor, taken once; home through an exit of the last floor (or knocked out, with no exit); not faster
// than minMsPerKill a kill and minMsPerFloor a way down. Items go into the bag in report order until it
// is full. Returns the items gained, or null for a report that cannot be true.
function settleHunt(save: SaveData, a: Record<string, unknown>, now: number): Record<string, number> | null {
  const hunt = save.hunt;
  if (!hunt || a.huntId !== hunt.id || !Array.isArray(a.events) || a.events.length > MAX_EVENTS || typeof a.ko !== "boolean") return null;
  if (a.ko ? a.exit !== null : typeof a.exit !== "string") return null;
  const plans = new Map<FloorId, FloorPlan>();
  const planOf = (f: FloorId) => plans.get(f) ?? plans.set(f, planFloor(hunt.seed, f, hunt.period)).get(f)!;
  let floor: FloorId = 1;
  const taken = new Set<string>();
  const killsOn = new Map<FloorId, number>();
  let kills = 0;
  let descents = 0;
  let bag: Record<string, number> = {};
  for (const raw of a.events as unknown[]) {
    const e = raw as { kill?: unknown; grade?: unknown; gather?: unknown; down?: unknown } | null;
    if (!e || typeof e !== "object") return null;
    const plan = planOf(floor);
    if (e.down !== undefined) {
      if (!FLOORS[floor].down || e.down !== floor + 1 || !isFloorId(e.down)) return null;
      floor = e.down;
      descents++;
    } else if (typeof e.kill === "string") {
      const spawn = plan.spawns.find((s) => s.id === e.kill);
      if (!spawn || taken.has(e.kill) || (e.grade !== "premium" && e.grade !== "normal")) return null;
      const refill = plan.spawns.filter((s) => s.wave > 0).indexOf(spawn);
      const onFloor = killsOn.get(floor) ?? 0;
      if (refill >= 0 && onFloor < refill + 1) return null;
      taken.add(e.kill);
      killsOn.set(floor, onFloor + 1);
      kills++;
      bag = addToBag(bag, itemKey(dropFor(hunt.seed, spawn), e.grade), bagSlots(save)).bag;
    } else if (typeof e.gather === "string") {
      const node = plan.nodes.find((n) => n.id === e.gather);
      if (!node || taken.has(e.gather)) return null;
      taken.add(e.gather);
      bag = addToBag(bag, itemKey(node.item), bagSlots(save)).bag;
    } else return null;
  }
  if (!a.ko && !FLOORS[floor].exits.some((x) => x.id === a.exit)) return null;
  if (now - hunt.startedAt < kills * BALANCE.hunt.minMsPerKill + descents * BALANCE.hunt.minMsPerFloor) return null;
  return a.ko ? koPenalty(bag) : bag;
}
```

4. `applyAction`의 `startHunt`·`finishHunt`·`endDay`를 바꾸고 `skipHunt`를 더한다:

```ts
    case "startHunt": {
      if (a.zone !== "forest") return { save, error: "bad_action" };
      // the morning hunt from the day's start, the afternoon hunt from lunch (hunt v3 design 3)
      if ((save.stage !== "hunt" && save.stage !== "lunch") || save.hunt) return { save, error: "wrong_stage" };
      const period = save.stage === "hunt" ? "morning" : "afternoon";
      const seed = Math.floor(ctx.random() * 2 ** 31);
      const id = `h${ctx.now.toString(36)}${Math.floor(ctx.random() * 1e9).toString(36)}`;
      return { save: { ...save, hunt: { id, seed, zone: a.zone, period, startedAt: ctx.now } } };
    }
    case "finishHunt": {
      const gained = settleHunt(save, a, ctx.now);
      if (!gained) return { save, error: "bad_hunt" };
      const items = { ...save.items };
      for (const [k, n] of Object.entries(gained)) items[k] = (items[k] ?? 0) + n;
      // what came home shows on the cookbook's silhouettes from now on (restaurant v2 design 3)
      const ids = Object.keys(gained).map((k) => parseItemKey(k)!.id);
      const seenItems = [...new Set<ItemId>([...save.seenItems, ...ids])];
      // after the morning hunt comes lunch; after the afternoon one, the evening kitchen
      const stage = save.hunt!.period === "morning" ? "lunch" : "kitchen";
      return { save: { ...save, items, hunt: null, seenItems, stage, lunchbox: [] } };
    }
    case "skipHunt":
      // staying home this afternoon: straight on to the evening kitchen
      if (save.stage !== "lunch" || save.hunt) return { save, error: "wrong_stage" };
      return { save: { ...save, stage: "kitchen" } };
```

`endDay`의 조건을 `if (save.stage === "hunt" || save.stage === "lunch" || save.service) return { save, error: "wrong_stage" };`로, 위 주석에 "and never at lunch (the afternoon is still to come)"를 더한다.

5. 다른 테스트의 보고 고치기: `shared/actions.test.ts`, `shared/growth.test.ts`, `shared/kitchen/actions.test.ts`, `shared/lunch.test.ts`, `shared/stage.test.ts`에서 `type: "finishHunt"` 객체마다 `exit: "1-e0",`을 넣고(`ko: true`인 곳은 `exit: null,`), `planHunt(seed, "forest")`는 `planFloor(seed, 1, "morning")`으로 바꾼다. 테스트가 1층에 없는 몬스터(멧돼지·벌)를 쓰면 `planFloor(seed, 2, "morning")`의 몬스터로 바꾸고 보고 앞에 `{ down: 2 }`를, 출구를 `"2-e0"`으로, 시간에 `BALANCE.hunt.minMsPerFloor`를 더한다. `stage.test.ts`의 "moves to the kitchen once the hunt is settled" 테스트는 "아침 사냥 뒤에는 점심, 오후 사냥 뒤에 주방"으로 고친다:

```ts
function hunted(): SaveData {
  let s = newSave();
  for (const exit of ["1-e0", "1-e1"]) {
    s = applyAction(s, { type: "startHunt", zone: "forest" }, ctx()).save;
    const r = applyAction(s, { type: "finishHunt", huntId: s.hunt!.id, events: [], exit, ko: false }, ctx());
    if (r.error) throw new Error(r.error);
    s = r.save;
  }
  return s;
}
```

그리고 "moves to the kitchen once the hunt is settled, and refuses a second hunt that day"를 "moves to the kitchen after the afternoon hunt, and refuses a third hunt that day"로 이름만 바꾼다(본문 그대로 통과한다).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run shared`
Expected: PASS (새 `settle.test.ts` 12개 포함, 실패 0).

- [ ] **Step 5: 커밋**

```bash
git add shared
git commit -m "feat(hunt): the server follows the report floor by floor, home only through an exit; morning and afternoon hunts with lunch between"
```

---

### Task 5: 기력 계산과 전송·서버 하네스

**Files:**
- Create: `shared/hunt/stamina.ts`
- Create: `shared/hunt/stamina.test.ts`
- Modify: `src/net/transport.test.ts:32` (보고에 `exit`)
- Modify: `server/test/server.test.ts` (보고에 `exit`, 하루 두 번 테스트 하나)

**Interfaces:**
- Consumes: `FLOORS`, `FloorId` (작업 2)
- Produces: `drainStamina(stamina: number, dtMs: number, floor: FloorId): number`, `LOW_STAMINA = 0.25` (최대치에 대한 비율, 경고 연출 기준) (`shared/hunt/stamina.ts`)

- [ ] **Step 1: 테스트 쓰기**

`shared/hunt/stamina.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FLOORS } from "../content/floors";
import { drainStamina } from "./stamina";

describe("drainStamina", () => {
  it("drains by the floor's rate per second", () => {
    expect(drainStamina(100, 1000, 1)).toBeCloseTo(100 - FLOORS[1].drainPerSec);
    expect(drainStamina(100, 2000, 2)).toBeCloseTo(100 - 2 * FLOORS[2].drainPerSec);
  });
  it("never goes below zero", () => {
    expect(drainStamina(0.1, 60_000, 2)).toBe(0);
  });
  it("lasts about six and a half minutes on floor 1 from 100 (user-approved draft)", () => {
    expect(100 / FLOORS[1].drainPerSec / 60).toBeCloseTo(6.67, 1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run shared/hunt/stamina.test.ts`
Expected: FAIL — `Cannot find module './stamina'`.

- [ ] **Step 3: 구현**

`shared/hunt/stamina.ts`:

```ts
import { FLOORS, type FloorId } from "../content/floors";

// Stamina (hunt v3 design 3, Dave the Diver's oxygen): one gauge that runs down with time, faster on
// deeper floors, and with every hit taken; a lunch fills it; at zero the hunter goes down. Its top is the
// armour upgrade's health table until the stamina tank comes (stage 3).
export const LOW_STAMINA = 0.25;

export function drainStamina(stamina: number, dtMs: number, floor: FloorId): number {
  return Math.max(0, stamina - (FLOORS[floor].drainPerSec * dtMs) / 1000);
}
```

- [ ] **Step 4: 전송·하네스 테스트 고치기**

`src/net/transport.test.ts:32`: `{ type: "finishHunt", huntId: "nope", events: [], ko: false }` → `{ type: "finishHunt", huntId: "nope", events: [], exit: "1-e0", ko: false }`.

`server/test/server.test.ts`: `"settles an empty hunt"`의 보고에 `exit: "1-e0",`, `"refuses a forged hunt"`의 보고에 `exit: "1-e0",`을 넣고 테스트 하나를 더한다:

```ts
  test("goes out twice a day: morning, lunch, afternoon", async (server) => {
    server.connect({ account: "two-hunts" });
    const m = await server.act({ type: "startHunt", zone: "forest" });
    const lunch = await server.act({ type: "finishHunt", huntId: m.hunt.id, events: [], exit: "1-e0", ko: false });
    expect(lunch.stage).toBe("lunch");
    const a = await server.act({ type: "startHunt", zone: "forest" });
    expect(a.hunt.period).toBe("afternoon");
  });
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run shared/hunt/stamina.test.ts src/net/transport.test.ts`
Expected: PASS.
서버 하네스는 사용자에게 "서버 테스트를 돌린다, 오류 창이 뜨면 닫아 달라"고 알린 뒤 `npm run test:server` — Expected: 9 passed.

- [ ] **Step 6: 커밋**

```bash
git add shared/hunt/stamina.ts shared/hunt/stamina.test.ts src/net/transport.test.ts server/test/server.test.ts
git commit -m "feat(hunt): stamina drains by floor; transport and server harness speak the floor report"
```

---

### Task 6: 하루 흐름 화면 — 점심과 오후 사냥

**Files:**
- Modify: `src/screens/DayFlow.tsx`
- Modify: `src/screens/kitchen/Kitchen.tsx`
- Modify: `src/screens/kitchen/kitchen.css`
- Modify: `src/i18n/ko.ts`, `src/i18n/en.ts`
- Modify: `src/game/scenes/HuntScene.ts` (`HuntResult`·`HuntData` 타입만: 실제 층 화면은 작업 7)

**Interfaces:**
- Consumes: `Stage`(`"lunch"` 포함), `PendingHunt.period` (작업 3), `skipHunt`, `finishHunt.exit` (작업 4)
- Produces:
  - `HuntResult = { events: HuntEvent[]; exit: string | null; ko: boolean }`, `HuntData`에 `period: Period` 추가 (`src/game/scenes/HuntScene.ts`)
  - `Kitchen`의 새 prop `mode: "evening" | "lunch"`와 `onHunt`·`onSkip`(점심에서만 씀)

- [ ] **Step 1: 사냥 결과 타입 바꾸기**

`src/game/scenes/HuntScene.ts`:

```ts
// What the hunt hands to the day flow when it ends (PhaserGame forwards the "hunt:end" event): what was
// taken in order, the exit it left by (null when knocked out).
export interface HuntResult {
  events: HuntEvent[];
  exit: string | null;
  ko: boolean;
}
```

`HuntData`에 `period: Period;`(import `type Period` from `../../../shared/content/floors`)를 `zone` 다음에 넣는다. `endHunt(ko: boolean)`는 작업 7에서 `endHunt(ko: boolean, exit: string | null)`로 바뀐다. 이 작업에서는 `const result: HuntResult = { events: [...this.report], exit: null, ko };`로만 맞춘다.

- [ ] **Step 2: 점심 문구 추가**

`src/i18n/ko.ts` (`"phase.settle"` 줄 다음):

```ts
  "phase.lunch": "점심",
  "lunch.title": "반달이네 · 점심 주방",
  "lunch.goHunt": "오후 사냥 나가기",
  "lunch.skip": "오후는 쉬기",
  "lunch.upgrades": "업그레이드",
```

`src/i18n/en.ts` 같은 자리:

```ts
  "phase.lunch": "Lunch",
  "lunch.title": "Bandal's · Lunch kitchen",
  "lunch.goHunt": "Afternoon hunt",
  "lunch.skip": "Rest this afternoon",
  "lunch.upgrades": "Upgrades",
```

- [ ] **Step 3: 주방에 점심 모드 넣기**

`src/screens/kitchen/Kitchen.tsx`:

- props에 `mode?: "evening" | "lunch"`, `onHunt?: () => void`, `onSkip?: () => void`, `onUpgrades?: () => void`를 더한다(`onReady`는 저녁에서만 쓰므로 `onReady?:`로).
- 탭: `const tabs: Tab[] = mode === "lunch" ? ["lunch"] : TABS;`, `useState<Tab>(mode === "lunch" ? "lunch" : "cookbook")`. 탭 버튼은 `tabs.map(...)`.
- 제목: `{t(mode === "lunch" ? "lunch.title" : "kitchen.title")}`.
- 아래 버튼:

```tsx
      {mode === "lunch" ? (
        <div className="kitchen-lunch-actions">
          <button className="ui-btn" disabled={busy} onClick={onUpgrades}>{t("lunch.upgrades")}</button>
          <button className="ui-btn" disabled={busy} onClick={onSkip}>{t("lunch.skip")}</button>
          <button className="ui-btn" disabled={busy} onClick={onHunt}>{t("lunch.goHunt")}</button>
        </div>
      ) : (
        <button className="ui-btn kitchen-ready" disabled={busy || !canOpen(save.items, save.dishes, menu)} onClick={() => onReady?.(menu)}>
          {t("kitchen.ready")}
        </button>
      )}
```

- 맨 위 주석에 "At lunch (hunt v3 design 3) the same room shows only the lunchbox, the upgrades and the way back out to the afternoon hunt."를 더한다.

`src/screens/kitchen/kitchen.css` (`.kitchen-ready` 아래):

```css
/* lunch: upgrades, rest, and the afternoon hunt in one row where the open button stands in the evening */
.kitchen-lunch-actions { position: absolute; left: 50%; bottom: calc(7px * var(--s)); transform: translateX(-50%); display: flex; gap: calc(8px * var(--s)); z-index: 2; }
```

- [ ] **Step 4: 하루 흐름에 점심 넣기**

`src/screens/DayFlow.tsx`:

- `type Phase = "hunt" | "lunch" | "kitchen" | "service" | "settle";`, `PHASE_NAME`에 `lunch: "phase.lunch",`.
- 맨 위 주석: `// One day (hunt v3 design 3): morning hunt -> lunch -> afternoon hunt -> kitchen -> service -> settle -> next day.`
- `load()`: `setPhase(s.service ? "service" : s.hunt ? "hunt" : s.stage);`
- 자동 출발 effect: `if (save && phase === "hunt" && save.stage === "hunt" && !save.hunt && !failed) void act({ type: "startHunt", zone: "forest" }, "hunt");` (오후 사냥은 점심의 버튼으로만 나간다.)
- 사냥 화면:

```tsx
      {phase === "hunt" && save.hunt && (
        <PhaserGame
          key={save.hunt.id}
          hunt={{ huntId: save.hunt.id, seed: save.hunt.seed, zone: save.hunt.zone, period: save.hunt.period, stats: huntStats(save), bagSlots: bagSlots(save), lunchbox: save.lunchbox.map((dish) => ({ dish, heal: Math.round(dishPrice(dish, save.dishes[dish] ?? 1) * BALANCE.lunch.healPerGold) })) }}
          onHuntEnd={(r: HuntResult) => act({ type: "finishHunt", huntId: save.hunt!.id, events: r.events, exit: r.exit, ko: r.ko }, save.hunt!.period === "morning" ? "lunch" : "kitchen")}
        />
      )}
```

- 점심 화면(주방 줄 위):

```tsx
      {phase === "lunch" && (
        <Kitchen
          mode="lunch"
          save={save}
          busy={busy}
          act={(a) => void act(a, "lunch")}
          onHunt={() => void act({ type: "startHunt", zone: "forest" }, "hunt")}
          onSkip={() => void act({ type: "skipHunt" }, "kitchen")}
          onUpgrades={() => setShopping(true)}
        />
      )}
      {phase === "lunch" && shopping && <Upgrades save={save} busy={busy} act={(a) => void act(a, "lunch")} onClose={() => setShopping(false)} />}
```

- 아래 막대는 주방과 같이 점심에도 숨긴다: `{phase !== "kitchen" && phase !== "lunch" && (`.
- 거절된 사냥 보고의 "빈손으로 돌아오기"는 출구 없이 기절로 보낸다(가방이 비어 있으니 잃는 것도 없다):

```tsx
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "finishHunt", huntId: save.hunt?.id ?? "", events: [], exit: null, ko: true }, save.hunt?.period === "afternoon" ? "kitchen" : "lunch")}>{t("error.emptyHanded")}</button>
```

- [ ] **Step 5: 타입·테스트 확인**

Run: `npx vitest run src shared`
Expected: 통과. (`npm run typecheck`는 사냥 화면이 아직 `planHunt`·`H.world`를 써서 작업 7까지 깨져 있다. 점심 화면 확인은 Step 6의 실제 화면으로 한다 — vite 개발 서버는 타입 오류가 있어도 돈다.)

- [ ] **Step 6: 실제 화면 확인**

점심 시드 페이지를 만든다: `art-src/mockups/seed-settle.html`을 복사해 `art-src/mockups/seed-lunch.html`(`version: 6`, `stage: "lunch"`)로. 그리고 찍는다:

```bash
S="<스크래치 폴더>" SEED=seed-lunch node art-src/mockups/tools/shot.mjs "$S/lunch" "1"
```

Expected: 도시락 탭만 보이고, 아래에 [업그레이드] [오후는 쉬기] [오후 사냥 나가기]가 버튼 안쪽 면에 글자가 들어간 채로 겹치지 않는다. 사용자에게 보여 준다.

- [ ] **Step 7: 커밋**

```bash
git add src/screens src/i18n src/game/scenes/HuntScene.ts art-src/mockups/seed-lunch.html
git commit -m "feat(day): lunch between the morning and afternoon hunts (lunchbox, upgrades, rest or go out again)"
```

---

### Task 7: 사냥 화면 — 층·계단·출구·기력

**Files:**
- Modify: `src/game/scenes/HuntScene.ts`
- Modify: `src/game/hunt/mobs.ts` (월드 크기를 장면에서 받도록, 필요한 곳만)
- Modify: `src/i18n/ko.ts`, `src/i18n/en.ts`

**Interfaces:**
- Consumes: `FLOORS`, `FloorId`, `nearestExit` (작업 2), `planFloor`, `FloorPlan` (작업 2), `drainStamina`, `LOW_STAMINA` (작업 5), `HuntResult`·`HuntData.period` (작업 6), 텍스처 `art/test/hunt/exit.png`·`stairs.png` (작업 1)
- Produces: `"hunt:end"` 이벤트가 `{ events, exit, ko }`를 보낸다.

- [ ] **Step 1: 한 판 상태와 층 시작**

장면은 층마다 다시 시작하고, 층을 넘어 이어지는 것은 `Run` 하나에 담는다:

```ts
// What carries over from floor to floor within one hunt (hunt v3 design 3): the scene restarts on each
// way down with the same Run.
interface Run {
  floor: FloorId;
  stamina: number;
  bag: Record<string, number>;
  report: HuntEvent[];
  eaten: boolean[];
}

export interface HuntData {
  huntId: string;
  seed: number;
  zone: Zone;
  period: Period;
  stats: { meleeDamage: number; rangedDamage: number; rangedRange: number; maxHp: number };
  bagSlots: number;
  lunchbox: { dish: DishId; heal: number }[];
  // set by the scene itself when it restarts on the next floor
  run?: Run;
}
```

`init(data)`:

```ts
    this.huntData = data;
    this.run = data.run ?? { floor: 1, stamina: data.stats.maxHp, bag: {}, report: [], eaten: this.huntData.lunchbox.map(() => false) };
    this.floorDef = FLOORS[this.run.floor];
    this.plan = planFloor(data.seed, this.run.floor, data.period);
    this.player = { pos: { ...this.floorDef.start }, aim: { x: 1, y: 0 }, face: { x: 0, y: 1 }, cooldownMs: 0, harpoonCooldownMs: 0, swingMs: 0, comboStep: 0, msSinceSwing: Infinity, down: false };
```

- `Player`에서 `hp`를 지우고, 기력은 `this.run.stamina`, 최대치는 `this.maxStamina = data.stats.maxHp`.
- `this.bag`·`this.report`를 쓰던 곳을 모두 `this.run.bag`·`this.run.report`로 바꾼다(가방 추가, 보고 추가, 정산).
- `H.world`·`H.field`를 쓰던 곳을 모두 `this.floorDef.world`·`this.floorDef.field`로 바꾼다(타일 배경, 카메라 범위, 이동 제한, 작살 끌어오기, 몬스터 걸음 `stepMob(..., this.floorDef.field, ...)`).
- 먹은 도시락: `sessionStorage` 대신 `this.run.eaten`이 층을 넘어 이어지고, 새로고침 대비 저장은 지금처럼 `rememberEaten()`이 `this.run.eaten`을 적는다.

- [ ] **Step 2: 출구·계단 놓기와 E로 쓰기**

`preload()`에 `this.load.image("exit", artUrl("test/hunt/exit.png")); this.load.image("stairs", artUrl("test/hunt/stairs.png"));`.

`create()`에서 물체 다음:

```ts
    for (const e of this.floorDef.exits) this.add.image(e.x, e.y, "exit").setOrigin(0.5, 0.9).setDepth(e.y);
    if (this.floorDef.down) this.add.image(this.floorDef.down.x, this.floorDef.down.y, "stairs").setOrigin(0.5, 0.7).setDepth(this.floorDef.down.y - 20);
    this.floorCard();
```

가까운 것 찾기(채집과 같은 E 키, 같은 모바일 행동 버튼). 우선순위: 출구 > 계단 > 채집물:

```ts
const USE_RANGE = 28;

  // What E (or the action button) would use here: an exit, the way down, else a gathering spot.
  private nearestUse(): { kind: "exit"; id: string } | { kind: "down" } | { kind: "node"; node: Node } | null {
    const p = this.player.pos;
    const exit = this.floorDef.exits.find((e) => distance(p, e) <= USE_RANGE);
    if (exit) return { kind: "exit", id: exit.id };
    if (this.floorDef.down && distance(p, this.floorDef.down) <= USE_RANGE) return { kind: "down" };
    const node = this.nearestNode();
    return node ? { kind: "node", node } : null;
  }
```

`updatePlayer`의 E 처리(`this.gatherQueued`)를 바꾼다:

```ts
    if (this.gatherQueued) {
      this.gatherQueued = false;
      const use = this.nearestUse();
      if (use?.kind === "exit") return this.endHunt(false, use.id);
      if (use?.kind === "down") return this.goDown();
      if (use?.kind === "node" && !this.gathering) this.gathering = { node: use.node, ms: 0 };
    }
```

E 안내 글(`gatherHint`)은 대상에 따라 `t("hunt.useExit")` / `t("hunt.useDown")` / `t("hunt.gather")`, 모바일 버튼도 같은 조건으로 보인다.

계단:

```ts
  // The way down: the floor's report line, then the next floor with the same Run (stamina, bag, report).
  private goDown() {
    const next = (this.run.floor + 1) as FloorId;
    if (!this.floorDef.down || !isFloorId(next) || this.ended) return;
    this.run.report.push({ down: next });
    this.ended = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.restart({ ...this.huntData, run: { ...this.run, floor: next } }));
  }
```

`create()` 끝에 `this.cameras.main.fadeIn(300, 0, 0, 0);`.

- [ ] **Step 3: 층 이름 카드**

```ts
  // "Floor 2 · Deep forest" sliding across on arrival (hunt v3 design 5.1).
  private floorCard() {
    const card = this.add.container(GAME_WIDTH / 2, 70).setScrollFactor(0).setDepth(10002);
    const plate = kitSlice(this, 0, 0, "topbar", 220, 26, 5, 5, 2, 1);
    const label = this.add.text(0, -1, t("hunt.floorCard", { n: this.run.floor, name: t(`floor.${this.run.floor}` as StringKey) }), { ...TEXT, fontStyle: "bold" }).setOrigin(0.5);
    card.add([plate, label]).setAlpha(0).setX(GAME_WIDTH / 2 - 40);
    this.tweens.add({ targets: card, alpha: 1, x: GAME_WIDTH / 2, duration: 250, ease: "Cubic.easeOut", hold: 1300, yoyo: true, onComplete: () => card.destroy() });
  }
```

- [ ] **Step 4: 기력 — 감소·피해·도시락·기절**

`update()`의 `updatePlayer` 앞에(히트스톱 중이 아닐 때만):

```ts
    if (!this.player.down) {
      this.run.stamina = drainStamina(this.run.stamina, dt, this.run.floor);
      if (this.run.stamina === 0) this.knockOut();
    }
```

`hurtPlayer`: `p.hp = Math.max(0, p.hp - damage)` → `this.run.stamina = Math.max(0, this.run.stamina - damage)`, 0이면 `this.knockOut()`. 지금 `hurtPlayer` 안의 쓰러지는 부분(`p.down = true` …`delayedCall(1500, () => this.endHunt(true))`)을 `knockOut()`으로 옮기고 마지막을 `this.endHunt(true, null)`로.

`eat()`: `p.hp = Math.min(this.maxHp, p.hp + heal)` → `this.run.stamina = Math.min(this.maxStamina, this.run.stamina + heal)`, `this.run.eaten[i] = true`.

- [ ] **Step 5: 화면 표시 — 기력 막대·층 이름·출구 화살표·경고**

- 기력 막대: 지금 체력 게이지 자리(`addGauge(this, 56, 26)`), 그 아래 줄에 층 이름(`t("hunt.floorShort", { n })`)과 가방 칸 수.
- `drawHud()`: `this.hpGauge.set(this.run.stamina / this.maxStamina)`.
- 출구 화살표: 가장 가까운 출구(`nearestExit(this.player.pos, this.run.floor)`)가 화면 밖이면 화면 가장자리에 화살표. 가방이 꽉 찼거나 기력이 `LOW_STAMINA` 아래면 늘 보인다. 화살표 그림은 새로 그리지 않고 키트의 `▶` 글자(`TEXT`, 노란색 `#ffd166`)를 회전해 쓴다.

```ts
  private drawExitArrow() {
    const p = this.player.pos;
    const e = nearestExit(p, this.run.floor);
    const cam = this.cameras.main;
    const view = cam.worldView;
    const urgent = bagCount(this.run.bag) >= this.bagSlots || this.run.stamina / this.maxStamina < LOW_STAMINA;
    const off = !view.contains(e.x, e.y);
    this.exitArrow.setVisible(off || urgent);
    if (!this.exitArrow.visible) return;
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const r = Math.min(cx, cy) - 24;
    this.exitArrow.setPosition(cx + Math.cos(a) * r, cy + Math.sin(a) * r).setRotation(a);
  }
```

(`this.exitArrow = this.add.text(0, 0, "▶", { ...TEXT, color: "#ffd166" }).setOrigin(0.5).setScrollFactor(0).setDepth(10001)`을 `create()`에서.)

- 기력 경고: 기력이 `LOW_STAMINA` 아래면 화면 가장자리를 붉게 깜빡인다. 그림을 새로 그리지 않고 카메라 효과로: `this.cameras.main.flash`는 화면 전체라 쓰지 않고, `this.lowGlow = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0).setStrokeStyle(10, 0xc02020, 0.6).setScrollFactor(0).setDepth(9999).setVisible(false)`을 두고 `drawHud()`에서 `setVisible(low)`·`setAlpha(0.4 + 0.4 * Math.sin(this.time.now / 180))`. (테두리선 하나는 연출용 효과이지 UI 창이 아니다 — 픽셀 키트 규칙과 어긋나면 사용자에게 먼저 보여 준다.)

- [ ] **Step 6: 귀환 버튼과 R 키 없애기, 보고 끝내기**

- 오른쪽 위 "귀환" 버튼(`returnButton`)과 `R` 키를 지운다(출구로만 나간다). `overHud`에서 `returnButton`을 뺀다. `Keys` 타입에서 `"R"`을 뺀다.
- `endHunt`:

```ts
  // Home: through an exit (its id), or knocked out (null) — the report goes to the day flow, the server
  // checks it floor by floor and applies the knockout's half bag too.
  private endHunt(ko: boolean, exit: string | null) {
    if (this.ended) return;
    this.ended = true;
    const result: HuntResult = { events: [...this.run.report], exit, ko };
    this.game.events.emit("hunt:end", result);
    this.scene.pause();
  }
```

- 도움말 줄(`hunt.help`)을 고친다(아래 Step 7).

- [ ] **Step 7: 문구**

`src/i18n/ko.ts`:

```ts
  "hunt.help": "WASD 이동 · 마우스 조준 · 좌클릭 작살 · 우클릭 베기 · E 줍기·내려가기·나가기",
  "hunt.useExit": "E 반달이 수레로 나가기",
  "hunt.useDown": "E 아래층으로",
  "hunt.useButton": "쓰기",
  "hunt.floorCard": "{n}층 · {name}",
  "hunt.floorShort": "{n}층",
  "floor.1": "숲 입구",
  "floor.2": "깊은 숲",
  "hunt.ko": "기력이 다했다… 가방 절반을 잃었다",
```

`src/i18n/en.ts`:

```ts
  "hunt.help": "WASD move · mouse aim · left click harpoon · right click slash · E pick up / go down / leave",
  "hunt.useExit": "E Leave by Bandal's cart",
  "hunt.useDown": "E Go down",
  "hunt.useButton": "Use",
  "hunt.floorCard": "Floor {n} · {name}",
  "hunt.floorShort": "Floor {n}",
  "floor.1": "Forest edge",
  "floor.2": "Deep forest",
  "hunt.ko": "Out of stamina… half the bag is lost",
```

`"hunt.return"`과 모바일 `"hunt.gatherButton"`은 `"hunt.useButton"`으로 바꾸고 안 쓰는 키는 지운다(i18n 테스트가 두 파일의 키를 비교한다).

- [ ] **Step 8: 타입·테스트**

Run: `npm run typecheck` 그리고 `npm test`
Expected: 둘 다 통과.

- [ ] **Step 9: 직접 플레이 확인 (PC, 모바일)**

`npm run dev`(5190) 후 `/?local`로:
1. 1층에서 시작 → 층 이름 카드가 지나간다 → 기력 막대가 천천히 준다.
2. 몬스터 몇 마리 잡기 → 계단에서 E → 화면이 어두워졌다 밝아지며 2층 카드, 기력·가방이 그대로.
3. 2층 출구에서 E → 점심 화면 → [오후 사냥 나가기] → 오후 1층(토끼 4마리 무리) → 출구 → 저녁 주방.
4. 기력이 바닥나게 기다리기 → 경고 테두리 → 쓰러짐 → 가방 절반.
5. `?touch`로 모바일: 행동 버튼이 출구·계단·채집 모두에 뜬다.

`art-src/mockups/tools/shot.mjs`로 1층 시작·2층 도착·기력 경고 화면을 찍어 사용자에게 보여 준다(HUD 글자가 키트 안쪽 면에, 출구 화살표가 화면 가장자리에).

- [ ] **Step 10: 커밋**

```bash
git add src/game src/i18n
git commit -m "feat(hunt): floors with the way down and Bandal's carts as the only way home; stamina gauge, floor card, exit arrow, low-stamina warning"
```

---

### Task 8: 마무리 — 문서·점검표·배포

**Files:**
- Modify: `CLAUDE.md` (사냥 조작 줄 — 1단계에서는 R 귀환이 사라지고 E가 나가기·내려가기를 맡는다. 식칼 Space는 2단계에서 바꾼다)
- Modify: `docs/superpowers/specs/2026-10-15-hunt-v3-depths-design.md` (상태 줄: "1단계 구현됨")

- [ ] **Step 1: CLAUDE.md 사냥 조작 줄 고치기** — 사용자에게 바꿀 문장을 보여 주고 승인받은 뒤 고친다.

- [ ] **Step 2: 전체 확인**

```bash
npm run typecheck && npm test && npm run build
```

Expected: 모두 통과. 사용자에게 알린 뒤 `npm run test:server` — 9 passed.

- [ ] **Step 3: docs/VERSE8.md 점검표** — 서버 검증(출구·층·시간), 세이브 한 곳($lock), 재시도·연속 클릭(점심 버튼 `busy`), 네트워크 실패(거절된 보고는 빈손 귀환) 항목을 확인한다.

- [ ] **Step 4: 배포**

```bash
git add CLAUDE.md docs
git commit -m "docs: hunt v3 stage 1 in place (floors, stamina, exits, two hunts a day)"
git push -q gitlab develop; git push -q github develop:main
git ls-remote gitlab refs/heads/develop
```

Expected: 원격 해시가 로컬 `HEAD`와 같다.
