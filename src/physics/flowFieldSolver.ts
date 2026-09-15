import { Panel, FlowConditions, Point2D, SmokeParticle } from '../types/aerodynamics';
import { getOffBodyVelocity } from './vortexPanelSolver';

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
    const v1 = getOffBodyVelocity(currX, currY, panels, qSources, gammaAirfoil, conditions);
    if (v1.speed < 1e-4) break;

    const dx1 = (v1.u / v1.speed) * stepSize;
    const dy1 = (v1.v / v1.speed) * stepSize;
    const midX = currX + 0.5 * dx1;
    const midY = currY + 0.5 * dy1;

    // Velocity at midpoint (RK2 Corrector)
    const vMid = getOffBodyVelocity(midX, midY, panels, qSources, gammaAirfoil, conditions);
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
 * Update particle positions for virtual smoke wind tunnel using RK2 integration for ultra-smooth paths
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
  separationX: number | null = null
): SmokeParticle[] {
  const updated: SmokeParticle[] = [];
  const sepX = separationX ?? (isStalled ? Math.max(0.2, 0.7 - 0.04 * (Math.abs(conditions.alphaDeg) - 14)) : 1.5);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.age += dt;

    // Respawn conditions
    if (p.age >= p.life || p.x > 2.2 || Math.abs(p.y) > 1.15) {
      p.x = -0.65 - Math.random() * 0.15;
      p.y = p.initialY + (Math.random() - 0.5) * 0.015;
      p.prevX = p.x;
      p.prevY = p.y;
      p.age = 0;
      p.life = 2.8 + Math.random() * 1.6;
    }

    // Store previous position for smooth motion streak rendering
    p.prevX = p.x;
    p.prevY = p.y;

    // 2nd-Order Runge-Kutta (Heun) for smooth curvature around stagnation & suction peaks
    const v1 = getOffBodyVelocity(p.x, p.y, panels, qSources, gammaAirfoil, conditions);
    
    // Euler predictor step
    const xPredict = p.x + v1.u * dt;
    const yPredict = p.y + v1.v * dt;

    // Corrector step
    const v2 = getOffBodyVelocity(xPredict, yPredict, panels, qSources, gammaAirfoil, conditions);
    p.vx = 0.5 * (v1.u + v2.u);
    p.vy = 0.5 * (v1.v + v2.v);

    // If stalled and in the separated boundary layer or wake, inject turbulent vortex perturbations
    if (isStalled && p.x >= sepX) {
      const isSeparatedSide =
        (conditions.alphaDeg >= 0 && p.y >= -0.05 && p.y <= 0.65) ||
        (conditions.alphaDeg < 0 && p.y <= 0.05 && p.y >= -0.65);

      if (isSeparatedSide) {
        const wakeDistance = p.x - sepX;
        const eddyStrength = Math.min(1.0, wakeDistance * 1.5) * conditions.vInf * 0.45;
        p.vy += Math.sin(p.x * 16 + p.age * 22) * eddyStrength;
        p.vx -= (0.2 + Math.abs(Math.cos(p.x * 12 + p.age * 18)) * 0.3) * conditions.vInf;
      }
    }

    const nextX = p.x + p.vx * dt;
    const nextY = p.y + p.vy * dt;

    if (isPointInsideAirfoil(nextX, nextY, airfoilPoints)) {
      // Smoothly respawn at inlet if impinged
      p.x = -0.65 - Math.random() * 0.15;
      p.y = p.initialY + (Math.random() - 0.5) * 0.015;
      p.prevX = p.x;
      p.prevY = p.y;
      p.age = 0;
    } else {
      p.x = nextX;
      p.y = nextY;
    }

    updated.push(p);
  }

  return updated;
}
