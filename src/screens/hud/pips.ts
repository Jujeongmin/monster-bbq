// A friend's stat as cells that fill one at a time (user, 2026-10-20): ten cells of 30 points, so a legend
// near ten stars fills them (stats grow x1.1 a star from at most 120); any stat shows at least one.
export const PIP_COUNT = 10;
const PIP_POINTS = 30;
export const pipsOf = (value: number): number => (value <= 0 ? 0 : Math.max(1, Math.min(PIP_COUNT, Math.round(value / PIP_POINTS))));
