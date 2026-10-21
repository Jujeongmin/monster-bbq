import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DishId } from "../../../shared/content/dishes";
import { RECIPES } from "../../../shared/content/recipes";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { CUT_IN_MS, cutInStep } from "./cutIn";
import { DishIcon } from "./DishIcon";
import "./cutIn.css";

// The new dish's cooking cut over the whole frame (Bancho-style, user 2026-10-21; the timing in cutIn.ts),
// made from the art already in: Bandal's frames, the round grill, the dish's parts, the spark, steam and
// sparkle effects. It plays once and then waits (user, 2026-10-15: it moved on by itself): a click, tap,
// Space or Enter while it plays jumps to the end, the next one closes it.
const LINES = ["cutin.bandal0", "cutin.bandal1", "cutin.bandal2"] as const;

export function ResearchCutIn({ dish, onDone }: { dish: DishId; onDone: () => void }) {
  const [ms, setMs] = useState(0);
  // one of his three lines, picked when the cut-in opens
  const [line] = useState(() => Math.floor(Math.random() * LINES.length));
  const done = useRef(false);
  const playing = useRef(true);
  const next = () => {
    if (playing.current) {
      playing.current = false;
      setMs(CUT_IN_MS);
      return;
    }
    if (done.current) return;
    done.current = true;
    onDone();
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    const t0 = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      if (!playing.current) return;
      const elapsed = now - t0;
      if (elapsed >= CUT_IN_MS) {
        playing.current = false;
        setMs(CUT_IN_MS);
      } else {
        setMs(elapsed);
        id = requestAnimationFrame(loop);
      }
    });
    const key = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") nextRef.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const makings = RECIPES[dish].items;
  const step = cutInStep(ms, makings.length);
  // the effects' three frames, turning over fast
  const fx = Math.floor(ms / 90) % 3;
  const onGrill = step.phase === "drop" || step.phase === "fire";
  const frame = document.querySelector(".frame") ?? document.body;
  return createPortal(
    <div className="cutin" onPointerDown={next}>
      <div className="cutin-bar top" />
      <div className="cutin-bar bottom" />
      <div className={`cutin-stage${step.shake ? " shake" : ""}`}>
        <img className="cutin-bandal" src={artUrl(`test/bandal/${step.frame}.png`)} alt="" />
        <div className="cutin-pan">
          {onGrill && <img className="cutin-grill" src={artUrl("test/cooking/grill.png")} alt="" />}
          {/* the makings dropping onto the grill one by one, a spark where each lands */}
          {onGrill &&
            makings.slice(0, step.landed).map((id, i) => (
              <span key={id + i} className={`cutin-making m${i}${step.phase === "fire" ? " sizzle" : ""}`}>
                <img src={artUrl(`test/items/icon_${id}.png`)} alt="" />
                {step.phase === "drop" && <img className="cutin-fx land" src={artUrl(`test/fx/spark_${fx}.png`)} alt="" />}
              </span>
            ))}
          {/* the fire: sparks round the grill and steam going up */}
          {step.phase === "fire" &&
            [0, 1, 2, 3, 4].map((k) => <img key={k} className={`cutin-fx spark s${k}`} src={artUrl(`test/fx/spark_${(fx + k) % 3}.png`)} alt="" />)}
          {step.phase === "fire" && [0, 1, 2].map((k) => <img key={`st${k}`} className={`cutin-fx steam t${k}`} src={artUrl(`test/fx/steam_${(fx + k) % 3}.png`)} alt="" />)}
          {/* the dish landing big, sparkling */}
          {step.stamp && (
            <div className="cutin-dish">
              <DishIcon dish={dish} scale={3} />
              {[0, 1, 2, 3].map((k) => (
                <img key={k} className={`cutin-fx sparkle k${k}`} src={artUrl(`test/fx/sparkle_${(fx + k) % 3}.png`)} alt="" />
              ))}
            </div>
          )}
        </div>
        {step.stamp && (
          <div className="cutin-stamp">
            <span className="cutin-new">{t("cutin.new")}</span>
            <span className="cutin-name">{t(`dish.${dish}` as StringKey)}</span>
          </div>
        )}
      </div>
      {step.flash && <div className="cutin-flash" />}
      {/* Bandal says it himself, ending in "곰" the way the lid ends in "껑" (user-approved lines 2026-10-15) */}
      {step.line && (
        <div className="cutin-say">
          <p className="ui-bubble cutin-line">{t(LINES[line])}</p>
        </div>
      )}
      {step.done && <span className="cutin-next">{t("cutin.next")}</span>}
    </div>,
    frame,
  );
}
