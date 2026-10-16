import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import { canUse3D } from "../shop3d/input";
import { ShopStage } from "../shop3d/ShopStage";
import { ServiceScene } from "./ServiceScene";
import { SHOP_HEIGHT, SHOP_WIDTH, type ServiceData, type ShopReport } from "./types";

// The night service in a page: the 3D shop (shop 3D design) where WebGL works, else the 2D Phaser one
// (also with ?shop2d, and if the 3D one fails to load). Either reports the night to onEnd (each served
// guest's dish, wait and pour; who left; the leftovers cleared).
export function ServiceGame({ shop, onEnd }: { shop: ServiceData; onEnd: (r: ShopReport) => void }) {
  const [threeD, setThreeD] = useState(() => canUse3D(() => document.createElement("canvas"), location.search));
  return threeD ? <ShopStage shop={shop} onEnd={onEnd} onFail={() => setThreeD(false)} /> : <Service2D shop={shop} onEnd={onEnd} />;
}

function Service2D({ shop, onEnd }: { shop: ServiceData; onEnd: (r: ShopReport) => void }) {
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
    g.events.on("service:end", (r: ShopReport) => onEndRef.current(r));
    return () => g.destroy(true);
  }, []);

  return <div ref={host} className="service-stage" />;
}
