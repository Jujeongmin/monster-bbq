import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import { holdLoop } from "../holdLoop";
import { canUse3D } from "../shop3d/input";
import { ShopStage, type AddMenuHook } from "../shop3d/ShopStage";
import { AddMenu } from "../../screens/kitchen/AddMenu";
import { t } from "../../i18n";
import type { DishId } from "../../../shared/content/dishes";
import { ServiceScene } from "./ServiceScene";
import { SHOP_HEIGHT, SHOP_WIDTH, type ServiceData, type ShopReport } from "./types";

// The night service in a page: the 3D shop (shop 3D design) where WebGL works, else the 2D Phaser one
// (also with ?shop2d, and if the 3D one fails to load). Either reports the night to onEnd (each served
// guest's dish, wait and pour; who left; the leftovers cleared).
export function ServiceGame({ shop, hold = false, addMenu, onEnd }: { shop: ServiceData; hold?: boolean; addMenu?: AddMenuHook; onEnd: (r: ShopReport) => void }) {
  const [threeD, setThreeD] = useState(() => canUse3D(() => document.createElement("canvas"), location.search));
  return threeD ? <ShopStage shop={shop} hold={hold} addMenu={addMenu} onEnd={onEnd} onFail={() => setThreeD(false)} /> : <Service2D shop={shop} hold={hold} addMenu={addMenu} onEnd={onEnd} />;
}

// The 2D shop's menu board opens from a button over the game (its action key is the scene's); the scene
// waits while it is open and takes the added plates through the game's events.
function Service2D({ shop, hold, addMenu, onEnd }: { shop: ServiceData; hold: boolean; addMenu?: AddMenuHook; onEnd: (r: ShopReport) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const made = useRef(new Map(shop.dishes.map((d) => [d.dish, d.plates])));
  const add = async (dish: DishId, sets: number) => {
    if (!addMenu) return;
    setMenuBusy(true);
    setMenuError(null);
    const r = await addMenu.send(dish, sets);
    setMenuBusy(false);
    if ("error" in r) return setMenuError(r.error === "no_ingredients" || r.error === "no_slot" ? t(`error.${r.error}`) : t("error.retry"));
    for (const d of r.dishes) {
      const extra = d.plates - (made.current.get(d.dish) ?? 0);
      if (extra > 0) game.current?.events.emit("service:addPlates", d.dish, extra, d.price);
      made.current.set(d.dish, d.plates);
    }
    setMenuOpen(false);
  };
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const holdRef = useRef(hold);
  holdRef.current = hold || menuOpen;
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
    game.current = g;
    return () => g.destroy(true);
  }, []);
  useEffect(() => holdLoop(game.current, hold || menuOpen, holdRef), [hold, menuOpen]);
  useEffect(() => void game.current?.events.emit("service:waitForMenu", (addMenu?.options.length ?? 0) > 0), [addMenu?.options.length]);

  return (
    <>
      <div ref={host} className="service-stage" />
      {addMenu && (
        <button className="ui-btn service-add-menu" onClick={() => (setMenuError(null), setMenuOpen(true))}>
          {t("prompt.menu")}
        </button>
      )}
      {menuOpen && addMenu && <AddMenu options={addMenu.options} slots={addMenu.slots} busy={menuBusy} error={menuError} onAdd={add} onClose={() => !menuBusy && setMenuOpen(false)} />}
    </>
  );
}
