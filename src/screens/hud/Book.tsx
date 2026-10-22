import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { sfx } from "../../audio/sfx";
import { artUrl } from "../../game/art";
import { t } from "../../i18n";
import "./book.css";

// Grandma's notebook lying open (user-approved art, 2026-10-20): every window opened from the notebook sits
// on its two pages, the list on the left and the one picked on the right (Dave's way). Its tabs are
// bookmarks along the top. The buttons follow three kinds (user, 2026-10-20): the one main action is red,
// buying shows its price on a card, and closing is a ▶ line that Space, Enter or Esc presses.

// Space or Enter presses the ▶ line, Esc too (kept from everything else, so a focused button is not also
// pressed by the same key). With windows over windows (the shop over the upgrades), only the newest
// line answers.
const lines: object[] = [];
export function useLineKeys(onPress: (() => void) | null) {
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(() => {
    const me = {};
    lines.push(me);
    const on = (e: KeyboardEvent) => {
      if (!press.current || lines[lines.length - 1] !== me || (e.key !== " " && e.key !== "Enter" && e.key !== "Escape")) return;
      // a button picked with the arrows takes Space and Enter instead (useRowKeys); Esc still closes
      if (e.key !== "Escape" && document.querySelector("[data-picked]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "keydown" && !e.repeat) sfx.play("uiClick"), press.current();
    };
    addEventListener("keydown", on, true);
    addEventListener("keyup", on, true);
    return () => {
      lines.splice(lines.indexOf(me), 1);
      removeEventListener("keydown", on, true);
      removeEventListener("keyup", on, true);
    };
  }, []);
}

// The buttons under the book (close, rest, open) by keyboard (user, 2026-10-21): ← → move the ▶ along
// the row, skipping the greyed ones, and Space or Enter presses the one picked. A click anywhere drops the
// pick, so Space goes back to the close line. Only the newest book answers.
const rows: object[] = [];
export function useRowKeys(row: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const me = {};
    rows.push(me);
    const picked = () => row.current?.querySelector<HTMLButtonElement>("[data-picked]") ?? null;
    const drop = () => row.current?.querySelectorAll<HTMLElement>("[data-picked]").forEach((b) => delete b.dataset.picked);
    const on = (e: KeyboardEvent) => {
      if (rows[rows.length - 1] !== me || !row.current) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type !== "keydown") return;
        const all = [...row.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        if (all.length === 0) return;
        const from = all.indexOf(picked() ?? row.current.querySelector<HTMLButtonElement>(".marked") ?? all[0]);
        const to = all[Math.max(0, Math.min(all.length - 1, from + (e.key === "ArrowLeft" ? -1 : 1)))];
        drop();
        to.dataset.picked = "";
        to.focus();
        sfx.play("uiClick");
      } else if ((e.key === " " || e.key === "Enter") && picked()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === "keydown" && !e.repeat) picked()!.click();
      }
    };
    addEventListener("keydown", on, true);
    addEventListener("keyup", on, true);
    addEventListener("pointerdown", drop, true);
    return () => {
      rows.splice(rows.indexOf(me), 1);
      removeEventListener("keydown", on, true);
      removeEventListener("keyup", on, true);
      removeEventListener("pointerdown", drop, true);
    };
  }, [row]);
}

// The ▶ line: close, carry on, next day. `keys`: this one answers Space/Enter/Esc (one per screen).
// The notebook's red ! (alerts.ts), beside the thing inside an app it is about (user, 2026-10-22).
export const NewMark = () => <span className="notebook-new">!</span>;

export function MenuLine({ label, onPress, keys = true, className = "" }: { label: string; onPress: () => void; keys?: boolean; className?: string }) {
  useLineKeys(keys ? onPress : null);
  return (
    <button className={`menu-item marked ${className}`} onClick={() => (sfx.play("uiClick"), onPress())}>
      {label}
    </button>
  );
}

// What buying costs, on a card: the coin or the golden charcoal and the number, red where it is short.
export function Price({ gold = 0, charcoal = 0, haveGold, haveCharcoal }: { gold?: number; charcoal?: number; haveGold: number; haveCharcoal: number }) {
  return (
    <span className="price">
      {gold > 0 && (
        <span className={haveGold < gold ? "short" : ""}>
          <img src={artUrl("test/ui/icon_gold.png")} alt="" />
          {gold.toLocaleString()}
        </span>
      )}
      {charcoal > 0 && (
        <span className={haveCharcoal < charcoal ? "short" : ""}>
          <img src={artUrl("test/ui/icon_golden_charcoal.png")} alt="" />
          {charcoal.toLocaleString()}
        </span>
      )}
    </span>
  );
}

// `gold`: it spends gold (the coins' sound as it buys)
export function BuyCard({ children, disabled, onClick, gold = false }: { children: ReactNode; disabled?: boolean; onClick: () => void; gold?: boolean }) {
  return (
    <button className="ui-box buy-card" disabled={disabled} onClick={() => (gold && sfx.play("goldSpent"), onClick())}>
      {children}
    </button>
  );
}

// `foot`: more under the book beside the close line (the kitchen's rest and open buttons); without
// `onClose` there is no close line (the evening kitchen with no shop to walk back to).
export function BookWindow({ tabs, left, right, onClose, label, foot }: { tabs?: ReactNode; left: ReactNode; right: ReactNode; onClose?: () => void; label: string; foot?: ReactNode }) {
  // the notebook's pages turning open
  useEffect(() => sfx.play("bookOpen"), []);
  const row = useRef<HTMLDivElement>(null);
  useRowKeys(row);
  return (
    <div className="dayflow-screen book-screen" onClickCapture={(e) => (e.target as HTMLElement).closest(".book-row, .ui-tab, .awaken-kind") && sfx.play("uiClick")}>
      <div className="book" style={{ backgroundImage: `url(${artUrl("test/ui/book.png")})` }} role="dialog" aria-label={label}>
        {tabs && <div className="book-tabs">{tabs}</div>}
        <div className="book-page left">{left}</div>
        <div className="book-page right">{right}</div>
        <div className="book-close" ref={row}>
          {onClose && <MenuLine label={t("upgrade.close")} onPress={onClose} />}
          {foot}
        </div>
      </div>
    </div>
  );
}
