// The hunting bag: item key -> count, limited to a number of items in total (BALANCE.hunt.bagSlots).
export function bagCount(bag: Record<string, number>): number {
  return Object.values(bag).reduce((a, b) => a + b, 0);
}

export function addToBag(bag: Record<string, number>, key: string, slots: number): { bag: Record<string, number>; added: boolean } {
  if (bagCount(bag) >= slots) return { bag, added: false };
  return { bag: { ...bag, [key]: (bag[key] ?? 0) + 1 }, added: true };
}
