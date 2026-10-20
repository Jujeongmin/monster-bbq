import type { PendingService } from "../../../shared/save";
import { BALANCE } from "../../../shared/balance";
import type { TonightDish } from "../../../shared/kitchen/dish";
import type { Customer } from "../../../shared/service/plan";
import type { ServedEntry } from "../../../shared/service/settle";

// What the night shop needs to start and what it reports at the end, shared by the 3D shop (shop3d/) and
// the 2D one kept for devices without WebGL (ServiceScene).
export interface ServiceData {
  serviceId: string;
  customers: Customer[];
  dishes: TonightDish[];
  stools: number;
  walkMul: number;
  coalPerDish: number;
  // tonight's friends as the shop opened (staff design 5)
  staff?: PendingService["staff"];
}

export type ServedReport = ServedEntry;
export type ShopReport = { served: ServedReport[]; left: string[]; cleaned: string[] };

export const SHOP_WIDTH = 960;
export const SHOP_HEIGHT = 540;

// The shop clock: 18:00 when the doors open, 22:00 at closing time, in ten-minute steps.
export function clockText(ms: number): string {
  const minutes = Math.min(240, Math.floor((ms / BALANCE.service.openMs) * 24) * 10);
  return `${18 + Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
