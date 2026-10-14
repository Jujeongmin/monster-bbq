import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { DishId } from "../../../shared/content/dishes";
import type { ItemId } from "../../../shared/content/items";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { CookStage } from "../cook/CookStage";
import { ServiceScene, type ServedReport, type ServiceData } from "./ServiceScene";

// The night service in a page: the shop scene in front, the cooking stage (service mode) running behind
// it. One Phaser game per mount. "service:end" reaches onEnd with what was served and who left.
export function ServiceGame({
  shop,
  items,
  menu,
  onEnd,
}: {
  shop: ServiceData;
  items: Record<string, number>;
  menu: { dish: DishId; items: ItemId[] }[];
  onEnd: (r: { served: ServedReport[]; left: string[] }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const start = useRef({ shop, items, menu });

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
    // the stage cooks behind the shop: running, hidden, not taking input until an order opens it. The
    // shop starts once the stage has loaded the pictures both use.
    g.events.once("cook:ready", () => {
      const cook = g.scene.getScene("cook");
      cook.scene.setVisible(false);
      cook.input.enabled = false;
      g.scene.add("shop", ServiceScene, true, start.current.shop);
    });
    g.scene.add("cook", CookStage, true, { items: start.current.items, mode: "service", menu: start.current.menu });
    g.events.on("service:end", (r: { served: ServedReport[]; left: string[] }) => onEndRef.current(r));
    return () => g.destroy(true);
  }, []);

  return <div ref={host} className="service-stage" />;
}
