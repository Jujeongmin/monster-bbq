// The dialogue box's progress, kept pure so it can be tested without a page: which line is up and how
// many of its letters are out. A press finishes a line that is still typing, then moves on.
export interface DialogueState {
  index: number;
  shown: number;
}

export const start = (): DialogueState => ({ index: 0, shown: 0 });

const lengthOf = (lines: { text: string }[], i: number) => lines[i]?.text.length ?? 0;

export function tick(s: DialogueState, lines: { text: string }[], letters: number): DialogueState {
  return { ...s, shown: Math.min(lengthOf(lines, s.index), s.shown + letters) };
}

export function press(s: DialogueState, lines: { text: string }[]): { state: DialogueState; done: boolean } {
  const len = lengthOf(lines, s.index);
  if (s.shown < len) return { state: { ...s, shown: len }, done: false };
  if (s.index + 1 < lines.length) return { state: { index: s.index + 1, shown: 0 }, done: false };
  return { state: s, done: true };
}
