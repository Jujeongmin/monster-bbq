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
  | "undercooked"
  | "insideRaw"
  | "rested"
  | "saltFirst"
  | "salty";

export interface CookJudgement {
  accuracy: number;
  notes: NoteId[];
}

// Worst first: the one a cook would hear about.
const FLAWS: NoteId[] = ["burnt", "raw", "undercooked", "insideRaw", "salty", "stuck", "boilOver", "soot", "foamy", "mushy", "cutEarly", "manyFlips", "uncut"];
// Best first.
const PRAISE: NoteId[] = ["perfect", "rested", "saltFirst", "clear", "fatFried", "onceFlip"];

// A whole plate: the pieces' average accuracy and the one note worth saying (the worst mistake, or
// failing that the best praise).
export function plateResult(results: CookJudgement[]): { accuracy: number; note: NoteId | null } {
  if (results.length === 0) return { accuracy: 0, note: null };
  const accuracy = results.reduce((a, r) => a + r.accuracy, 0) / results.length;
  const all = new Set(results.flatMap((r) => r.notes));
  const note = FLAWS.find((n) => all.has(n)) ?? PRAISE.find((n) => all.has(n)) ?? null;
  return { accuracy, note };
}
