import type { SaveData } from "../../../shared/save";
import { vipLevel } from "../../../shared/shop";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { HUD_ART, type TimeOfDay } from "./hud";
import "./hud.css";

// The day's HUD like Dave's (Dave-style UI design 4): the time of day and the day at the top left (the
// shop's name plate beside it in the kitchen), gold and golden charcoal at the top right, the bag and
// Grandma's notebook at the bottom right. The hunt and the night's service hide it (they carry their own).
export function DayHud({ save, time, title, onBag, onNotebook }: { save: SaveData; time: TimeOfDay; title?: string; onBag: () => void; onNotebook: () => void }) {
  const vip = vipLevel(save.vip.spent);
  return (
    <div className="dh">
      <div className="dh-left">
        <div className="ui-plate dh-time">
          <img className="ui-icon" src={artUrl(HUD_ART.time[time])} alt="" />
          {t("hud.dayTime", { day: save.day, time: t(`time.${time}` as StringKey) })}
        </div>
        {title && <div className="ui-plate dh-title">{title}</div>}
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
      <div className="dh-buttons">
        <button className="ui-sq dh-btn" onClick={onBag}>
          <img src={artUrl(HUD_ART.bag)} alt="" />
          {t("hud.bagButton")}
        </button>
        <button className="ui-sq dh-btn" onClick={onNotebook}>
          <img src={artUrl(HUD_ART.notebook)} alt="" />
          {t("hud.notebookButton")}
        </button>
      </div>
    </div>
  );
}
