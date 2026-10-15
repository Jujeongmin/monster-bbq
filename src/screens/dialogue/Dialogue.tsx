import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { artUrl } from "../../game/art";
import { t } from "../../i18n";
import { press, start, tick, type DialogueState } from "./dialogueState";
import "./dialogue.css";

// The NPC dialogue box (like talking to an NPC in an MMORPG): the speaker's portrait at the left, a name
// ribbon, the line typed out letter by letter. A click, tap, Space or Enter finishes the line, then
// moves on; after the last line it closes. It covers the whole frame, so nothing underneath is pressed
// while someone is talking. Portraits: art/test/lid (approved 2026-10-15).
export type Face = "normal" | "angry" | "smug" | "surprised";
export interface DialogueLine {
  who: "lid";
  face: Face;
  text: string;
}

const FACES: Face[] = ["normal", "angry", "smug", "surprised"];
const NAME = { lid: "kitchen.lid" } as const;
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
  return createPortal(
    <div className="dialogue" role="dialog" aria-live="polite" onPointerDown={advance}>
      <div className="dialogue-box ui-panel">
        <img className="dialogue-face" src={artUrl(`test/lid/${line.face}.png`)} alt="" />
        <span className="dialogue-name">{t(NAME[line.who])}</span>
        <p className="dialogue-text">
          {line.text.slice(0, state.shown)}
          {/* the rest of the line keeps its place, so the words already out do not jump */}
          <span className="dialogue-rest">{line.text.slice(state.shown)}</span>
        </p>
        {out && <span className="dialogue-more">▼</span>}
      </div>
      {/* every face loaded up front, so a change of face does not blink */}
      <div className="dialogue-preload" aria-hidden>
        {FACES.map((f) => (
          <img key={f} src={artUrl(`test/lid/${f}.png`)} alt="" />
        ))}
      </div>
    </div>,
    frame,
  );
}
