import { Panel, FlowConditions, Point2D, SmokeParticle } from '../types/aerodynamics';
import { getOffBodyVelocityWorld } from './vortexPanelSolver';
import { worldToBodyPoint, rotateVector } from './coordinateTransforms';

/**
 * Check if point (x, y) is inside the closed airfoil polygon using ray casting
 */
export function isPointInsideAirfoil(x: number, y: number, points: Point2D[]): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Trace a streamline starting from seed (x0, y0) using 2nd-order Runge-Kutta (RK2)
 */
export function traceStreamline(
  x0: number,
  y0: number,
  panels: Panel[],
  qSources: number[],
  gammaAirfoil: number,
  conditions: FlowConditions,
  airfoilPoints: Point2D[],
  maxSteps: number = 320,
  stepSize: number = 0.012
): { points: Point2D[]; velocities: number[] } {
  const line: Point2D[] = [{ x: x0, y: y0 }];
  const velocities: number[] = [conditions.vInf];
  let currX = x0;
  let currY = y0;

  for (let step = 0; step < maxSteps; step++) {
    // Domain limits
    if (currX < -0.8 || currX > 2.2 || currY < -1.1 || currY > 1.1) {
      break;
    }

    // Stop if inside airfoil
    if (isPointInsideAirfoil(currX, currY, airfoilPoints)) {
      break;
    }

    // Velocity at current point (RK2 Predictor)
    const v1 = getOffBodyVelocityWorld(currX, currY, panels, qSources, gammaAirfoil, conditions);
    if (v1.speed < 1e-4) break;

    const dx1 = (v1.u / v1.speed) * stepSize;
    const dy1 = (v1.v / v1.speed) * stepSize;
    const midX = currX + 0.5 * dx1;
    const midY = currY + 0.5 * dy1;

    // Velocity at midpoint (RK2 Corrector)
    const vMid = getOffBodyVelocityWorld(midX, midY, panels, qSources, gammaAirfoil, conditions);
    if (vMid.speed < 1e-4) break;

    const dx = (vMid.u / vMid.speed) * stepSize;
    const dy = (vMid.v / vMid.speed) * stepSize;

    currX += dx;
    currY += dy;

    line.push({ x: currX, y: currY });
    velocities.push(vMid.speed);
  }

  return { points: line, velocities };
}

/**
 * Update smoke material points with the actual solved off-body velocity field.
 *
 * The visual smoke is represented as pathlines/streaklines: every material point
 * is integrated with Heun's RK2 method and keeps a short history so the rendered
 * plume is a continuous filament rather than isolated dots.
 *
 * For separated flow, the underlying Hess-Smith potential-flow field has no
 * viscous wake by construction. A bounded, alternating vortex-street closure is
 * therefore applied only downstream of the modeled boundary-layer separation
 * point. Its shedding frequency uses a canonical Strouhal-number closure, so the
 * wake motion remains tied to V_inf and chord instead of arbitrary screen-space
 * oscillations. This is still a reduced-order visualization, not RANS/LES CFD.
 */
export function updateSmokeParticles(
  particles: SmokeParticle[],
  panels: Panel[],
  qSources: number[],
  gammaAirfoil: number,
  conditions: FlowConditions,
  airfoilPoints: Point2D[],
  dt: number = 0.016,
  isStalled: boolean = false,
  separationX: number | null = null,
  simTime: number = 0
): SmokeParticle[] {
  const updated: SmokeParticle[] = [];
  const c = 1.0;
  const sepX = separationX ?? (isStalled
    ? Math.max(0.16, 0.72 - 0.035 * Math.max(0, Math.abs(conditions.alphaDeg) - 14))
    : null);
  const alphaRad = (conditions.alphaDeg * Math.PI) / 180;
  const visualAngleRad = -alphaRad;
  const Vinf = Math.max(0.1, conditions.vInf);

  // Canonical bluff-body-like wake shedding closure used only as a reduced-order
  // separated-wake model. St = f c / V. Around 0.2 is representative of organized
  // vortex shedding in separated wakes. This is a visualization closure, not CFD.
  const St = 0.20;
  const sheddingFrequency = Math.min(18, Math.max(0.35, St * Vinf / c));
  const shedPhase = (simTime * sheddingFrequency) % 1;
  const wakePitch = Math.max(0.16, Vinf / sheddingFrequency * 0.16);

  const respawn = (p: SmokeParticle) => {
    p.x = -0.80 - Math.random() * 0.12;
    p.y = p.initialY + (Math.random() - 0.5) * 0.006;
    p.prevX = p.x;
    p.prevY = p.y;
    p.vx = Vinf;
    p.vy = 0;
    p.age = 0;
    p.life = 3.6 + Math.random() * 1.8;
    p.trail = [{ x: p.x, y: p.y }];
  };

  for (const p of particles) {
    p.age += dt;

    if (p.age >= p.life || p.x > 2.35 || Math.abs(p.y) > 1.18 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      respawn(p);
      updated.push(p);
      continue;
    }

    p.prevX = p.x;
    p.prevY = p.y;

    // Physical advection from the solved Hess-Smith field.
    const v1 = getOffBodyVelocityWorld(p.x, p.y, panels, qSources, gammaAirfoil, conditions);
    if (!Number.isFinite(v1.u) || !Number.isFinite(v1.v)) {
      respawn(p);
      updated.push(p);
      continue;
    }

    const xPred = p.x + v1.u * dt;
    const yPred = p.y + v1.v * dt;
    const v2 = getOffBodyVelocityWorld(xPred, yPred, panels, qSources, gammaAirfoil, conditions);
    if (!Number.isFinite(v2.u) || !Number.isFinite(v2.v)) {
      respawn(p);
      updated.push(p);
      continue;
    }

    p.vx = 0.5 * (v1.u + v2.u);
    p.vy = 0.5 * (v1.v + v2.v);

    // Reduced-order separated wake. Work in the airfoil body frame so the closure
    // follows the exact continuous AoA rotation, then transform the perturbation
    // back into the horizontal tunnel frame.
    if (sepX !== null && sepX < 1.05 && isStalled) {
      const body = worldToBodyPoint({ x: p.x, y: p.y }, visualAngleRad);
      const side = conditions.alphaDeg >= 0 ? 1 : -1;
      const wakeX = body.x - sepX;
      const wakeHalfWidth = 0.11 + 0.10 * Math.sqrt(Math.max(0, wakeX));
      const inWake = wakeX > 0 && Math.abs(body.y) < 0.18 + 0.22 * Math.min(1.6, wakeX);

      if (inWake) {
        // Mean velocity deficit grows downstream, while remaining bounded.
        const wakeGrowth = Math.min(1, wakeX / 1.3);
        const coreSigma = 0.05 + 0.055 * Math.sqrt(Math.max(0, wakeX));
        const shearCenter = side * (0.075 + 0.045 * Math.min(1, wakeX));
        const dyShear = body.y - shearCenter;
        const shear = Math.exp(-(dyShear * dyShear) / (2 * wakeHalfWidth * wakeHalfWidth));
        const deficit = 0.16 * Vinf * wakeGrowth * shear;
        let duBody = -deficit;
        let dvBody = 0;

        // Time-dependent alternating compact vortices, convected downstream.
        for (let k = 0; k < 8; k++) {
          const downstreamOffset = (k + 0.85 - shedPhase) * wakePitch;
          const cx = sepX + 0.10 + downstreamOffset;
          const cy = side * (0.10 + 0.015 * Math.sin(k * 1.7));
          const dx = body.x - cx;
          const dy = body.y - cy;
          const sigma = coreSigma * (1 + 0.055 * k);
          const r2 = dx * dx + dy * dy + sigma * sigma * 0.18;
          const core = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          const circulation = (k % 2 === 0 ? 1 : -1) * side * 0.055 * Vinf * Math.exp(-0.11 * k);
          duBody += (-circulation * dy / r2) * core;
          dvBody += (circulation * dx / r2) * core;
        }

        // Mild entrainment from the shear layer, strongest close to separation.
        const entrainment = 0.045 * Vinf * Math.exp(-wakeX / 1.1) * Math.tanh(body.y / 0.12);
        dvBody += -side * entrainment * shear;

        const perturb = rotateVector({ x: duBody, y: dvBody }, visualAngleRad);
        p.vx += perturb.x;
        p.vy += perturb.y;
      }
    }

    let nextX = p.x + p.vx * dt;
    let nextY = p.y + p.vy * dt;

    // Keep material out of the solid body. A hit is re-injected at the tunnel inlet.
    if (isPointInsideAirfoil(nextX, nextY, airfoilPoints)) {
      respawn(p);
    } else {
      p.x = nextX;
      p.y = nextY;
      if (!p.trail || p.trail.length === 0) p.trail = [{ x: p.prevX, y: p.prevY }];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 34) p.trail.splice(0, p.trail.length - 34);
    }

    updated.push(p);
  }

  return updated;
}
