import { shiftReport, type ShiftReport, type ShiftState } from "./shift";

// The night kept per service in the device's storage (it outlives closing the game). When the game comes
// back with a night still open, that night is over (user 2026-10-27): it is settled from what was kept,
// served guests paid, and the next day starts (DayFlow). A night that was never kept settles as empty.

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
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

export function clearShift(store: Store, serviceId: string) {
  try {
    store.removeItem(key(serviceId));
  } catch {
    // nothing kept, nothing to clear
  }
}

// What the server is told for a night left open: what was kept of it, or nothing served.
export function leftNightReport(store: Store, serviceId: string): ShiftReport {
  const s = loadShift(store, serviceId);
  return s ? shiftReport(s) : { served: [], left: [], cleaned: [] };
}
