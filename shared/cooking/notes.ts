// What a plate says about how it was cooked (the "skill line" under a result, cooking-service design 3).
export type NoteId =
  | "perfect"
  | "onceFlip"
  | "manyFlips"
  | "raw"
  | "burnt"
  | "stuck"
  | "soot"
  | "cutEarly"
  | "uncut"
  | "fatFried"
  | "clear"
  | "foamy"
  | "boilOver"
  | "mushy"
  | "undercooked";

export interface CookJudgement {
  accuracy: number;
  notes: NoteId[];
}
