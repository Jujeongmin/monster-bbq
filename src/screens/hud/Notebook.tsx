import { useEffect, useRef, useState } from "react";
import { sfx } from "../../audio/sfx";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { MenuLine } from "./Book";
import { HUD_ART, notebookApps, type App, type Phase } from "./hud";

// Grandma's notebook (Dave-style UI design 6, Dave's phone): every window of the day as an app. Pressed
// at the HUD's bottom right, the notebook flies up from its button and its cover swings open onto the apps
// (user, 2026-10-16); closing folds it back down. The menu board opens only in the evening kitchen; a closed
// app says where it opens.
export function Notebook({ phase, shut = 0, fresh = [], onApp, onClose }: { phase: Phase; shut?: number; fresh?: App[]; onApp: (app: App) => void; onClose: () => void }) {
  // the cover swinging open
  useEffect(() => sfx.play("bookOpen"), []);
  const [closing, setClosing] = useState<App | "close" | null>(null);
  const close = (then: App | "close") => setClosing((c) => c ?? then);
  // its key pressed again: fold back like the close button
  const first = useRef(shut);
  useEffect(() => {
    if (shut !== first.current) close("close");
  }, [shut]);
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
        {/* the open notebook (168x112 art pixels): four apps on the left page, three on the right */}
        <div className="notebook" style={{ backgroundImage: `url(${artUrl(HUD_ART.notebookOpen)})` }} role="dialog" aria-label={t("notebook.title")}>
          {[0, 4].map((from) => (
            <div key={from} className={`notebook-page${from ? " right" : ""}`}>
              {notebookApps(phase)
                .slice(from, from ? undefined : 4)
                .map(({ app, open }) => (
                  <button key={app} className="notebook-app" disabled={!open} onClick={() => close(app)}>
                    <img src={artUrl(HUD_ART.apps[app])} alt="" />
                    <span className="notebook-name">
                      {t(`notebook.app.${app}` as StringKey)}
                      {fresh.includes(app) && <span className="notebook-new">{t("notebook.new")}</span>}
                    </span>
                    {!open && <span className="notebook-why">{t("notebook.eveningOnly")}</span>}
                  </button>
                ))}
            </div>
          ))}
          <MenuLine className="notebook-close" label={t("upgrade.close")} onPress={() => close("close")} />
        </div>
        {/* the notebook itself, closed, flying in over the right page; its cover swings open on the spine
            (user, 2026-10-16: the notebook, not a brown panel) */}
        <img className="nb-cover" src={artUrl(HUD_ART.notebookClosed)} alt="" aria-hidden />
      </div>
    </div>
  );
}
