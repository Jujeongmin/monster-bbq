import { useEffect, useRef, useState } from "react";
import type { Action } from "../../shared/actions";
import type { DishId, Method } from "../../shared/content/dishes";
import { bagSlots, huntStats, seatBonus, toolQuality } from "../../shared/growth";
import { planService } from "../../shared/service/plan";
import type { SaveData } from "../../shared/save";
import { PhaserGame } from "../game/PhaserGame";
import { ServiceGame } from "../game/service/ServiceGame";
import type { HuntResult } from "../game/scenes/HuntScene";
import { t, type StringKey } from "../i18n";
import type { Transport } from "../net/transport";
import { Kitchen } from "./kitchen/Kitchen";
import { Upgrades } from "./Upgrades";
import { artUrl } from "../game/art";
import "./dayflow.css";

// One day: hunt -> kitchen -> service -> settle -> next day. Every change goes through the transport
// (the server's rules); the screen only moves on once the change is saved. Kitchen, service and
// settle are placeholder screens until plans 04-05 (and their art in plan 08).
type Phase = "hunt" | "kitchen" | "service" | "settle";
const PHASE_NAME: Record<Phase, StringKey> = {
  hunt: "phase.hunt",
  kitchen: "phase.kitchen",
  service: "phase.service",
  settle: "phase.settle",
};

const shopShut = (code: string) => code === "no_menu" || code === "no_ingredients";
const huntRefused = (f: { action: Action; code: string }) => f.action.type === "finishHunt" && f.code === "bad_hunt";

export function DayFlow({ transport }: { transport: Transport }) {
  const [save, setSave] = useState<SaveData | null>(null);
  const [phase, setPhase] = useState<Phase>("hunt");
  const [failed, setFailed] = useState<{ action: Action; next: Phase; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [shopping, setShopping] = useState(false);
  // a second click can land before React re-renders with busy=true
  const busyRef = useRef(false);

  function load() {
    setLoadFailed(false);
    transport.load().then((s) => {
      setSave(s);
      // back where the server says the day is (a service opened and never settled: back into it)
      setPhase(s.service ? "service" : s.stage);
    }, () => setLoadFailed(true));
  }
  useEffect(load, [transport]);

  // the server opens every hunt (its seed decides the hunting ground): ask whenever a day's hunt starts
  useEffect(() => {
    if (save && phase === "hunt" && !save.hunt && !failed) void act({ type: "startHunt", zone: "forest" }, "hunt");
  }, [save, phase, failed]);

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

  // "Open the shop": tonight's menu, then the server opens the service (its seed brings the customers)
  async function openShop(menu: DishId[]) {
    if (await act({ type: "setMenu", dishes: menu }, "kitchen")) await act({ type: "startService" }, "service");
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
          hunt={{ huntId: save.hunt.id, seed: save.hunt.seed, zone: save.hunt.zone, stats: huntStats(save), bagSlots: bagSlots(save) }}
          onHuntEnd={(r: HuntResult) => act({ type: "finishHunt", huntId: save.hunt!.id, events: r.events, ko: r.ko }, "kitchen")}
        />
      )}

      <div className="dayflow-bar ui-bar">
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_day.png")} alt="" />
          {t("hud.day", { day: save.day })}
        </span>
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_gold.png")} alt="" />
          {t("hud.gold", { gold: save.gold })}
        </span>
        {/* during the hunt the scene shows the live bag; the stored meat would read as a second count */}
        {phase !== "hunt" && <span>{t("hud.items", { count: Object.values(save.items).reduce((a, b) => a + b, 0) })}</span>}
        <span className="dayflow-phase">{t(PHASE_NAME[phase])}</span>
      </div>

      {phase === "kitchen" && <Kitchen save={save} busy={busy} act={(a) => void act(a, "kitchen")} onReady={(menu) => void openShop(menu)} />}
      {phase === "service" && save.service && <Night save={save} onEnd={(r) => act({ type: "finishService", serviceId: save.service!.id, ...r }, "settle")} />}
      {phase === "settle" && (
        <Panel title={t("settle.title")} body={t("settle.body", { day: save.day, gold: save.gold })}>
          {save.lastService && (
            <ul className="dayflow-sold">
              <li>{t("settle.served", { served: save.lastService.served, left: save.lastService.left })}</li>
              <li>{t("settle.sales", { sales: save.lastService.sales, tips: save.lastService.tips })}</li>
              <li>{t("settle.happy", { happy: save.lastService.happy })}</li>
              <li>{t("settle.rep", { rep: save.reputation, delta: (save.lastService.repDelta >= 0 ? "+" : "") + save.lastService.repDelta })}</li>
            </ul>
          )}
          <div className="dayflow-actions">
            <button className="ui-btn" disabled={busy} onClick={() => setShopping(true)}>{t("upgrade.open")}</button>
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "endDay" }, "hunt")}>{t("nextDay")}</button>
          </div>
        </Panel>
      )}
      {phase === "settle" && shopping && <Upgrades save={save} busy={busy} act={(a) => void act(a, "settle")} onClose={() => setShopping(false)} />}

      {failed && (
        <div className="dayflow-error ui-panel">
          <span>{shopShut(failed.code) ? t(`error.${failed.code}`) : huntRefused(failed) ? t("error.bad_hunt") : t("error.retry")}</span>
          {shopShut(failed.code) ? (
            // nothing to sell tonight: close the shop and go on to tomorrow
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "endDay" }, "hunt")}>{t("error.closeShop")}</button>
          ) : huntRefused(failed) ? (
            // the server would never take this report: come home empty-handed rather than stay stuck
            <button className="ui-btn" disabled={busy} onClick={() => act({ type: "finishHunt", huntId: save.hunt?.id ?? "", events: [], ko: false }, "kitchen")}>{t("error.emptyHanded")}</button>
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

// Tonight's service: the customers the server's seed brings (same plan as the server checks), the menu's
// stations and ingredients from the cookbook.
function Night({ save, onEnd }: { save: SaveData; onEnd: (r: { served: { customer: string; keys: string[]; accuracy: number }[]; left: string[] }) => void }) {
  const svc = save.service!;
  const customers = planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.menu, seats: seatBonus(save) });
  const methods: Partial<Record<DishId, Method>> = {};
  const menu = svc.menu.flatMap((dish) => {
    const r = save.cookbook[dish];
    if (!r) return [];
    methods[dish] = r.method;
    return [{ dish, items: r.items }];
  });
  const quality = { grill: toolQuality(save, "grill"), boil: toolQuality(save, "boil") };
  return <ServiceGame key={svc.id} shop={{ customers, methods }} items={save.items} menu={menu} quality={quality} onEnd={onEnd} />;
}
