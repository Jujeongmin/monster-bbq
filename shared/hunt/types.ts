// A point on the hunting ground in world pixels: x to the right, y down (bigger y = nearer the viewer).
export interface Vec {
  x: number;
  y: number;
}

// The walkable band of the ground. y is where the feet are.
export interface Field {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
