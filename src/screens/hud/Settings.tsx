import { useState } from "react";
import { bgm } from "../../audio/bgm";
import { sfx } from "../../audio/sfx";
import { ALPHAS, pageStore, readPadPrefs, SIZES, writePadPrefs, type PadPrefs } from "../../game/padPrefs";
import { locale, LOCALE_KEY, LOCALES, t, type Locale, type StringKey } from "../../i18n";
import { BookWindow } from "./Book";

// The settings (user, 2026-10-27), from the gear on the day's HUD, on the notebook's pages like the credits:
// the language and the sound on the left, the touch pad's size and shade on the right (the same choices as
// the hunt's pause menu). Each choice a row of words, the one in use on a card.

// each language named in its own words
const LANGUAGE_NAME: Record<Locale, string> = { ko: "한국어", en: "English" };

function Choices<T extends string>({ options, value, name, onPick }: { options: readonly T[]; value: T; name: (o: T) => string; onPick: (o: T) => void }) {
  return (
    <div className="set-choices">
      {options.map((o) => (
        <button key={o} className={`book-row set-choice${o === value ? " on" : ""}`} aria-pressed={o === value} onClick={() => o !== value && onPick(o)}>
          {name(o)}
        </button>
      ))}
    </div>
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [muted, setMuted] = useState(() => sfx.isMuted());
  const [pad, setPad] = useState(() => readPadPrefs(pageStore()));
  const pickPad = (p: PadPrefs) => (writePadPrefs(pageStore(), p), setPad(p));
  // every line on screen is already written in the old language: the game starts again in the new one
  const pickLanguage = (l: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      // storage blocked: the language cannot be kept, so it stays as it is
      return;
    }
    location.reload();
  };
  return (
    <BookWindow
      label={t("settings.title")}
      onClose={onClose}
      left={
        <div className="book-detail set-page">
          <h3>{t("settings.language")}</h3>
          <Choices options={LOCALES} value={locale()} name={(l) => LANGUAGE_NAME[l]} onPick={pickLanguage} />
          <p className="soft">{t("settings.languageNote")}</p>
          <h3>{t("settings.sound")}</h3>
          <Choices
            options={["on", "off"] as const}
            value={muted ? "off" : "on"}
            name={(o) => t(`settings.sound.${o}`)}
            onPick={(o) => {
              sfx.unlock();
              sfx.setMuted(o === "off");
              bgm.refresh();
              setMuted(o === "off");
            }}
          />
        </div>
      }
      right={
        <div className="book-detail set-page">
          <h3>{t("settings.pad")}</h3>
          <p className="soft">{t("settings.padNote")}</p>
          <h3 className="set-sub">{t("settings.padSize")}</h3>
          <Choices options={SIZES} value={pad.size} name={(o) => t(`hunt.pad.size.${o}` as StringKey)} onPick={(size) => pickPad({ ...pad, size })} />
          <h3 className="set-sub">{t("settings.padAlpha")}</h3>
          <Choices options={ALPHAS} value={pad.alpha} name={(o) => t(`hunt.pad.alpha.${o}` as StringKey)} onPick={(alpha) => pickPad({ ...pad, alpha })} />
        </div>
      }
    />
  );
}
