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
export type Face = LidFace | YokaiFace;
export type DialogueLine = { who: "lid"; face: LidFace; text: string } | { who: Yokai; face: YokaiFace; text: string };
type Speaker = DialogueLine["who"];

const LID_FACES: LidFace[] = ["normal", "angry", "smug", "surprised"];
const YOKAI_FACES: YokaiFace[] = ["normal", "happy", "scared", "sulky"];
const NAME: Record<Speaker, StringKey> = { lid: "kitchen.lid", dokkaebi: "who.dokkaebi", gumiho: "who.gumiho", reaper: "who.reaper", ghost: "who.ghost" };
const portrait = (who: Speaker, face: Face) => artUrl(who === "lid" ? `test/lid/${face}.png` : `test/yokai/${who}_${face}.png`);
const facesOf = (who: Speaker): Face[] => (who === "lid" ? LID_FACES : YOKAI_FACES);
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
  const bust = line.who !== "lid";
  const speakers = [...new Set(lines.map((l) => l.who))];
  return createPortal(
    <div className="dialogue" role="dialog" aria-live="polite" onPointerDown={advance}>
      {bust && <img className="dialogue-bust" src={portrait(line.who, line.face)} alt="" />}
      <div className="dialogue-box">
        {!bust && <img className="dialogue-face" src={portrait(line.who, line.face)} alt="" />}
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
