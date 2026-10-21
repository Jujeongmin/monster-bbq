import { t } from "../../i18n";
import { CREDITS, MUSIC } from "../credits";
import { BookWindow } from "./Book";

// The credits (user, 2026-10-21), on the notebook's pages from its foot: the game on the left; the music
// (CC BY 4.0, each track credited), the sounds and the font on the right.
export function Credits({ onClose }: { onClose: () => void }) {
  return (
    <BookWindow
      label={t("credits.title")}
      onClose={onClose}
      left={
        <div className="book-detail credits">
          <h3>{t("credits.game")}</h3>
          <p className="soft">{t("credits.thanks")}</p>
        </div>
      }
      right={
        <div className="book-detail credits">
          {MUSIC.length > 0 && (
            <>
              <h3>{t("credits.music")}</h3>
              {MUSIC.map((m) => (
                <p key={m.title}>
                  "{m.title}" · {m.by} · {m.site}
                </p>
              ))}
              <p className="soft">{CREDITS.musicLicence}</p>
            </>
          )}
          <h3>{t("credits.sounds")}</h3>
          <p>
            {CREDITS.sounds.by} · {CREDITS.sounds.site}
          </p>
          <h3>{t("credits.font")}</h3>
          <p>
            {CREDITS.font.name} {CREDITS.font.by}
          </p>
          <p className="soft">{CREDITS.font.licence}</p>
        </div>
      }
    />
  );
}
