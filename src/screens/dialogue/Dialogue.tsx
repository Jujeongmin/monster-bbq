import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { press, start, tick, type DialogueState } from "./dialogueState";
import "./dialogue.css";

// The NPC dialogue box (like talking to an NPC in an MMORPG): the dark bar along the bottom (approved
// art, art/test/ui), the speaker's portrait at the left, the name in plain lettering, the line typed out
// letter by letter. A click, tap, Space or Enter finishes the line, then moves on; after the last line it
// closes. It covers the whole frame, so nothing underneath is pressed while someone is talking.
// Portraits (approved 2026-10-15): the lid sits inside the bar (art/test/lid); the yokai customers are
// waist-up busts standing up over it (art/test/yokai).
export type LidFace = "normal" | "angry" | "smug" | "surprised";
export type YokaiFace = "normal" | "happy" | "scared" | "sulky";
export type Yokai = "dokkaebi" | "gumiho" | "reaper" | "ghost";
export type HeroFace = "fine" | "tired";
export type BandalFace = "idle" | "smile" | "startled";
export type Face = LidFace | YokaiFace | HeroFace | BandalFace | "normal";
// the grandson, Bandal and Grandma's letter joined the lid and the yokai for the prologue (2026-10-19)
export type DialogueLine =
  | { who: "lid"; face: LidFace; text: string }
  | { who: Yokai; face: YokaiFace; text: string }
  | { who: "hero"; face: HeroFace; text: string }
  | { who: "bandal"; face: BandalFace; text: string }
  | { who: "letter"; face: "normal"; text: string };
type Speaker = DialogueLine["who"];

const LID_FACES: LidFace[] = ["normal", "angry", "smug", "surprised"];
const YOKAI_FACES: YokaiFace[] = ["normal", "happy", "scared", "sulky"];
const NAME: Record<Speaker, StringKey> = { lid: "kitchen.lid", dokkaebi: "who.dokkaebi", gumiho: "who.gumiho", reaper: "who.reaper", ghost: "who.ghost", hero: "who.hero", bandal: "who.bandal", letter: "who.letter" };
// the grandson's face is the stamina ring's (art/test/ui/stamina), Bandal's the kitchen's (art/test/bandal);
// the letter has no face
const portrait = (who: Speaker, face: Face) =>
  artUrl(who === "lid" ? `test/lid/${face}.png` : who === "hero" ? `test/ui/stamina/face_${face}.png` : who === "bandal" ? `test/bandal/${face}.png` : `test/yokai/${who}_${face}.png`);
const facesOf = (who: Speaker): Face[] => (who === "lid" ? LID_FACES : who === "hero" ? ["fine", "tired"] : who === "bandal" ? ["idle", "smile", "startled"] : who === "letter" ? [] : YOKAI_FACES);
const LETTER_MS = 35;

export function Dialogue({ lines, onDone }: { lines: DialogueLine[]; onDone: () => void }) {
  const [state, setState] = useState<DialogueState>(start);
  const stateRef = useRef(state);
  stateRef.current = state;
  const done = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setState((s) => tick(s, lines, 1)), LETTER_MS);
    return () => clearInterval(id);
  }, [lines]);

  function advance() {
    if (done.current) return;
    const r = press(stateRef.current, lines);
    if (r.done) {
      done.current = true;
      onDone();
    } else setState(r.state);
  }
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      advanceRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const line = lines[state.index];
  const frame = document.querySelector(".frame");
  if (!line || !frame) return null;
  const out = state.shown >= line.text.length;
  // the lid and the grandson sit in the bar; the yokai and Bandal stand over it; the letter has no face
  const bust = line.who !== "lid" && line.who !== "hero" && line.who !== "letter";
  const inBar = line.who === "lid" || line.who === "hero";
  const speakers = [...new Set(lines.map((l) => l.who))];
  return createPortal(
    <div className="dialogue" role="dialog" aria-live="polite" onPointerDown={advance}>
      {bust && <img className={`dialogue-bust ${line.who}`} src={portrait(line.who, line.face)} alt="" />}
      <div className={`dialogue-box${line.who === "letter" ? " letter" : ""}`}>
        {inBar && <img className={`dialogue-face ${line.who}`} src={portrait(line.who, line.face)} alt="" />}
        <span className={`dialogue-name ${line.who}`}>{t(NAME[line.who])}</span>
        <p className="dialogue-text">
          {line.text.slice(0, state.shown)}
          {/* the rest of the line keeps its place, so the words already out do not jump */}
          <span className="dialogue-rest">{line.text.slice(state.shown)}</span>
        </p>
        {out && <span className="dialogue-more">▼</span>}
      </div>
      {/* every face loaded up front, so a change of face does not blink */}
      <div className="dialogue-preload" aria-hidden>
        {speakers.flatMap((who) => facesOf(who).map((f) => <img key={`${who}_${f}`} src={portrait(who, f)} alt="" />))}
      </div>
    </div>,
    frame,
  );
}
