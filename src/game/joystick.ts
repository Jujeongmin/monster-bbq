import type { Vec } from "../../shared/hunt/types";

// On-screen stick: thumb offset from the base -> -1..1 vector. Inside `deadZone` (fraction of the
// radius) it is still; past it the push is distance / radius, capped at the rim.
export function joystickVector(base: Vec, thumb: Vec, radius: number, deadZone: number): Vec {
  const dx = thumb.x - base.x;
  const dy = thumb.y - base.y;
  const len = Math.hypot(dx, dy);
  const dead = radius * deadZone;
  if (len <= dead) return { x: 0, y: 0 };
  const push = Math.min(1, len / radius);
  return { x: (dx / len) * push, y: (dy / len) * push };
}
