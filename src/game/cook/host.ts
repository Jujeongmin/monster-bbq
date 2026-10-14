import type { CookJudgement } from "../../../shared/cooking/notes";

// What a cooking station needs from the stage around it.
export interface CookHost {
  // what the hand holds: tongs (move, flip), scissors (cut by dragging across), salt (tap or shake over
  // meat), ladle (skim, serve soup)
  tool: "tongs" | "scissors" | "salt" | "ladle";
  overPlate(x: number, y: number): boolean;
  // puts finished food on the serving plate, all of it or none (false, with a message, if the plate
  // cannot take it); `from` is the station's method, a plate holds one station's food
  tryPlate(entries: { key: string; judgement: CookJudgement }[], from: "grill" | "boil"): boolean;
  say(text: string, x: number, y: number, color?: string): void;
}

export interface Station {
  readonly method: "grill" | "boil";
  setVisible(on: boolean): void;
  update(dt: number): void;
  // an ingredient dragged from the tray and let go at (x, y); true if the station took it
  dropFromTray(key: string, x: number, y: number): boolean;
  // keys of items currently in the station (still counted out of the tray)
  keysInUse(): string[];
}
