import type { CookJudgement } from "../../../shared/cooking/notes";

// What a cooking station needs from the stage around it.
export interface CookHost {
  // what the hand holds: tongs (move, flip) or scissors (cut by dragging across)
  tool: "tongs" | "scissors";
  overPlate(x: number, y: number): boolean;
  // puts a finished piece on the serving plate; false (and a message) if the plate cannot take it
  tryPlate(key: string, judgement: CookJudgement): boolean;
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
