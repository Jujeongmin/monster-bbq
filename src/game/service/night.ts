import type { ShiftState } from "./shift";

// The night kept per service in the page's session storage, so a reload mid-night picks up where it
// was (the ingredients were taken when the shop opened) instead of losing the night.

type Store = Pick<Storage, "getItem" | "setItem">;
const key = (serviceId: string) => `monster-bbq:service:${serviceId}:shift`;

export function saveShift(store: Store, serviceId: string, s: ShiftState) {
  try {
    store.setItem(key(serviceId), JSON.stringify(s));
  } catch {
    // private mode: a reload starts the night over, nothing worse
  }
}

export function loadShift(store: Store, serviceId: string): ShiftState | undefined {
  try {
    const raw = JSON.parse(store.getItem(key(serviceId)) ?? "null") as Partial<ShiftState> | null;
    const ok = !!raw && typeof raw === "object" && typeof raw.clock === "number" && Array.isArray(raw.guests) && Array.isArray(raw.seats) && Array.isArray(raw.tray) && Array.isArray(raw.kitchen) && Array.isArray(raw.pass);
    return ok ? (raw as ShiftState) : undefined;
  } catch {
    return undefined;
  }
}
