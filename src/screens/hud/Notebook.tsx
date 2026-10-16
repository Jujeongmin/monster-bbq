import { useState } from "react";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { HUD_ART, notebookApps, type App, type Phase } from "./hud";

// Grandma's notebook (Dave-style UI design 6, Dave's phone): every window of the day as an app. Pressed
// at the HUD's bottom right, the notebook flies up from its button and its cover swings open onto the apps
// (user, 2026-10-16); closing folds it back down. The menu board opens only in the evening kitchen; a closed
// app says where it opens.
export function Notebook({ phase, onApp, onClose }: { phase: Phase; onApp: (app: App) => void; onClose: () => void }) {
  const [closing, setClosing] = useState<App | "close" | null>(null);
  const close = (then: App | "close") => setClosing((c) => c ?? then);
  return (
    <div className={`hud-win nb-win${closing ? " closing" : ""}`} onClick={() => close("close")}>
      <div
        className="nb-book"
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => {
          if (e.target !== e.currentTarget || !closing) return;
          if (closing === "close") onClose();
          else onApp(closing);
        }}
      >
        <div className="ui-panel notebook">
          <h2>{t("notebook.title")}</h2>
          <div className="notebook-apps">
            {notebookApps(phase).map(({ app, open }) => (
              <button key={app} className="ui-box notebook-app" disabled={!open} onClick={() => close(app)}>
                <img src={artUrl(HUD_ART.apps[app])} alt="" />
                <span className="notebook-name">{t(`notebook.app.${app}` as StringKey)}</span>
                <span className="notebook-why" style={{ visibility: open ? "hidden" : "visible" }}>
                  {t("notebook.eveningOnly")}
                </span>
              </button>
            ))}
          </div>
          <button className="ui-btn" onClick={() => close("close")}>
            {t("upgrade.close")}
          </button>
        </div>
        {/* the cover: the notebook's walnut binding with its picture, swinging open on its left edge */}
        <div className="ui-frame nb-cover" aria-hidden>
          <img src={artUrl(HUD_ART.notebook)} alt="" />
          <span>{t("notebook.title")}</span>
        </div>
      </div>
    </div>
  );
}
