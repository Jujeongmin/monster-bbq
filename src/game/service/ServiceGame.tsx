import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { SHOP_HEIGHT, SHOP_WIDTH, ServiceScene, type ServedReport, type ServiceData } from "./ServiceScene";

// The night service in a page: one Phaser game per mount. "service:end" reaches onEnd with the night's
// report (each served guest's dish, wait and pour; who left).
export function ServiceGame({ shop, onEnd }: { shop: ServiceData; onEnd: (r: { served: ServedReport[]; left: string[]; cleaned: string[] }) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const start = useRef(shop);

  useEffect(() => {
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: SHOP_WIDTH,
      height: SHOP_HEIGHT,
      pixelArt: true,
      backgroundColor: "#2b211c",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    g.scene.add("shop", ServiceScene, true, start.current);
    g.events.on("service:end", (r: { served: ServedReport[]; left: string[]; cleaned: string[] }) => onEndRef.current(r));
    return () => g.destroy(true);
  }, []);

  return <div ref={host} className="service-stage" />;
}
