import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DishId } from "../../../shared/content/dishes";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { cutInStep } from "./cutIn";
import { DishIcon } from "./DishIcon";
import "./cutIn.css";

// The research cut-in over the whole frame (Bandal art approved 2026-10-15; the close-up, flames and
// stamp art come later, these are the stand-ins). A click, tap, Space or Enter skips it.
export function ResearchCutIn({ dish, onDone }: { dish: DishId; onDone: () => void }) {
  const [ms, setMs] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const t0 = performance.now();
    let id = requestAnimationFrame(function loop(now) {
      const elapsed = now - t0;
      setMs(elapsed);
      if (cutInStep(elapsed).done) finishRef.current();
      else id = requestAnimationFrame(loop);
    });
    const key = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") finishRef.current();
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
    <div className="cutin" onPointerDown={finish}>
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
      {step.line && <p className="cutin-line">{t("kitchen.newLine")}</p>}
    </div>,
    frame,
  );
}
