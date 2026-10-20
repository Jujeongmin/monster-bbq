import type { SideWeaponId } from "../../../shared/content/sideWeapons";
import { useEffect } from "react";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";

// The hunt's controls (user, 2026-10-20, like Dave's first dive): before the first hunt starts, and from the
// pause menu. One row each: the keys, the tool's picture where there is one, what it does. The hunt holds
// still while it is open.
type Row = { keys: string[]; icon?: string; what: StringKey };

function rows(touch: boolean, side: SideWeaponId): Row[] {
  if (touch)
    return [
      { keys: [t("controls.key.stick")], what: "controls.move" },
      { keys: [t("controls.key.dragRight")], icon: "test/ui/upg_ranged.png", what: "controls.harpoonTouch" },
      { keys: [t("controls.key.slashBtn")], icon: "test/ui/upg_melee.png", what: "controls.slash" },
      { keys: [t("controls.key.sideBtn")], icon: `test/ui/side/${side}.png`, what: "controls.side" },
      { keys: [t("controls.key.useBtn")], what: "controls.use" },
    ];
  return [
    { keys: ["W", "A", "S", "D"], what: "controls.move" },
    { keys: [t("controls.key.mouse")], what: "controls.aim" },
    { keys: [t("controls.key.left")], icon: "test/ui/upg_ranged.png", what: "controls.harpoon" },
    { keys: ["Space"], icon: "test/ui/upg_melee.png", what: "controls.slash" },
    { keys: [t("controls.key.right")], icon: `test/ui/side/${side}.png`, what: "controls.side" },
    { keys: ["E"], what: "controls.use" },
    { keys: ["Esc"], what: "controls.pause" },
  ];
}

export function ControlsPanel({ touch, side, onClose }: { touch: boolean; side: SideWeaponId; onClose: () => void }) {
  // Space, Enter or E closes it (the line with the ▶). Caught first and kept from the hunt, so the same
  // Space is not also a slash once the hunt moves again.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter" && e.key.toLowerCase() !== "e") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "keydown" && !e.repeat) onClose();
    };
    addEventListener("keydown", on, true);
    addEventListener("keyup", on, true);
    return () => (removeEventListener("keydown", on, true), removeEventListener("keyup", on, true));
  }, [onClose]);
  return (
    <div className="dayflow-screen controls-screen">
      <div className="ui-frame controls" role="dialog" aria-label={t("controls.title")}>
        <h2>{t("controls.title")}</h2>
        <ul className="controls-rows">
          {rows(touch, side).map((r) => (
            <li key={r.what}>
              <span className="controls-keys">
                {r.keys.map((k) => (
                  <kbd key={k} className="dh-key">
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="controls-icon">{r.icon && <img src={artUrl(r.icon)} alt="" />}</span>
              <span>{t(r.what)}</span>
            </li>
          ))}
        </ul>
        <button className="menu-item" onClick={onClose} autoFocus>
          {t("controls.ok")}
        </button>
      </div>
    </div>
  );
}
