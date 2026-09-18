import { AirfoilGeometry, Panel, Point2D } from '../types/aerodynamics';

export const DEFAULT_PIVOT = { x: 0.25, y: 0 };

/** Rotate a point from body coordinates into tunnel/world coordinates about the quarter-chord pivot. */
export function rotatePointAboutPivot(
  point: Point2D,
  angleRad: number,
  pivot: Point2D = DEFAULT_PIVOT
): Point2D {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);

  return {
    x: pivot.x + dx * c - dy * s,
    y: pivot.y + dx * s + dy * c,
  };
}

/** Rotate a vector without translation. */
export function rotateVector(vector: Point2D, angleRad: number): Point2D {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: vector.x * c - vector.y * s,
    y: vector.x * s + vector.y * c,
  };
}

export function worldToBodyPoint(
  point: Point2D,
  angleRad: number,
  pivot: Point2D = DEFAULT_PIVOT
): Point2D {
  return rotatePointAboutPivot(point, -angleRad, pivot);
}

export function bodyToWorldPoint(
  point: Point2D,
  angleRad: number,
  pivot: Point2D = DEFAULT_PIVOT
): Point2D {
  return rotatePointAboutPivot(point, angleRad, pivot);
}

export function airfoilToWorldPoints(points: Point2D[], angleRad: number): Point2D[] {
  return points.map((point) => bodyToWorldPoint(point, angleRad));
}

export function panelsToWorld(panels: Panel[], angleRad: number): Panel[] {
  return panels.map((panel) => {
    const p1 = bodyToWorldPoint({ x: panel.x1, y: panel.y1 }, angleRad);
    const p2 = bodyToWorldPoint({ x: panel.x2, y: panel.y2 }, angleRad);
    const c = bodyToWorldPoint({ x: panel.xc, y: panel.yc }, angleRad);
    const t = rotateVector({ x: panel.tx, y: panel.ty }, angleRad);
    const n = rotateVector({ x: panel.nx, y: panel.ny }, angleRad);
    return {
      ...panel,
      x1: p1.x, y1: p1.y,
      x2: p2.x, y2: p2.y,
      xc: c.x, yc: c.y,
      theta: panel.theta + angleRad,
      tx: t.x, ty: t.y,
      nx: n.x, ny: n.y,
    };
  });
}

export function angleDegToRad(angleDeg: number): number {
  return (angleDeg * Math.PI) / 180;
}

export function formatAnglePair(angleDeg: number): { deg: string; rad: string } {
  const sign = angleDeg >= 0 ? '+' : '';
  return {
    deg: `${sign}${angleDeg.toFixed(3)}°`,
    rad: `${angleDegToRad(angleDeg).toFixed(7)} rad`,
  };
}
