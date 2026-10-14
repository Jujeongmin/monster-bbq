import { useEffect, useRef, useState } from "react";
import type { Action } from "../../shared/actions";
import type { SaveData } from "../../shared/save";
import { PhaserGame } from "../game/PhaserGame";
import type { HuntResult } from "../game/scenes/HuntScene";
import { t, type StringKey } from "../i18n";
import type { Transport } from "../net/transport";
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

export function DayFlow({ transport }: { transport: Transport }) {
  const [save, setSave] = useState<SaveData | null>(null);
  const [phase, setPhase] = useState<Phase>("hunt");
  const [hunt, setHunt] = useState(0);
  const [failed, setFailed] = useState<{ action: Action; next: Phase } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // a second click can land before React re-renders with busy=true
  const busyRef = useRef(false);

  function load() {
    setLoadFailed(false);
    transport.load().then(setSave, () => setLoadFailed(true));
  }
  useEffect(load, [transport]);

  // the server opens every hunt (its seed decides the hunting ground): ask whenever a day's hunt starts
  useEffect(() => {
    if (save && phase === "hunt" && !save.hunt && !failed) void act({ type: "startHunt", zone: "forest" }, "hunt");
  }, [save, phase, failed]);

  async function act(action: Action, next: Phase) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(null);
    try {
      setSave(await transport.act(action));
      setPhase(next);
      if (next === "hunt") setHunt((n) => n + 1);
    } catch {
      setFailed({ action, next });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!save)
    return (
      <div className="dayflow dayflow-wait">
        {loadFailed ? (
          <div className="dayflow-error">
            <span>{t("error.retry")}</span>
            <button onClick={load}>↻</button>
          </div>
        ) : (
          "…"
        )}
      </div>
    );

  return (
    <div className="dayflow">
      {phase === "hunt" && save.hunt && (
        <PhaserGame key={hunt} onHuntEnd={(r: HuntResult) => act({ type: "finishHunt", huntId: save.hunt!.id, events: [], ko: r.ko }, "kitchen")} />
      )}

      <div className="dayflow-bar">
        <span>{t("hud.day", { day: save.day })}</span>
        <span>{t("hud.gold", { gold: save.gold })}</span>
        {/* during the hunt the scene shows the live bag; the stored meat would read as a second count */}
        {phase !== "hunt" && <span>{t("hud.items", { count: Object.values(save.items).reduce((a, b) => a + b, 0) })}</span>}
        <span className="dayflow-phase">{t(PHASE_NAME[phase])}</span>
      </div>

      {phase === "kitchen" && (
        <Panel title={t("kitchen.title")} body={t("kitchen.body")}>
          <button disabled={busy} onClick={() => setPhase("service")}>{t("next")}</button>
        </Panel>
      )}
      {phase === "service" && (
        <Panel title={t("service.title")} body={t("service.body")}>
          <button disabled={busy} onClick={() => act({ type: "sellAll" }, "settle")}>{t("service.sell")}</button>
        </Panel>
      )}
      {phase === "settle" && (
        <Panel title={t("settle.title")} body={t("settle.body", { day: save.day, gold: save.gold })}>
          <button disabled={busy} onClick={() => act({ type: "endDay" }, "hunt")}>{t("nextDay")}</button>
        </Panel>
      )}

      {failed && (
        <div className="dayflow-error">
          <span>{t("error.retry")}</span>
          <button disabled={busy} onClick={() => act(failed.action, failed.next)}>↻</button>
        </div>
      )}
    </div>
  );
}

function Panel({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="dayflow-screen">
      <div className="dayflow-panel">
        <h2>{title}</h2>
        <p>{body}</p>
        {children}
      </div>
    </div>
  );
}
