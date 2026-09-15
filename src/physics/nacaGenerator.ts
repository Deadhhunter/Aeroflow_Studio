import { Point2D, Panel, AirfoilGeometry } from '../types/aerodynamics';

/**
 * Generate NACA 4-digit airfoil coordinates and panel geometry
 * @param code 4-digit string, e.g. "2412", "0012", "4415"
 * @param numPanels Number of surface panels (typically 60 to 120)
 * @param flapAngleDeg Trailing-edge flap deflection angle in degrees (positive downward)
 * @param flapHingeX Flap hinge position along chord (0.0 to 1.0, e.g. 0.75 for 75% chord)
 */
export function generateNaca4(
  codeOrParams: string | { m: number; p: number; t: number; name?: string },
  numPanels: number = 80,
  flapAngleDeg: number = 0,
  flapHingeX: number = 0.75
): { geometry: AirfoilGeometry; panels: Panel[] } {
  let m = 0.02;
  let p = 0.4;
  let t = 0.12;
  let name = 'NACA 2412';

  if (typeof codeOrParams === 'string') {
    const cleanCode = codeOrParams.padStart(4, '0').slice(-4);
    m = parseInt(cleanCode[0], 10) / 100;
    p = parseInt(cleanCode[1], 10) / 10;
    t = parseInt(cleanCode.slice(2, 4), 10) / 100;
    name = `NACA ${cleanCode}`;
  } else {
    m = Math.max(0, Math.min(0.095, codeOrParams.m));
    p = Math.max(0.05, Math.min(0.9, codeOrParams.p));
    t = Math.max(0.02, Math.min(0.35, codeOrParams.t));
    name =
      codeOrParams.name ??
      `NACA ${(m * 100).toFixed(1)}/${(p * 10).toFixed(1)}/${(t * 100).toFixed(1)}`;
  }

  // Ensure numPanels is even so upper and lower surfaces have equal panels
  const N_half = Math.max(10, Math.floor(numPanels / 2));
  const N_total = N_half * 2;

  // Cosine spacing for non-uniform panel clustering at LE and TE
  const xVals: number[] = [];
  for (let i = 0; i <= N_half; i++) {
    const beta = (i / N_half) * Math.PI;
    const x = 0.5 * (1 - Math.cos(beta));
    xVals.push(x);
  }

  const upperPoints: Point2D[] = [];
  const lowerPoints: Point2D[] = [];

  for (let i = 0; i <= N_half; i++) {
    const x = xVals[i];

    // Thickness distribution (NACA formula with zero thickness at trailing edge x=1)
    const yt =
      5 *
      t *
      (0.2969 * Math.sqrt(Math.max(0, x)) -
        0.1260 * x -
        0.3516 * Math.pow(x, 2) +
        0.2843 * Math.pow(x, 3) -
        0.1015 * Math.pow(x, 4));

    // Camber and camber line gradient
    let yc = 0;
    let dyc_dx = 0;

    if (m > 0 && p > 0) {
      if (x < p) {
        yc = (m / Math.pow(p, 2)) * (2 * p * x - Math.pow(x, 2));
        dyc_dx = ((2 * m) / Math.pow(p, 2)) * (p - x);
      } else {
        yc =
          (m / Math.pow(1 - p, 2)) *
          (1 - 2 * p + 2 * p * x - Math.pow(x, 2));
        dyc_dx = ((2 * m) / Math.pow(1 - p, 2)) * (p - x);
      }
    }

    const thetaC = Math.atan(dyc_dx);

    const xu = x - yt * Math.sin(thetaC);
    const yu = yc + yt * Math.cos(thetaC);

    const xl = x + yt * Math.sin(thetaC);
    const yl = yc - yt * Math.cos(thetaC);

    upperPoints.push({ x: xu, y: yu });
    lowerPoints.push({ x: xl, y: yl });
  }

  // Combine points in clockwise order:
  // Upper surface: from TE (x=1) to LE (x=0)
  // Lower surface: from LE (x=0) to TE (x=1)
  const orderedPoints: Point2D[] = [];

  // Upper TE to LE: reverse upperPoints (which went from 0 to 1)
  for (let i = N_half; i >= 0; i--) {
    orderedPoints.push({ ...upperPoints[i] });
  }

  // Lower LE to TE: lowerPoints from 1 to N_half (skip index 0 which is LE)
  for (let i = 1; i <= N_half; i++) {
    orderedPoints.push({ ...lowerPoints[i] });
  }

  // Apply flap deflection if specified
  if (Math.abs(flapAngleDeg) > 0.01) {
    const deltaRad = (flapAngleDeg * Math.PI) / 180;
    const cosD = Math.cos(deltaRad);
    const sinD = Math.sin(deltaRad);

    // Approximate hinge y coordinate along mean camber line
    let yHinge = 0;
    if (m > 0 && p > 0) {
      if (flapHingeX < p) {
        yHinge = (m / Math.pow(p, 2)) * (2 * p * flapHingeX - Math.pow(flapHingeX, 2));
      } else {
        yHinge = (m / Math.pow(1 - p, 2)) * (1 - 2 * p + 2 * p * flapHingeX - Math.pow(flapHingeX, 2));
      }
    }

    for (let i = 0; i < orderedPoints.length; i++) {
      const pt = orderedPoints[i];
      if (pt.x > flapHingeX) {
        const dx = pt.x - flapHingeX;
        const dy = pt.y - yHinge;
        // Rotate downwards (+y in screen, but aero coordinate has +y up, flap down = negative y rotation)
        pt.x = flapHingeX + dx * cosD + dy * sinD;
        pt.y = yHinge - dx * sinD + dy * cosD;
      }
    }
  }

  // Build panels from adjacent point pairs
  const panels: Panel[] = [];
  for (let i = 0; i < N_total; i++) {
    const p1 = orderedPoints[i];
    const p2 = orderedPoints[i + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);

    // Tangent unit vector: (dx/length, dy/length)
    const tx = dx / length;
    const ty = dy / length;

    // Outward unit normal vector for clockwise contour: (dy/length, -dx/length)
    const nx = dy / length;
    const ny = -dx / length;

    panels.push({
      index: i,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      xc: 0.5 * (p1.x + p2.x),
      yc: 0.5 * (p1.y + p2.y),
      length,
      theta,
      nx,
      ny,
      tx,
      ty,
      gamma: 0,
      vt: 0,
      cp: 0,
    });
  }

  const geometry: AirfoilGeometry = {
    name,
    points: orderedPoints,
    camber: m,
    camberPos: p,
    thickness: t,
    flapAngleDeg,
    flapHingeX,
  };

  return { geometry, panels };
}

/**
 * Standard preset airfoil profiles for quick selection
 */
export const AIRFOIL_PRESETS = [
  { code: '0012', name: 'NACA 0012', desc: 'Classic symmetric aerobatic & helicopter rotor profile' },
  { code: '2412', name: 'NACA 2412', desc: 'Cessna 172 & general aviation standard wing' },
  { code: '4412', name: 'NACA 4412', desc: 'High-lift moderate camber utility airfoil' },
  { code: '4415', name: 'NACA 4415', desc: 'High thickness sailplane / heavy transport section' },
  { code: '6409', name: 'NACA 6409', desc: 'High camber low-speed soaring / UAV profile' },
  { code: '0009', name: 'NACA 0009', desc: 'Thin symmetric tailfin / empennage surface' },
];
