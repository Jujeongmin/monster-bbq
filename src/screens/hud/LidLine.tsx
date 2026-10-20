import { artUrl } from "../../game/art";
import type { LidFace } from "../dialogue/Dialogue";

// The lid's one line at the top of the screen (shop remake step 3): its approved portrait, cropped to the
// lid itself at one pixel each, and a short line, sliding in and out. The game does not wait for it.
export function LidLine({ face, text }: { face: LidFace; text: string }) {
  return (
    <div className="ui-plate lid-line" role="status">
      <span className="lid-line-face">
        <img src={artUrl(`test/lid/${face}.png`)} alt="" />
      </span>
      <span>{text}</span>
    </div>
  );
}
