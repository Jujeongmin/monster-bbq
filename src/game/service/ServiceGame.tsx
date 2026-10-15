import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { ServiceScene, type ServedReport, type ServiceData } from "./ServiceScene";

// The night service in a page: one Phaser game per mount. "service:end" reaches onEnd with what was
// served and who left.
export function ServiceGame({ shop, onEnd }: { shop: ServiceData; onEnd: (r: { served: ServedReport[]; left: string[] }) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const start = useRef(shop);

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
    g.scene.add("shop", ServiceScene, true, start.current);
    g.events.on("service:end", (r: { served: ServedReport[]; left: string[] }) => onEndRef.current(r));
    return () => g.destroy(true);
  }, []);

  return <div ref={host} className="service-stage" />;
}
