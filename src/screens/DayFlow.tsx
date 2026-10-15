import { useEffect, useRef, useState } from "react";
import type { Action } from "../../shared/actions";
import { bagSlots, huntStats, seatBonus } from "../../shared/growth";
import { BALANCE } from "../../shared/balance";
import { dishPrice, type MenuLine } from "../../shared/kitchen/dish";
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

// One day (hunt v3 design 3): morning hunt -> lunch -> afternoon hunt -> kitchen -> service -> settle -> next day. Every change goes through the transport
// (the server's rules); the screen only moves on once the change is saved. Kitchen, service and
// settle are placeholder screens until plans 04-05 (and their art in plan 08).
type Phase = "hunt" | "lunch" | "kitchen" | "service" | "settle";
const PHASE_NAME: Record<Phase, StringKey> = {
  hunt: "phase.hunt",
  lunch: "phase.lunch",
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
      setPhase(s.service ? "service" : s.hunt ? "hunt" : s.stage);
    }, () => setLoadFailed(true));
  }
  useEffect(load, [transport]);
  // the upgrade shop belongs to the screen it was opened from: a new stage closes it
  useEffect(() => setShopping(false), [phase]);

  // the server opens every hunt (its seed decides the hunting ground): ask whenever a day's hunt starts
  useEffect(() => {
    if (save && phase === "hunt" && save.stage === "hunt" && !save.hunt && !failed) void act({ type: "startHunt", zone: "forest" }, "hunt");
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
          hunt={{ huntId: save.hunt.id, seed: save.hunt.seed, zone: save.hunt.zone, period: save.hunt.period, stats: huntStats(save), bagSlots: bagSlots(save), lunchbox: save.lunchbox.map((dish) => ({ dish, heal: Math.round(dishPrice(dish, save.dishes[dish] ?? 1) * BALANCE.lunch.healPerGold) })) }}
          onHuntEnd={(r: HuntResult) => act({ type: "finishHunt", huntId: save.hunt!.id, events: r.events, exit: r.exit, ko: r.ko }, save.hunt!.period === "morning" ? "lunch" : "kitchen")}
        />
      )}

      {/* the kitchen carries day and gold in its own bottom row */}
      {phase !== "kitchen" && phase !== "lunch" && (
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
      )}

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
function Night({ save, onEnd }: { save: SaveData; onEnd: (r: { served: { customer: string; dish: string }[]; left: string[] }) => void }) {
  const svc = save.service!;
  const customers = planService(svc.seed, { day: save.day, reputation: save.reputation, menu: svc.dishes.map((d) => d.dish), seats: seatBonus(save) });
  return <ServiceGame key={svc.id} shop={{ serviceId: svc.id, customers, dishes: svc.dishes }} onEnd={onEnd} />;
}
