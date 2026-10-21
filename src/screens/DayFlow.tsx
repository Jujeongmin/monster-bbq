import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "../../shared/actions";
import { ammoOf, bagSlots, coalPerDish, huntStats, level, lightRadius, menuSlots, sleepFallMs, stools, walkMul } from "../../shared/growth";
import type { HuntEvent } from "../../shared/actions";
import type { SideWeaponId } from "../../shared/content/sideWeapons";
import { BALANCE } from "../../shared/balance";
import { sidePower } from "../../shared/awaken";
import { dishPrice, type MenuLine, type TonightDish } from "../../shared/kitchen/dish";
import { addOptions } from "../../shared/service/addMenu";
import { staffEffects } from "../../shared/staff/effects";
import type { DishId } from "../../shared/content/dishes";
import type { AddMenuHook } from "../game/shop3d/ShopStage";
import { planService } from "../../shared/service/plan";
import type { ServedEntry } from "../../shared/service/settle";
import type { SaveData } from "../../shared/save";
import { artUrl } from "../game/art";
import { PhaserGame } from "../game/PhaserGame";
import { ServiceGame } from "../game/service/ServiceGame";
import type { HuntResult } from "../game/scenes/HuntScene";
import { t, type StringKey } from "../i18n";
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
import { CookbookBook } from "./kitchen/CookbookBook";
import { Credits } from "./hud/Credits";
import { bgm } from "../audio/bgm";
import { Friends, type Result as FriendResult } from "./hud/Friends";
import "./hud/friends.css";
import { Receipt } from "./hud/Receipt";
import { knowsCharcoal, sceneOf, showDayHud, timeOfDay, transitionCard, type App, type Phase, type Scene } from "./hud/hud";
import { LidLine } from "./hud/LidLine";
import { GoalLine } from "./hud/GoalLine";
import { appAlerts } from "./hud/alerts";
import { Ranking } from "./hud/Ranking";
import { usePortrait } from "./portrait";
import { ControlsPanel } from "./hud/ControlsPanel";
import { dayGoal, huntGoal, TUT_NEED, type HuntTut } from "./tutorial";
import { markSeen, readSeen, TIP_FACE, tipStore, type TipId } from "./tips";
import { TitleCard } from "./hud/TitleCard";
import { Cutscene } from "./story/Cutscene";
import { storyDue, storyUnsaved } from "./story/story";
import type { StoryId } from "../../shared/content/story";
import { DayStage } from "../game/shop3d/DayStage";
import type { DayScene } from "../game/shop3d/day";
import { canUse3D } from "../game/shop3d/input";
import "./dayflow.css";

// One day (hunt v3 design 3): morning hunt -> lunch -> afternoon hunt -> kitchen -> service -> settle -> next day. Every change goes through the transport
// (the server's rules); the screen only moves on once the change is saved. Kitchen, service and
// settle are placeholder screens until plans 04-05 (and their art in plan 08).
const shopShut = (code: string) => code === "no_menu" || code === "no_ingredients";
const huntRefused = (f: { action: Action; code: string }) => f.action.type === "finishHunt" && f.code === "bad_hunt";

// `localShop`: in ?local development the shop buys through the page's own server rules (src/net/shop.ts).
// each notebook app's first-open line (tips.ts); old friends keep their postcard line
const APP_TIP: Record<App, Exclude<TipId, "awakenApp">> = { bag: "appBag", upgrade: "appUpgrade", awaken: "appAwaken", friends: "friends", cookbook: "appCookbook", menu: "appMenu", shop: "appShop", ranking: "appRanking" };

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
  const [win, setWin] = useState<"bag" | "notebook" | "cookbook" | "friends" | "credits" | "ranking" | null>(null);
  // story scenes played to the end here (saved by the server just after; see storyDue)
  const [watched, setWatched] = useState<StoryId[]>([]);
  // a key asked the open window to close (it plays its closing, then calls back)
  const [shut, setShut] = useState(0);
  // the hunt just settled: what was taken, the fridge, the den's key and the pages before it, for the summary
  const [summary, setSummary] = useState<{ events: HuntEvent[]; ko: boolean; lost: Record<string, number>; before: Record<string, number>; hadKey: boolean; hadPages: string[] } | null>(null);
  // a second click can land before React re-renders with busy=true
  const busyRef = useRef(false);
  // the VX shop (06b-1): open or not, Verse8's list of products, and a purchase being checked
  const [store, setStore] = useState(false);
  // first-time lines and marks seen on this browser (shop remake step 3)
  const [seenTips, setSeenTips] = useState(() => readSeen(tipStore()));
  const see = (id: TipId) => {
    markSeen(tipStore(), id);
    setSeenTips((s) => new Set([...s, id]));
  };
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
  // golden charcoal is introduced the first time this save has it: the lid's line once (not over the hunt or
  // the night, which have their own screens)
  const knows = !!save && knowsCharcoal(save);
  const charcoalLine = knows && !seenTips.has("charcoal") && phase !== "service" && !save?.hunt;
  // the notebook's apps explained (user, 2026-10-21, A+C): the lid's line the first time each opens, and a !
  // on an app worth opening (alerts.ts); an app counts as opened once its line was seen
  const opened = new Set((Object.keys(APP_TIP) as App[]).filter((a) => seenTips.has(APP_TIP[a]) || (a === "awaken" && seenTips.has("awakenApp"))));
  const alerts = save ? appAlerts(save, opened, phase) : [];
  const [appTip, setAppTip] = useState<App | null>(null);
  // a phone held upright: the hunt and the night wait while the rotate prompt is up
  const portrait = usePortrait();
  // the hunt's own once-only lines (a monster weak enough to capture)
  const [huntTip, setHuntTip] = useState<TipId | null>(null);
  useEffect(() => {
    if (!huntTip) return;
    see(huntTip);
    const id = setTimeout(() => setHuntTip(null), 6000);
    return () => clearTimeout(id);
  }, [huntTip]);
  // the friends who came for the postcards walking into the day shop (postcard reveal A), then the
  // friends window again on what came
  const [visitors, setVisitors] = useState<FriendResult[] | null>(null);
  const [came, setCame] = useState<FriendResult[] | null>(null);
  const dayVisit = useMemo(() => (visitors ? { visitors, onDone: () => (setVisitors(null), setCame(visitors), setWin("friends")) } : null), [visitors]);
  const opening = (app: App) => {
    if (opened.has(app)) return;
    setAppTip(app);
    see(APP_TIP[app]);
  };
  const nowOpen: App | null = win === "bag" || win === "friends" || win === "cookbook" || win === "ranking" ? win : (shopping ?? (store ? "shop" : null));
  useEffect(() => {
    if (nowOpen) opening(nowOpen);
    else setAppTip(null);
  }, [nowOpen]);
  useEffect(() => {
    if (!appTip) return;
    const id = setTimeout(() => setAppTip(null), 6000);
    // a click or tap anywhere closes the line at once (user, 2026-10-21); that click does nothing else
    const close = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setAppTip(null);
      addEventListener("click", (c) => (c.stopPropagation(), c.preventDefault()), { capture: true, once: true });
    };
    addEventListener("pointerdown", close, { capture: true, once: true });
    return () => {
      clearTimeout(id);
      removeEventListener("pointerdown", close, { capture: true });
    };
  }, [appTip]);
  useEffect(() => {
    if (!charcoalLine) return;
    const id = setTimeout(() => see("charcoal"), 4000);
    return () => clearTimeout(id);
  }, [charcoalLine]);
  // Dave's title card when the day moves on to another stage (not on the first screen)
  const scene: Scene | null = save ? sceneOf(phase, save.hunt?.period ?? null) : null;
  const lastScene = useRef<Scene | null>(null);
  const [card, setCard] = useState<{ key: number; day: number; time: ReturnType<typeof timeOfDay>; line: StringKey } | null>(null);
  useEffect(() => {
    if (!scene || !save) return;
    const next = transitionCard(lastScene.current, scene);
    lastScene.current = scene;
    if (next) setCard({ key: Date.now(), day: save.day, ...next });
  }, [scene]);
  // the story scene due now (the prologue on the first morning, its dusk cut on the first evening), shown
  // once the title card is gone; seeing it (or skipping it) is saved
  const story = save && !card ? storyDue(save, phase, watched) : null;
  // the first day's tutorial (A): the goal now, where to go, the lid's line the first time
  const [lunchVisited, setLunchVisited] = useState(false);
  const [huntTut, setHuntTut] = useState<HuntTut | null>(null);
  // the hunt's controls: before the first hunt starts (once), and from the hunt's pause menu
  const [controlsAsked, setControlsAsked] = useState(false);
  const touch = typeof window !== "undefined" && ("ontouchstart" in window || new URLSearchParams(location.search).has("touch"));
  const tutorialHunt = !!save?.hunt && save.day === 1 && save.hunt.period === "morning";
  const goal = !save
    ? null
    : save.hunt
      ? tutorialHunt && phase === "hunt"
        ? { ...huntGoal(huntTut?.step ?? "move", touch, huntTut?.have), point: null }
        : null
      : dayGoal(save, phase, { lunchVisited: lunchVisited || save.lunchbox.length > 0 });

  // the shop by day, walked (a window opens from the door or Bandal), where WebGL works
  const [hub, setHub] = useState(() => canUse3D(() => document.createElement("canvas"), location.search));
  const [panel, setPanel] = useState<"kitchen" | "side" | null>(null);
  const controlsOpen = !!save?.hunt && !card && (controlsAsked || (tutorialHunt && !seenTips.has("huntControls")));
  // windows over the day hide it; in the hunt only the title card, the controls or an error can (the day's windows are shut)
  // the scene's music: the day shop's (the prologue too), the hunt's, the night's (the receipt too)
  const track = !save ? null : story ? "day" : save.hunt ? "hunt" : phase === "service" || phase === "settle" ? "night" : "day";
  useEffect(() => bgm.set(track), [track]);
  const covered = save?.hunt ? !!(card || failed || controlsOpen) : !!(story || card || summary || shopping || store || win || panel || picking || failed);
  const goalTip = goal?.tip && !seenTips.has(goal.tip) && !covered && !charcoalLine ? goal.tip : null;
  useEffect(() => {
    if (!goalTip) return;
    const id = setTimeout(() => see(goalTip), 5000);
    return () => clearTimeout(id);
  }, [goalTip]);
  useEffect(() => setPanel(null), [phase]);
  // every evening's kitchen opens on the cookbook, as it did before the notebook could turn its tabs
  useEffect(() => {
    if (phase === "kitchen") setKitchenTab("cookbook");
  }, [phase]);
  const dayScene: DayScene | null = !save || save.hunt ? null : phase === "hunt" ? "prep" : phase === "lunch" ? "lunch" : phase === "kitchen" ? "kitchen" : null;
  // the evening kitchen's tab, which the notebook's cookbook and menu board apps turn to
  const [kitchenTab, setKitchenTab] = useState<KitchenTab>("cookbook");

  // the server opens every hunt (its seed decides the hunting ground) with the side weapon picked first
  function setOut(side: SideWeaponId) {
    setPicking(false);
    void act({ type: "startHunt", zone: "forest", side }, "hunt");
  }

  // true once the server saved it; on failure the banner offers a retry (or says what is missing)
  // More dishes during the night (shop remake step 4): the request from Bandal's menu board, its refusal
  // shown in that window (not the page's error panel), the save taken in when it goes through.
  async function addToMenu(dish: DishId, sets: number): Promise<{ dishes: TonightDish[] } | { error: string }> {
    const svc = save?.service;
    if (!svc) return { error: "wrong_stage" };
    if (busyRef.current) return { error: "busy" };
    busyRef.current = true;
    setBusy(true);
    try {
      const addId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
      const next = await transport.act({ type: "addToMenu", serviceId: svc.id, dish, sets, addId });
      setSave(next);
      return { dishes: next.service?.dishes ?? [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "" };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // An action whose new save the window itself reads (Grandma's old friends): the save, or null when it
  // was refused (the page's error panel says why).
  // a scene watched here goes to the server once nothing else is on its way (a failed save shows the
  // error panel, whose retry sends it again)
  const unsavedStory = save ? storyUnsaved(save, watched) : null;
  useEffect(() => {
    if (unsavedStory && !busy && !failed) void act({ type: "seeStory", id: unsavedStory }, phase);
  }, [unsavedStory, busy, failed]);

  async function actSave(action: Action): Promise<SaveData | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setFailed(null);
    try {
      const next = await transport.act(action);
      setSave(next);
      return next;
    } catch (e) {
      setFailed({ action, next: phase, code: e instanceof Error ? e.message : "" });
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

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

  // Tab opens or closes Grandma's notebook, I the bag, while the day's HUD is up and nothing else is open
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!save || !showDayHud(phase, !!save.hunt) || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k !== "tab" && k !== "i") return;
      if (shopping || store || summary || card || panel || picking || story) return;
      e.preventDefault();
      const want = k === "tab" ? "notebook" : "bag";
      // the same key again closes it the window's own way (folding back to its button)
      if (win === want) setShut((n) => n + 1);
      else if (win === null) setWin(want);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });

  // An app of Grandma's notebook: its window, or in the evening kitchen the kitchen's own tab.
  function openApp(app: App) {
    setWin(null);
    if (app === "bag") setWin("bag");
    else if (app === "upgrade" || app === "awaken") setShopping(app);
    else if (app === "friends") setWin("friends");
    else if (app === "shop") setStore(true);
    else if (app === "ranking") setWin("ranking");
    else if (phase === "kitchen") {
      // the kitchen's own tab; by day it is a window opened at Bandal, so open it too
      setKitchenTab(app);
      opening(app);
      if (hub) setPanel("kitchen");
    }
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
          hold={!!card || controlsOpen || portrait}
          onTutorial={setHuntTut}
          onTip={(id) => id === "capture" && !seenTips.has("capture") && setHuntTip("capture")}
          onControls={() => setControlsAsked(true)}
          hunt={{ tutorial: tutorialHunt, huntId: save.hunt.id, seed: save.hunt.seed, zone: save.hunt.zone, period: save.hunt.period, side: save.hunt.side, ammo: ammoOf(save, save.hunt.side), harpoonLevel: level(save, "ranged"), sleepFallMs: sleepFallMs(save), sidePower: sidePower(save, save.hunt.side), stats: huntStats(save), gear: { boots: level(save, "boots") >= 1, light: lightRadius(save), key: save.bossKey }, bagSlots: bagSlots(save), lunchbox: save.lunchbox.map((dish) => ({ dish, heal: Math.round(dishPrice(dish, save.dishes[dish] ?? 1) * BALANCE.lunch.healPerGold) })) }}
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
          quiet={!!(shopping || store || win || panel || picking || summary || story || visitors)}
          alerts={alerts}
          onBag={() => setWin("bag")}
          onNotebook={() => setWin("notebook")}
        />
      )}

      {/* by day the shop itself, walked: the door and Bandal open the windows below (user, 2026-10-16);
          without WebGL the windows show as before */}
      {dayScene && hub && (
        <DayStage
          scene={dayScene}
          stools={stools(save)}
          active={!panel && !picking && !win && !shopping && !store && !summary && !card && !busy && !story && !visitors}
          point={goal?.point ?? null}
          visit={dayVisit}
          onSpot={(id) => (id === "bandal" && dayScene === "lunch" && setLunchVisited(true), id === "door" ? (dayScene === "lunch" ? setPicking(true) : setPanel("side")) : setPanel("kitchen"))}
          onFail={() => setHub(false)}
        />
      )}
      {phase === "lunch" && (!hub || panel === "kitchen") && (
        <Kitchen
          mode="lunch"
          save={save}
          busy={busy}
          act={(a) => void act(a, "lunch")}
          onHunt={() => setPicking(true)}
          onSkip={() => void act({ type: "skipHunt" }, "kitchen")}
          onClose={hub ? () => setPanel(null) : undefined}
        />
      )}
      {phase === "kitchen" && (!hub || panel === "kitchen") && <Kitchen guide={save.day === 1} tab={kitchenTab} onTab={setKitchenTab} save={save} busy={busy} act={(a) => void act(a, "kitchen")} onReady={(menu) => void openShop(menu)} onRest={() => void act({ type: "endDay" }, "hunt")} onClose={hub ? () => setPanel(null) : undefined} />}
      {phase === "service" && save.service && <Night save={save} hold={!!card || portrait} addMenu={{ options: addOptions(save), slots: { used: save.service.dishes.length, max: menuSlots(save) }, send: addToMenu }} onEnd={(r) => act({ type: "finishService", serviceId: save.service!.id, ...r }, "settle")} />}
      {phase === "settle" && <Receipt save={save} busy={busy} onNext={() => act({ type: "endDay" }, "hunt")} />}

      {/* the morning: pick the side weapon, then set out; at lunch the same window opens from its button */}
      {phase === "hunt" && save.stage === "hunt" && !save.hunt && !failed && (!hub || panel === "side") && <SidePick save={save} busy={busy} onGo={setOut} onCancel={hub ? () => setPanel(null) : undefined} />}
      {phase === "lunch" && picking && <SidePick save={save} busy={busy} onGo={setOut} onCancel={() => setPicking(false)} />}
      {summary && phase !== "hunt" && <HuntSummary events={summary.events} ko={summary.ko} lost={summary.lost} before={summary.before} after={save.items} gotKey={!summary.hadKey && save.bossKey} gotPage={!summary.hadPages.includes("forest") && save.pages.includes("forest")} onDone={() => setSummary(null)} />}

      {/* the VIP's charcoal: in the morning before the hunt, once a day */}
      {phase === "hunt" && save.stage === "hunt" && !save.hunt && vipLevel(save.vip.spent) > 0 && save.vip.day !== save.day && (
        <button className="ui-btn vip-claim" disabled={busy} onClick={() => act({ type: "claimVipDaily" }, "hunt")}>{t("vip.claim")}</button>
      )}
      {/* the notebook's windows; the upgrades act at whatever stage of the day they were opened in */}
      {shopping && phase !== "service" && <Upgrades tab={shopping} save={save} busy={busy} act={(a) => void act(a, phase)} onShop={() => setStore(true)} onClose={() => setShopping(null)} />}
      {win === "notebook" && <Notebook phase={phase} shut={shut} fresh={alerts} onApp={openApp} onClose={() => setWin(null)} onCredits={() => setWin("credits")} />}
      {charcoalLine && <LidLine face={TIP_FACE.charcoal} text={t("tip.charcoal")} />}
      {/* the goal line only for the first hunt's controls; by day the arrow alone says where to go (user, 2026-10-20) */}
      {goal && save.hunt && !covered && <GoalLine text={t(goal.goal)} place="middle" items={goal.goal === "goal.recipe" ? TUT_NEED.map(([id, n], i) => ({ icon: artUrl(`test/items/icon_${id}.png`), text: `${t(`item.${id}` as StringKey)} ${huntTut?.have[i] ?? 0}/${n}`, done: (huntTut?.have[i] ?? 0) >= n })) : []} />}
      {controlsOpen && save.hunt && <ControlsPanel touch={touch} side={save.hunt.side} onClose={() => (setControlsAsked(false), see("huntControls"))} />}
      {goalTip && <LidLine key={goalTip} face={TIP_FACE[goalTip as Exclude<TipId, "awakenApp">]} text={t(`tip.${goalTip}` as StringKey)} low />}
      {win === "bag" && <Bag save={save} shut={shut} onClose={() => setWin(null)} />}
      {win === "friends" && (
        <Friends
          save={save}
          busy={busy}
          act={actSave}
          came={came}
          onVisit={dayScene && hub && !panel ? (v) => (setWin(null), setCame(null), setVisitors(v)) : undefined}
          onShop={() => setStore(true)}
          onClose={() => (setWin(null), setCame(null))}
        />
      )}
      {huntTip && save.hunt && <LidLine key={huntTip} face={TIP_FACE[huntTip as Exclude<TipId, "awakenApp">]} text={t(`tip.${huntTip}` as StringKey)} low />}
      {appTip && <LidLine key={appTip} face={TIP_FACE[APP_TIP[appTip]]} text={t(`tip.${APP_TIP[appTip]}` as StringKey)} low />}
      {win === "cookbook" && <CookbookBook save={save} onClose={() => setWin(null)} />}
      {win === "credits" && <Credits onClose={() => setWin(null)} />}
      {win === "ranking" && <Ranking save={save} busy={busy} load={() => transport.ranking()} act={actSave} onClose={() => setWin(null)} />}
      {store && <Shop save={save} items={storeItems} checking={checking} onBuy={buy} onClose={() => setStore(false)} />}

      {story && <Cutscene key={story} scene={story} onDone={() => setWatched((w) => [...w, story])} />}
      {card && <TitleCard key={card.key} day={card.day} time={card.time} line={card.line} onDone={() => setCard(null)} />}

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

// Tonight's service: the customers the server's seed brings (same plan as the server checks) and the
// plates the menu board made.
function Night({ save, hold, addMenu, onEnd }: { save: SaveData; hold: boolean; addMenu: AddMenuHook; onEnd: (r: { served: ServedEntry[]; left: string[]; cleaned: string[] }) => void }) {
  const svc = save.service!;
  const customers = planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.planMenu, extra: staffEffects(svc.staff).extraGuests });
  const shop = { serviceId: svc.id, customers, dishes: svc.dishes, stools: stools(save), walkMul: walkMul(save), coalPerDish: coalPerDish(save), staff: svc.staff };
  return <ServiceGame key={svc.id} shop={shop} hold={hold} addMenu={addMenu} onEnd={onEnd} />;
}
