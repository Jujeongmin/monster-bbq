import { artUrl } from "../../game/art";
import type { LidFace } from "../dialogue/Dialogue";

// The lid's one line at the top of the screen (shop remake step 3): its approved portrait, cropped to the
// lid itself at one pixel each, and a short line, sliding in and out. The game does not wait for it.
// `low` puts it at the bottom, over a window whose top it would hide.
export function LidLine({ face, text, low }: { face: LidFace; text: string; low?: boolean }) {
  return (
    <div className={`ui-plate lid-line${low ? " low" : ""}`} role="status">
      <span className="lid-line-face">
        <img src={artUrl(`test/lid/${face}.png`)} alt="" />
      </span>
      <span>{text}</span>
    </div>
  );
}
