import { useEffect, useState } from "react";
import type { Action } from "../../../shared/actions";
import { BALANCE } from "../../../shared/balance";
import { METHODS, type Method } from "../../../shared/content/dishes";
import { ITEMS, parseItemKey } from "../../../shared/content/items";
import type { CookOutcome } from "../../../shared/kitchen/cook";
import type { SaveData } from "../../../shared/save";
import { itemName, t, type StringKey } from "../../i18n";
import { DishIcon } from "./DishIcon";
import { ItemIcon } from "./ItemIcon";

const ORDER = Object.keys(ITEMS);
// fridge order: the item list's order, premium before regular
function byItem(a: string, b: string) {
  const x = parseItemKey(a)!;
  const y = parseItemKey(b)!;
  return ORDER.indexOf(x.id) - ORDER.indexOf(y.id) || (x.grade === "premium" ? -1 : 1);
}

// The research kitchen: up to three ingredients (one of each kind) and a method, then a try. The
// server judges it; its answer comes back as the save's lastCook for this try's attemptId (a resent
// try after a lost reply carries the same id and is not cooked twice).
export function Research({ save, busy, act }: { save: SaveData; busy: boolean; act: (a: Action) => void }) {
  const [pot, setPot] = useState<string[]>([]);
  const [method, setMethod] = useState<Method | null>(null);
  const [attempt, setAttempt] = useState<string | null>(null);
  // whatever the last try used up leaves the pot
  useEffect(() => setPot((p) => p.filter((k) => (save.items[k] ?? 0) > 0)), [save.items]);

  const fridge = Object.keys(save.items).filter((k) => parseItemKey(k)).sort(byItem);
  const result = attempt && save.lastCook?.attemptId === attempt ? save.lastCook.outcome : null;

  function toggle(key: string) {
    const id = parseItemKey(key)!.id;
    setPot((p) => {
      if (p.includes(key)) return p.filter((k) => k !== key);
      const same = p.findIndex((k) => parseItemKey(k)!.id === id);
      if (same >= 0) return p.map((k, i) => (i === same ? key : k));
      return p.length < BALANCE.kitchen.maxIngredients ? [...p, key] : p;
    });
  }

  function cook() {
    if (!method || pot.length === 0) return;
    const attemptId = crypto.randomUUID();
    setAttempt(attemptId);
    act({ type: "cook", attemptId, items: pot, method });
  }

  return (
    <div className="research">
      <section className="kitchen-box fridge">
        <h3>{t("kitchen.fridge")}</h3>
        {fridge.length === 0 && <p className="kitchen-empty">{t("kitchen.fridgeEmpty")}</p>}
        <div className="fridge-grid">
          {fridge.map((k) => (
            <button key={k} className={`fridge-item${pot.includes(k) ? " on" : ""}`} onClick={() => toggle(k)} title={itemName(k)}>
              <ItemIcon itemKey={k} />
              <span className="fridge-count">{save.items[k]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="kitchen-box pot">
        <h3>{t("kitchen.pot")}</h3>
        <div className="pot-slots">
          {Array.from({ length: BALANCE.kitchen.maxIngredients }, (_, i) => pot[i]).map((k, i) => (
            <button key={i} className="pot-slot" disabled={!k} onClick={() => k && toggle(k)}>
              {k ? (
                <>
                  <ItemIcon itemKey={k} />
                  <span>{itemName(k)}</span>
                </>
              ) : (
                <span className="kitchen-empty">·</span>
              )}
            </button>
          ))}
        </div>
        {/* keeps its space when hidden, so the buttons below never jump under a finger */}
        <p className="kitchen-empty" style={{ visibility: pot.length === 0 ? "visible" : "hidden" }}>
          {t("kitchen.potEmpty")}
        </p>
        <h3>{t("kitchen.method")}</h3>
        <div className="methods">
          {METHODS.map((m) => (
            <button key={m} className={m === method ? "on" : ""} onClick={() => setMethod(m)}>
              {t(`method.${m}` as StringKey)}
            </button>
          ))}
        </div>
        <button className="cook-button" disabled={busy || !method || pot.length === 0} onClick={cook}>
          {t("kitchen.cook")}
        </button>
        {result && <CookResultView key={attempt} outcome={result} />}
      </section>
    </div>
  );
}

function CookResultView({ outcome }: { outcome: CookOutcome }) {
  if (outcome.kind === "new" || outcome.kind === "known")
    return outcome.kind === "new" ? (
      <div className="cook-result new">
        <div className="cook-banner">{t("kitchen.new")}</div>
        <DishIcon dish={outcome.dish} size={96} />
        <div className="cook-dish">{t(`dish.${outcome.dish}` as StringKey)}</div>
      </div>
    ) : (
      <div className="cook-result">
        <DishIcon dish={outcome.dish} size={64} />
        <div className="cook-dish">{t(`dish.${outcome.dish}` as StringKey)}</div>
        <p>{t("kitchen.known")}</p>
      </div>
    );
  if (outcome.kind === "near") {
    const line = outcome.hint === "missing" ? `kitchen.hint.missing.${outcome.taste}` : `kitchen.hint.${outcome.hint}`;
    return (
      <div className="cook-result near">
        <span className="lid-name">{t("kitchen.lid")}</span>
        <p className="lid-bubble">{t(line as StringKey)}</p>
      </div>
    );
  }
  return (
    <div className="cook-result fail">
      <DishIcon dish="fail" size={64} />
      <div className="cook-dish">{t(`kitchen.fail.${outcome.method}` as StringKey)}</div>
      <p>{t("kitchen.failLine")}</p>
    </div>
  );
}
