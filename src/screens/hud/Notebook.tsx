import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { HUD_ART, notebookApps, type App, type Phase } from "./hud";

// Grandma's notebook (Dave-style UI design 6, Dave's phone): every window of the day as an app. The menu
// board opens only in the evening kitchen; a closed app says where it opens.
export function Notebook({ phase, onApp, onClose }: { phase: Phase; onApp: (app: App) => void; onClose: () => void }) {
  return (
    <div className="hud-win" onClick={onClose}>
      <div className="ui-panel notebook" onClick={(e) => e.stopPropagation()}>
        <h2>{t("notebook.title")}</h2>
        <div className="notebook-apps">
          {notebookApps(phase).map(({ app, open }) => (
            <button key={app} className="ui-box notebook-app" disabled={!open} onClick={() => onApp(app)}>
              <img src={artUrl(HUD_ART.apps[app])} alt="" />
              <span className="notebook-name">{t(`notebook.app.${app}` as StringKey)}</span>
              {!open && <span className="notebook-why">{t("notebook.eveningOnly")}</span>}
            </button>
          ))}
        </div>
        <button className="ui-btn" onClick={onClose}>
          {t("upgrade.close")}
        </button>
      </div>
    </div>
  );
}
