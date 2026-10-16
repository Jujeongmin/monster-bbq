import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { HUD_ART, type TimeOfDay } from "./hud";

// Dave's title card when the day moves on: the screen darkens, "Day 2 · Night / The shop opens" pops in,
// holds, and it all fades back (CSS, about 1.6 s). A tap ends it early; it never blocks the screen after.
export function TitleCard({ day, time, line, onDone }: { day: number; time: TimeOfDay; line: StringKey; onDone: () => void }) {
  return (
    <div className="title-card" onAnimationEnd={(e) => e.target === e.currentTarget && onDone()} onPointerDown={onDone}>
      <div className="title-card-box">
        <div className="ui-plate title-card-day">
          <img src={artUrl(HUD_ART.time[time])} alt="" />
          {t("hud.dayTime", { day, time: t(`time.${time}` as StringKey) })}
        </div>
        <div className="ui-ribbon title-card-line">{t(line)}</div>
      </div>
    </div>
  );
}
