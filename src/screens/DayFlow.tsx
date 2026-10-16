import { useEffect, useRef, useState } from "react";
import type { Action } from "../../shared/actions";
import { ammoOf, bagSlots, coalPerDish, huntStats, level, lightRadius, sleepFallMs, stools, walkMul } from "../../shared/growth";
import type { HuntEvent } from "../../shared/actions";
import type { SideWeaponId } from "../../shared/content/sideWeapons";
import { BALANCE } from "../../shared/balance";
import { sidePower } from "../../shared/awaken";
import { dishPrice, type MenuLine } from "../../shared/kitchen/dish";
import { planService } from "../../shared/service/plan";
import type { ServedEntry } from "../../shared/service/settle";
import type { SaveData } from "../../shared/save";
import { PhaserGame } from "../game/PhaserGame";
import { ServiceGame } from "../game/service/ServiceGame";
import type { HuntResult } from "../game/scenes/HuntScene";
import { t } from "../i18n";
import type { LocalTransport, Transport } from "../net/transport";
import { Kitchen, type KitchenTab } from "./kitchen/Kitchen";
import { Upgrades } from "./Upgrades";
import { HuntSummary } from "./HuntSummary";
import { SidePick } from "./SidePick";
import { Shop } from "./Shop";
import { buy, refreshAfterPurchase, startShop, type ShopItem } from "../net/shop";
import { vipLevel } from "../../shared/shop";
import { Bag } from "./hud/Bag";
import { DayHud } from "./hud/DayHud";
import { Notebook } from "./hud/Notebook";
import { showDayHud, timeOfDay, type App, type Phase } from "./hud/hud";
import { Cookbook } from "./kitchen/Cookbook";
import "./dayflow.css";

// One day (hunt v3 design 3): morning hunt -> lunch -> afternoon hunt -> kitchen -> service -> settle -> next day. Every change goes through the transport
// (the server's rules); the screen only moves on once the change is saved. Kitchen, service and
// settle are placeholder screens until plans 04-05 (and their art in plan 08).
const shopShut = (code: string) => code === "no_menu" || code === "no_ingredients";
const huntRefused = (f: { action: Action; code: string }) => f.action.type === "finishHunt" && f.code === "bad_hunt";

// `localShop`: in ?local development the shop buys through the page's own server rules (src/net/shop.ts).
export function DayFlow({ transport, localShop }: { transport: Transport; localShop: LocalTransport | null }) {
  const [save, setSave] = useState<SaveData | null>(null);
  const [phase, setPhase] = useState<Phase>("hunt");
  const [failed, setFailed] = useState<{ action: Action; next: Phase; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // the upgrade window, on the tab Grandma's notebook opened it at
  const [shopping, setShopping] = useState<"upgrade" | "awaken" | null>(null);
  // the side weapon window at lunch (in the morning it shows by itself before the hunt)
  const [picking, setPicking] = useState(false);
  // the bag or Grandma's notebook, opened from the day's HUD
  const [win, setWin] = useState<"bag" | "notebook" | "cookbook" | null>(null);
  // the hunt just settled: what was taken, the fridge, the den's key and the pages before it, for the summary
  const [summary, setSummary] = useState<{ events: HuntEvent[]; ko: boolean; lost: Record<string, number>; before: Record<string, number>; hadKey: boolean; hadPages: string[] } | null>(null);
  // a second click can land before React re-renders with busy=true
  const busyRef = useRef(false);
  // the VX shop (06b-1): open or not, Verse8's list of products, and a purchase being checked
  const [store, setStore] = useState(false);
  const [storeItems, setStoreItems] = useState<ShopItem[]>([]);
  const [checking, setChecking] = useState(false);
  useEffect(
    () =>
      startShop({
        local: localShop,
        onItems: setStoreItems,
        // the grant is the server's webhook: read the save again, twice (it can trail the window)
        onClosed: () => {
          setChecking(true);
          void refreshAfterPurchase(async () => setSave(await transport.load())).finally(() => setChecking(false));
        },
      }),
    [transport, localShop],
  );

  function load() {
    setLoadFailed(false);
    transport.load().then((s) => {
      setSave(s);
      // back where the server says the day is (a service opened and never settled: back into it)
      setPhase(s.service ? "service" : s.hunt ? "hunt" : s.stage);
    }, () => setLoadFailed(true));
  }
  useEffect(load, [transport]);
  // the upgrade shop belongs to the screen it was opened from: a new stage closes it
  useEffect(() => (setShopping(null), setWin(null)), [phase]);
  // the evening kitchen's tab, which the notebook's cookbook and menu board apps turn to
  const [kitchenTab, setKitchenTab] = useState<KitchenTab>("cookbook");

  // the server opens every hunt (its seed decides the hunting ground) with the side weapon picked first
  function setOut(side: SideWeaponId) {
    setPicking(false);
    void act({ type: "startHunt", zone: "forest", side }, "hunt");
  }

  // true once the server saved it; on failure the banner offers a retry (or says what is missing)
  async function act(action: Action, next: Phase): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setFailed(null);
    try {
      setSave(await transport.act(action));
      setPhase(next);
      return true;
    } catch (e) {
      setFailed({ action, next, code: e instanceof Error ? e.message : "" });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // An app of Grandma's notebook: its window, or in the evening kitchen the kitchen's own tab.
  function openApp(app: App) {
    setWin(null);
    if (app === "bag") setWin("bag");
    else if (app === "upgrade" || app === "awaken") setShopping(app);
    else if (app === "shop") setStore(true);
    else if (phase === "kitchen") setKitchenTab(app);
    else if (app === "cookbook") setWin("cookbook");
  }

  // "Open the shop": the menu board goes to the server, which takes the sets and opens the service
  async function openShop(menu: MenuLine[]) {
    await act({ type: "openShop", menu }, "service");
  }


  if (!save)
    return (
      <div className="dayflow dayflow-wait">
        {loadFailed ? (
          <div className="dayflow-error ui-panel">
            <span>{t("error.retry")}</span>
            <button className="ui-btn" onClick={load}>↻</button>
          </div>
        ) : (
          "…"
        )}
      </div>
    );

  return (
    <div className="dayflow">
      {phase === "hunt" && save.hunt && (
        <PhaserGame
          key={save.hunt.id}
          hunt={{ huntId: save.hunt.id, seed: save.hunt.seed, zone: save.hunt.zone, period: save.hunt.period, side: save.hunt.side, ammo: ammoOf(save, save.hunt.side), harpoonLevel: level(save, "ranged"), sleepFallMs: sleepFallMs(save), sidePower: sidePower(save, save.hunt.side), stats: huntStats(save), gear: { boots: level(save, "boots") >= 1, light: lightRadius(save), key: save.bossKey }, bagSlots: bagSlots(save), lunchbox: save.lunchbox.map((dish) => ({ dish, heal: Math.round(dishPrice(dish, save.dishes[dish] ?? 1) * BALANCE.lunch.healPerGold) })) }}
          onHuntEnd={(r: HuntResult) => {
            const before = save.items;
            const had = { hadKey: save.bossKey, hadPages: save.pages };
            void act({ type: "finishHunt", huntId: save.hunt!.id, events: r.events, exit: r.exit, ko: r.ko }, save.hunt!.period === "morning" ? "lunch" : "kitchen").then((ok) => ok && setSummary({ events: r.events, ko: r.ko, lost: r.lost, before, ...had }));
          }}
        />
      )}

      {/* the day's HUD (Dave-style UI design 4); the hunt and the night's service carry their own */}
      {showDayHud(phase, !!save.hunt) && (
        <DayHud
          save={save}
          time={timeOfDay(phase, save.hunt?.period ?? null)}
          title={phase === "lunch" || phase === "kitchen" ? t("kitchen.shopName") : undefined}
          onBag={() => setWin("bag")}
          onNotebook={() => setWin("notebook")}
        />
      )}

      {phase === "lunch" && (
        <Kitchen
          mode="lunch"
          save={save}
          busy={busy}
          act={(a) => void act(a, "lunch")}
          onHunt={() => setPicking(true)}
          onSkip={() => void act({ type: "skipHunt" }, "kitchen")}
        />
      )}
      {phase === "kitchen" && <Kitchen tab={kitchenTab} onTab={setKitchenTab} save={save} busy={busy} act={(a) => void act(a, "kitchen")} onReady={(menu) => void openShop(menu)} onRest={() => void act({ type: "endDay" }, "hunt")} />}
      {phase === "service" && save.service && <Night save={save} onEnd={(r) => act({ type: "finishService", serviceId: save.service!.id, ...r }, "settle")} />}
      {phase === "settle" && (
        <Panel title={t("settle.title")} body={t("settle.body", { day: save.day, gold: save.gold })}>
          {save.lastService && (
            <ul className="dayflow-sold">
              <li>{t("settle.served", { served: save.lastService.served, left: save.lastService.left })}</li>
              <li>{t("settle.sales", { sales: save.lastService.sales, tips: save.lastService.tips, drinks: save.lastService.drinks })}</li>
              {save.lastService.cleaned > 0 && <li>{t("settle.cleaned", { n: save.lastService.cleaned, gold: save.lastService.cleaned * BALANCE.service.cleanTip })}</li>}
              <li>{t("settle.happy", { happy: save.lastService.happy })}</li>
              <li>{t("settle.rep", { rep: save.reputation, delta: (save.lastService.repDelta >= 0 ? "+" : "") + save.lastService.repDelta })}</li>
            </ul>
          )}
          <div className="dayflow-actions">
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "endDay" }, "hunt")}>{t("nextDay")}</button>
          </div>
        </Panel>
      )}

      {/* the morning: pick the side weapon, then set out; at lunch the same window opens from its button */}
      {phase === "hunt" && save.stage === "hunt" && !save.hunt && !failed && <SidePick save={save} busy={busy} onGo={setOut} />}
      {phase === "lunch" && picking && <SidePick save={save} busy={busy} onGo={setOut} onCancel={() => setPicking(false)} />}
      {summary && phase !== "hunt" && <HuntSummary events={summary.events} ko={summary.ko} lost={summary.lost} before={summary.before} after={save.items} gotKey={!summary.hadKey && save.bossKey} gotPage={!summary.hadPages.includes("forest") && save.pages.includes("forest")} onShop={() => setStore(true)} onDone={() => setSummary(null)} />}

      {/* the VIP's charcoal: in the morning before the hunt, once a day */}
      {phase === "hunt" && save.stage === "hunt" && !save.hunt && vipLevel(save.vip.spent) > 0 && save.vip.day !== save.day && (
        <button className="ui-btn vip-claim" disabled={busy} onClick={() => act({ type: "claimVipDaily" }, "hunt")}>{t("vip.claim")}</button>
      )}
      {/* the notebook's windows; the upgrades act at whatever stage of the day they were opened in */}
      {shopping && phase !== "service" && <Upgrades tab={shopping} save={save} busy={busy} act={(a) => void act(a, phase)} onShop={() => setStore(true)} onClose={() => setShopping(null)} />}
      {win === "notebook" && <Notebook phase={phase} onApp={openApp} onClose={() => setWin(null)} />}
      {win === "bag" && <Bag save={save} onClose={() => setWin(null)} />}
      {win === "cookbook" && (
        <div className="hud-win" onClick={() => setWin(null)}>
          <div className="ui-frame hud-cookbook" onClick={(e) => e.stopPropagation()}>
            {/* to read only: research is the evening kitchen's */}
            <Cookbook save={save} busy act={() => {}} onResearch={() => {}} />
          </div>
          <button className="ui-btn hud-cookbook-close" onClick={() => setWin(null)}>{t("upgrade.close")}</button>
        </div>
      )}
      {store && <Shop save={save} items={storeItems} checking={checking} onBuy={buy} onClose={() => setStore(false)} />}

      {failed && (
        <div className="dayflow-error ui-panel">
          <span>{shopShut(failed.code) ? t(`error.${failed.code}`) : huntRefused(failed) ? t("error.bad_hunt") : t("error.retry")}</span>
          {shopShut(failed.code) ? (
            // nothing to sell tonight: close the shop and go on to tomorrow
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "endDay" }, "hunt")}>{t("error.closeShop")}</button>
          ) : huntRefused(failed) ? (
            // the server would never take this report: come home empty-handed rather than stay stuck
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "finishHunt", huntId: save.hunt?.id ?? "", events: [], exit: null, ko: true }, save.hunt?.period === "afternoon" ? "kitchen" : "lunch")}>{t("error.emptyHanded")}</button>
          ) : (
            <button className="ui-btn" disabled={busy} onClick={() => act(failed.action, failed.next)}>↻</button>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="dayflow-screen">
      <div className="dayflow-panel ui-panel">
        <h2>{title}</h2>
        <p>{body}</p>
        {children}
      </div>
    </div>
  );
}

// Tonight's service: the customers the server's seed brings (same plan as the server checks) and the
// plates the menu board made.
function Night({ save, onEnd }: { save: SaveData; onEnd: (r: { served: ServedEntry[]; left: string[]; cleaned: string[] }) => void }) {
  const svc = save.service!;
  const customers = planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.dishes.map((d) => d.dish) });
  const shop = { serviceId: svc.id, customers, dishes: svc.dishes, stools: stools(save), walkMul: walkMul(save), coalPerDish: coalPerDish(save) };
  return <ServiceGame key={svc.id} shop={shop} onEnd={onEnd} />;
}
