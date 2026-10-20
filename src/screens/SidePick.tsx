import { useState } from "react";
import { SIDE_WEAPONS, type SideWeaponId } from "../../shared/content/sideWeapons";
import { ammoOf, ownsSide } from "../../shared/growth";
import type { SaveData } from "../../shared/save";
import { artUrl } from "../game/art";
import { HUD_ART } from "./hud/hud";
import { Scene } from "./hud/Scene";
import { t, type StringKey } from "../i18n";
import { MenuLine } from "./hud/Book";

// Setting out (hunt v3 design 4.4): which side weapon to take, one per hunt, with its shots for the whole
// hunt. Ones not bought yet show where to get them. The last choice is remembered on this device. The
// weapons hang on a weapon rack (design 8): one on each of its four pegs, the name on the beam below, the
// shots on the shelf.
const LAST_KEY = "monster-bbq:side";
// the rack's four pegs, in art pixels from its left edge (art/test/ui/hud/weapon_rack.png)
const PEGS = [46, 84, 123, 162];

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
      <div className="side-pick">
        <h2>{t("side.title")}</h2>
        <div className="side-rack" style={{ backgroundImage: `url(${artUrl(HUD_ART.rack)})` }}>
          {SIDE_WEAPONS.map((id, i) => {
            const owned = ownsSide(save, id);
            return (
              <button key={id} className={`side-card${id === side ? " on" : ""}`} style={{ "--i": i, "--peg": PEGS[i] } as React.CSSProperties} disabled={!owned} onClick={() => setSide(id)}>
                <img src={artUrl(`test/ui/side/${id}.png`)} alt="" />
                <span className="side-name">{t(`hunt.side.${id}` as StringKey)}</span>
                <span className="side-ammo">{owned ? t("side.ammo", { n: ammoOf(save, id) }) : t("side.locked")}</span>
              </button>
            );
          })}
        </div>
        {SIDE_WEAPONS.some((id) => !ownsSide(save, id)) && <p className="side-hint">{t("side.lockedHint")}</p>}
        <div className="dayflow-actions">
          {onCancel && (
            <MenuLine label={t("upgrade.close")} onPress={() => !busy && onCancel()} />
          )}
          <button className="ui-btn" disabled={busy} onClick={go}>
            {t("side.go")}
          </button>
        </div>
      </div>
    </Scene>
  );
}
