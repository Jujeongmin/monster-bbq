import type { SaveData } from "../../../shared/save";
import { vipLevel } from "../../../shared/shop";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { HUD_ART, type TimeOfDay } from "./hud";
import "./hud.css";

// The day's HUD like Dave's (Dave-style UI design 4): the time of day and the day at the top left, gold and golden charcoal at the top right, Grandma's notebook big at
// the bottom left (Tab) and the bag at the bottom right (I); while a window is open (`quiet`) those two
// step aside, like Dave's HUD while the phone is out. The hunt and the night's service hide it (they carry their own).
export function DayHud({ save, time, quiet = false, onBag, onNotebook }: { save: SaveData; time: TimeOfDay; quiet?: boolean; onBag: () => void; onNotebook: () => void }) {
  const vip = vipLevel(save.vip.spent);
  const touch = typeof window !== "undefined" && ("ontouchstart" in window || new URLSearchParams(location.search).has("touch"));
  return (
    <div className="dh">
      <div className="dh-left">
        <div className="ui-plate dh-time">
          <img className="ui-icon" src={artUrl(HUD_ART.time[time])} alt="" />
          {t("hud.dayTime", { day: save.day, time: t(`time.${time}` as StringKey) })}
        </div>
      </div>
      <div className="ui-bar dh-res">
        <span>
          <img className="ui-icon" src={artUrl("test/ui/icon_gold.png")} alt="" />
          {save.gold.toLocaleString()}
        </span>
        <span title={t("hud.charcoal", { n: save.charcoal })}>
          <img className="ui-icon ui-icon-lg" src={artUrl("test/ui/icon_golden_charcoal.png")} alt="" />
          {save.charcoal.toLocaleString()}
        </span>
        {vip > 0 && (
          <span>
            <img className="ui-icon ui-icon-lg" src={artUrl("test/ui/vip_badge.png")} alt="" />
            {t("hud.vip", { lv: vip })}
          </span>
        )}
      </div>
      {/* the notebook big at the bottom left and the bag at the bottom right, each its picture with its key
          (user, 2026-10-16); on touch no keys, and the notebook sits above the walking stick */}
      <button className={`dh-big dh-note${touch ? " touch" : ""}${quiet ? " quiet" : ""}`} onClick={onNotebook} aria-label={t("hud.notebookButton")}>
        <img src={artUrl(HUD_ART.notebook)} alt="" />
        <span className="dh-label">
          {!touch && <kbd className="dh-key">Tab</kbd>}
          {t("hud.notebookButton")}
        </span>
      </button>
      <button className={`dh-big dh-bag${touch ? " touch" : ""}${quiet ? " quiet" : ""}`} onClick={onBag} aria-label={t("hud.bagButton")}>
        <img src={artUrl(HUD_ART.bag)} alt="" />
        <span className="dh-label">
          {!touch && <kbd className="dh-key">I</kbd>}
          {t("hud.bagButton")}
        </span>
      </button>
    </div>
  );
}
