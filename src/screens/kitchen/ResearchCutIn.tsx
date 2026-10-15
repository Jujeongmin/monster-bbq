import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DishId } from "../../../shared/content/dishes";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { CUT_IN_MS, cutInStep } from "./cutIn";
import { DishIcon } from "./DishIcon";
import "./cutIn.css";

// The research cut-in over the whole frame (Bandal art approved 2026-10-15; the close-up, flames and
// stamp art come later, these are the stand-ins). It plays once and then waits (user, 2026-10-15: it
// moved on by itself): a click, tap, Space or Enter while it plays jumps to the end, the next one closes it.
export function ResearchCutIn({ dish, onDone }: { dish: DishId; onDone: () => void }) {
  const [ms, setMs] = useState(0);
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
      if (cutInStep(elapsed).done) {
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

  const step = cutInStep(ms);
  const frame = document.querySelector(".frame") ?? document.body;
  return createPortal(
    <div className="cutin" onPointerDown={next}>
      <div className="cutin-bar top" />
      <div className="cutin-bar bottom" />
      <img className="cutin-bandal" src={artUrl(`test/bandal/${step.frame}.png`)} alt="" />
      {step.stamp && (
        <div className="cutin-stamp">
          <DishIcon dish={dish} scale={2} />
          <span className="cutin-new">{t("cutin.new")}</span>
          <span className="cutin-name">{t(`dish.${dish}` as StringKey)}</span>
        </div>
      )}
      {/* the line is the lid's, not Bandal's (he hardly talks): the lid is shown saying it */}
      {step.line && (
        <div className="cutin-say">
          <img className="cutin-lid" src={artUrl("test/lid/smug.png")} alt="" />
          <p className="ui-bubble cutin-line">{t("kitchen.newLine")}</p>
        </div>
      )}
      {step.done && <span className="cutin-next">{t("cutin.next")}</span>}
    </div>,
    frame,
  );
}
