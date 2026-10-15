import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { CookStage, type CookPlate } from "./CookStage";

// The cooking stage inside a page (the research kitchen; the night service in 05b). One Phaser game per
// mount (StrictMode mounts twice in dev; the first is destroyed on cleanup). `round` changes start a new
// try with the fridge as `items` says.
export function CookStageGame({
  items,
  quality,
  round,
  onPlate,
}: {
  items: Record<string, number>;
  quality: { grill: number; boil: number };
  round: number;
  onPlate: (p: CookPlate) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const onPlateRef = useRef(onPlate);
  onPlateRef.current = onPlate;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  useEffect(() => {
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      pixelArt: true,
      backgroundColor: "#2b211c",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    g.scene.add("cook", CookStage, true, { items: itemsRef.current, quality: qualityRef.current });
    g.events.on("cook:plate", (p: CookPlate) => onPlateRef.current(p));
    game.current = g;
    return () => {
      g.destroy(true);
      game.current = null;
    };
  }, []);

  useEffect(() => {
    if (round === 0) return;
    game.current?.scene.getScene("cook")?.scene.restart({ items: itemsRef.current, quality: qualityRef.current });
  }, [round]);

  return <div ref={host} className="cook-stage" />;
}
