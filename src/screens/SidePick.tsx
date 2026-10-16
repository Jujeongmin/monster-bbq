import { useState } from "react";
import { SIDE_WEAPONS, type SideWeaponId } from "../../shared/content/sideWeapons";
import { ammoOf, ownsSide } from "../../shared/growth";
import type { SaveData } from "../../shared/save";
import { artUrl } from "../game/art";
import { Scene } from "./hud/Scene";
import { t, type StringKey } from "../i18n";

// Setting out (hunt v3 design 4.4): which side weapon to take, one per hunt, with its shots for the whole
// hunt. Ones not bought yet show where to get them. The last choice is remembered on this device.
const LAST_KEY = "monster-bbq:side";

function lastSide(save: SaveData): SideWeaponId {
  try {
    const v = localStorage.getItem(LAST_KEY);
    const id = SIDE_WEAPONS.find((s) => s === v);
    if (id && ownsSide(save, id)) return id;
  } catch {
    // private mode: start from the slingshot
  }
  return "sling";
}

export function SidePick({ save, busy, onGo, onCancel }: { save: SaveData; busy: boolean; onGo: (side: SideWeaponId) => void; onCancel?: () => void }) {
  const [side, setSide] = useState<SideWeaponId>(() => lastSide(save));
  const go = () => {
    try {
      localStorage.setItem(LAST_KEY, side);
    } catch {
      // private mode: not remembered, nothing worse
    }
    onGo(side);
  };
  return (
    <Scene>
      <div className="ui-panel side-pick">
        <h2>{t("side.title")}</h2>
        <div className="side-list">
          {SIDE_WEAPONS.map((id, i) => {
            const owned = ownsSide(save, id);
            return (
              <button key={id} className={`ui-box side-card${id === side ? " on" : ""}`} style={{ "--i": i } as React.CSSProperties} disabled={!owned} onClick={() => setSide(id)}>
                <img src={artUrl(`test/ui/side/${id}.png`)} alt="" />
                <span className="side-name">{t(`hunt.side.${id}` as StringKey)}</span>
                <span className="side-ammo">{owned ? t("side.ammo", { n: ammoOf(save, id) }) : t("side.locked")}</span>
              </button>
            );
          })}
        </div>
        <div className="dayflow-actions">
          {onCancel && (
            <button className="ui-btn" disabled={busy} onClick={onCancel}>
              {t("upgrade.close")}
            </button>
          )}
          <button className="ui-btn" disabled={busy} onClick={go}>
            {t("side.go")}
          </button>
        </div>
      </div>
    </Scene>
  );
}
