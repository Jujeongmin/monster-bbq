import { useEffect, useState } from "react";
import { RARITIES, STAFF, type StaffId } from "../../../shared/content/staff";
import { sfx } from "../../audio/sfx";
import { artUrl } from "../../game/art";
import { t, type StringKey } from "../../i18n";
import { MenuLine } from "./Book";

// Who came for the postcards (postcard reveal B, user, 2026-10-21): the shop's front door big on the
// screen, a knock (the door shakes), then it slides open onto the evening light and the friend stands in
// the doorway in their rarity's light, with their name, rarity and "new friend" or the shards. Space (the
// ▶ line) brings the next; the best comes last. Several at once can skip to the summary. Door art:
// art/test/visit/door_{closed,open}.png (512x288, approved 2026-10-21).
export interface Visitor {
  id: StaffId;
  isNew: boolean;
  shards: number;
}

// a rarer one knocks longer
const KNOCK_MS = { common: 700, rare: 900, hero: 1200, legend: 1600 } as const;

export function Visit({ visitors, onDone }: { visitors: Visitor[]; onDone: () => void }) {
  const order = [...visitors].sort((a, b) => RARITIES.indexOf(STAFF[a.id].rarity) - RARITIES.indexOf(STAFF[b.id].rarity));
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const v = order[i];
  const rarity = v ? STAFF[v.id].rarity : "common";
  useEffect(() => {
    setOpen(false);
    const id = setTimeout(() => setOpen(true), KNOCK_MS[rarity]);
    return () => clearTimeout(id);
  }, [i]);
  // the door opening: a new friend's own sound, else the postcard's
  useEffect(() => {
    if (open && v) sfx.play(v.isNew ? "newFriend" : "postcard");
  }, [open]);
  if (!v) return null;
  const last = i + 1 >= order.length;
  const next = () => (open ? (last ? onDone() : setI(i + 1)) : setOpen(true));
  return (
    <div className={`visit ${rarity}`} onClick={next}>
      <div className={`visit-stage${open ? " open" : " knock"}`} key={`${i}:${open}`}>
        <img className="visit-door" src={artUrl(`test/visit/door_${open ? "open" : "closed"}.png`)} alt="" />
        {open && <img className="visit-friend" src={artUrl(`test/staff/${v.id}/portrait.png`)} alt="" />}
      </div>
      {open && (
        <div className="visit-card ui-plate" key={v.id}>
          <b className="visit-name">{t(`staff.name.${v.id}` as StringKey)}</b>
          <span className="visit-rarity">{t(`staff.rarity.${rarity}` as StringKey)}</span>
          <span className={v.isNew ? "visit-new" : "visit-shards"}>{v.isNew ? t("friends.new") : t("friends.shards", { n: v.shards })}</span>
        </div>
      )}
      <div className="visit-lines" onClick={(e) => e.stopPropagation()}>
        <MenuLine label={open ? t(last ? "friends.visitDone" : "friends.visitNext") : t("friends.visitOpen")} onPress={next} />
        {!last && order.length > 2 && (
          <button className="menu-item" onClick={onDone}>
            {t("friends.visitSkip")}
          </button>
        )}
      </div>
    </div>
  );
}
