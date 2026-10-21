import { artUrl } from "../../game/art";
import { t } from "../../i18n";
import { usePortrait } from "../portrait";

// A phone held upright: the lid turning on its side asks for the phone to be turned too (mobile pass, user
// 2026-10-21). Over the whole window, outside the 16:9 frame; the hunt and the night wait meanwhile (DayFlow).
export function RotatePrompt() {
  if (!usePortrait()) return null;
  return (
    <div className="rotate-prompt" role="alert">
      <img src={artUrl("test/lid/surprised.png")} alt="" />
      <p>{t("rotate.ask")}</p>
    </div>
  );
}
