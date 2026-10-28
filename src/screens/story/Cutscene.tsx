import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { StoryId } from "../../../shared/content/story";
import { artUrl, hasArt } from "../../game/art";
import { loadImage } from "../../preload";
import { t } from "../../i18n";
import { Dialogue, type DialogueLine } from "../dialogue/Dialogue";
import { sceneArt, SCENES, type Cut } from "./story";
import "./story.css";

// A story scene cut by cut (design 6): each cut's picture with its lines in the dialogue bar; a cut with
// no lines waits for a tap. "Skip" ends the scene at once. Until a cut's own picture is drawn and approved
// (art/test/story/<pic>.png) it stands in with approved art: the shop, the lid, Bandal, the grandson with
// the lid on his back, the yokai at the door.
export function Cutscene({ scene, onDone }: { scene: StoryId; onDone: () => void }) {
  const cuts = SCENES[scene];
  // the scene's own pictures first (they are not on the loading screen): a short wait, never a picture
  // popping in mid-cut; one that fails to load stands in as before
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all(sceneArt(cuts).filter(hasArt).map((p) => loadImage(artUrl(p)).catch(() => {}))).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [cuts]);
  const [i, setI] = useState(0);
  const cut = cuts[i];
  const next = () => (i + 1 < cuts.length ? setI(i + 1) : onDone());
  const lines = useMemo(() => cut?.lines.map((l) => ({ who: l.who, face: l.face, text: t(l.key) }) as DialogueLine), [cut]);
  // a cut with no lines: a tap, Space or Enter moves on
  useEffect(() => {
    if (!ready || !cut || cut.lines.length) return;
    const on = (e: KeyboardEvent) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), next());
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });
  if (!cut) return null;
  if (!ready) return <div className="story dayflow-wait">…</div>;
  return (
    <div className="story" onPointerDown={cut.lines.length ? undefined : next}>
      <Picture key={i} cut={cut} />
      {cut.caption && (
        <p key={`cap-${i}`} className="story-caption">
          {t(cut.caption)}
        </p>
      )}
      {/* over the dialogue bar's cover (it takes every tap on the frame), so on the frame itself */}
      {document.querySelector(".frame") &&
        createPortal(
          <button className="ui-sq story-skip" onPointerDown={(e) => (e.stopPropagation(), onDone())}>
            {t("story.skip")}
          </button>,
          document.querySelector(".frame")!,
        )}
      {cut.lines.length ? <Dialogue key={`lines-${i}`} lines={lines!} onDone={next} /> : <span className="story-more">▼</span>}
    </div>
  );
}

function Picture({ cut }: { cut: Cut }) {
  const own = `test/story/${cut.pic}.png`;
  if (hasArt(own)) return <img className="story-pic own" src={artUrl(own)} alt="" />;
  const shop = <img className="story-bg" src={artUrl("test/shop/bg.png")} alt="" />;
  switch (cut.pic) {
    case "phone":
      // the job answers coming in, one after another
      return (
        <div className="story-pic phone">
          {Array.from({ length: 7 }, (_, n) => (
            <div key={n} className="ui-bubble story-note" style={{ animationDelay: `${n * 0.18}s` }}>
              {t("story.phone")}
            </div>
          ))}
        </div>
      );
    case "lid0":
    case "lid1":
      // the lid still under the dust (its own pictures replace this once approved)
      return (
        <div className="story-pic dusty">
          {shop}
          <img className="story-lid still" src={artUrl("test/lid/normal.png")} alt="" />
        </div>
      );
    case "parcel":
      return (
        <div className="story-pic dark">
          <img className="story-parcel" src={artUrl("test/shop/products/starter_pack.png")} alt="" />
        </div>
      );
    case "shop":
      return <div className="story-pic dusty">{shop}</div>;
    case "lid":
      return (
        <div className="story-pic dim">
          {shop}
          <img className="story-lid" src={artUrl("test/lid/angry.png")} alt="" />
        </div>
      );
    case "bandal":
      return (
        <div className="story-pic dim">
          {shop}
          <img className="story-bandal" src={artUrl("test/bandal/idle.png")} alt="" />
        </div>
      );
    case "lidback":
      return (
        <div className="story-pic dim">
          {shop}
          <img className="story-hero" src={artUrl("test/hunter/side_1.png")} alt="" />
        </div>
      );
    case "dusk":
      return (
        <div className="story-pic dusk">
          {shop}
          {(["dokkaebi", "gumiho", "ghost"] as const).map((y, n) => (
            <img key={y} className="story-yokai" style={{ left: `${6 + n * 9}%`, animationDelay: `${n * 0.3}s` }} src={artUrl(`test/yokai/counter/${y}_walk_0.png`)} alt="" />
          ))}
        </div>
      );
  }
}
