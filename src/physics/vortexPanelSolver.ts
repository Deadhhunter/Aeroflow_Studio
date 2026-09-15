import { Panel, FlowConditions, AeroResults } from '../types/aerodynamics';
import { solveLinearSystem } from './linearAlgebra';

/**
 * Compute local geometric angles and distances from point (x, y) to panel endpoints
 */
function getPanelLocalCoords(
  x: number,
  y: number,
  panel: Panel
): { r1: number; r2: number; theta1: number; theta2: number; beta: number } {
  const dx1 = x - panel.x1;
  const dy1 = y - panel.y1;
  const dx2 = x - panel.x2;
  const dy2 = y - panel.y2;

  const r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

  const theta1 = Math.atan2(dy1, dx1);
  const theta2 = Math.atan2(dy2, dx2);

  let beta = theta2 - theta1;
  // Wrap angle to [-PI, PI]
  while (beta > Math.PI) beta -= 2 * Math.PI;
  while (beta < -Math.PI) beta += 2 * Math.PI;

  return { r1, r2, theta1, theta2, beta };
}

/**
 * Compute velocity induced by unit source and unit vortex of panel j at point (x, y)
 * in global coordinates (u, v)
 */
export function computePanelInfluence(
  x: number,
  y: number,
  panel: Panel
): {
  uSource: number;
  vSource: number;
  uVortex: number;
  vVortex: number;
} {
  const { r1, r2, beta } = getPanelLocalCoords(x, y, panel);

  // If point is on or extremely close to the panel endpoints
  const eps = 1e-10;
  const safeR1 = Math.max(r1, eps);
  const safeR2 = Math.max(r2, eps);

  // Local log term
  const logTerm = 0.5 * Math.log((safeR1 * safeR1) / (safeR2 * safeR2));

  // In panel local coordinate system (xi along panel, eta normal)
  // Local unit source induces:
  // u_loc = (1 / 2pi) * log(r1 / r2)
  // v_loc = (1 / 2pi) * beta
  const factor = 1 / (2 * Math.PI);
  const uSrcLoc = factor * logTerm;
  const vSrcLoc = factor * beta;

  // Local unit vortex induces:
  // u_loc = (1 / 2pi) * beta
  // v_loc = -(1 / 2pi) * log(r1 / r2)
  const uVtxLoc = factor * beta;
  const vVtxLoc = -factor * logTerm;

  // Rotate local velocities back to global coordinate system
  const cosT = Math.cos(panel.theta);
  const sinT = Math.sin(panel.theta);

  const uSource = uSrcLoc * cosT - vSrcLoc * sinT;
  const vSource = uSrcLoc * sinT + vSrcLoc * cosT;

  const uVortex = uVtxLoc * cosT - vVtxLoc * sinT;
  const vVortex = uVtxLoc * sinT + vVtxLoc * cosT;

  return { uSource, vSource, uVortex, vVortex };
}

/**
 * Solves the potential flow over the airfoil using Hess-Smith Panel Method
 */
export function solveVortexPanels(
  panels: Panel[],
  conditions: FlowConditions
): { results: AeroResults; gammaAirfoil: number; sourceStrengths: number[] } {
  const N = panels.length;
  const alphaRad = (conditions.alphaDeg * Math.PI) / 180;
  const Vinf = conditions.vInf;

  // Freestream velocity components
  const uInf = Vinf * Math.cos(alphaRad);
  const vInf = Vinf * Math.sin(alphaRad);

  // System size: (N + 1) x (N + 1)
  // Unknowns: q_1, q_2, ... q_N (source strengths) and gamma (vortex circulation)
  const A: number[][] = [];
  const b: number[] = new Array(N + 1).fill(0);

  for (let i = 0; i <= N; i++) {
    A.push(new Array(N + 1).fill(0));
  }

  // Pre-calculate influence matrices
  // A_source[i][j] = normal velocity induced at control point i by unit source on panel j
  // B_source[i][j] = tangential velocity induced at control point i by unit source on panel j
  // A_vortex[i][j] = normal velocity induced at control point i by unit vortex on panel j
  // B_vortex[i][j] = tangential velocity induced at control point i by unit vortex on panel j
  for (let i = 0; i < N; i++) {
    const cp = panels[i];
    let vortexNormalSum = 0;

    for (let j = 0; j < N; j++) {
      if (i === j) {
        // Self-induced velocity at panel midpoint:
        // Source induces outward normal velocity of +0.5
        A[i][j] = 0.5;
        // Vortex induces tangential velocity along surface of +0.5, normal is 0
      } else {
        const { uSource, vSource, uVortex, vVortex } = computePanelInfluence(
          cp.xc,
          cp.yc,
          panels[j]
        );
        // Project onto panel i's outward normal: V · n_i
        A[i][j] = uSource * cp.nx + vSource * cp.ny;
        vortexNormalSum += uVortex * cp.nx + vVortex * cp.ny;
      }
    }

    // Column N is the vortex term (sum of influences of all panels with unit vortex)
    A[i][N] = vortexNormalSum;

    // RHS: - V_inf · n_i
    b[i] = -(uInf * cp.nx + vInf * cp.ny);
  }

  // Row N: Kutta condition (smooth flow at trailing edge)
  // Tangential velocity at upper TE panel (index 0) + tangential velocity at lower TE panel (index N-1) = 0
  const pUpperTE = panels[0];
  const pLowerTE = panels[N - 1];

  let kuttaVortexSum = 0;
  for (let j = 0; j < N; j++) {
    let vtUpperSrc = 0;
    let vtUpperVtx = 0;
    let vtLowerSrc = 0;
    let vtLowerVtx = 0;

    // Upper TE
    if (j === 0) {
      vtUpperSrc = 0;
      vtUpperVtx = 0.5;
    } else {
      const infU = computePanelInfluence(pUpperTE.xc, pUpperTE.yc, panels[j]);
      vtUpperSrc = infU.uSource * pUpperTE.tx + infU.vSource * pUpperTE.ty;
      vtUpperVtx = infU.uVortex * pUpperTE.tx + infU.vVortex * pUpperTE.ty;
    }

    // Lower TE
    if (j === N - 1) {
      vtLowerSrc = 0;
      vtLowerVtx = 0.5;
    } else {
      const infL = computePanelInfluence(pLowerTE.xc, pLowerTE.yc, panels[j]);
      vtLowerSrc = infL.uSource * pLowerTE.tx + infL.vSource * pLowerTE.ty;
      vtLowerVtx = infL.uVortex * pLowerTE.tx + infL.vVortex * pLowerTE.ty;
    }

    A[N][j] = vtUpperSrc + vtLowerSrc;
    kuttaVortexSum += vtUpperVtx + vtLowerVtx;
  }

  A[N][N] = kuttaVortexSum;

  const vtInfUpper = uInf * pUpperTE.tx + vInf * pUpperTE.ty;
  const vtInfLower = uInf * pLowerTE.tx + vInf * pLowerTE.ty;
  b[N] = -(vtInfUpper + vtLowerSrcFormula(vtInfLower));

  function vtLowerSrcFormula(val: number) {
    return val;
  }

  // Solve the linear system
  const solution = solveLinearSystem(A, b);
  const qSources = solution.slice(0, N);
  const gammaAirfoil = solution[N];

  // Calculate tangential velocity and Cp on each panel
  let totalCirculation = 0;
  for (let i = 0; i < N; i++) {
    const cp = panels[i];
    let vtSum = uInf * cp.tx + vInf * cp.ty;

    for (let j = 0; j < N; j++) {
      if (i === j) {
        vtSum += gammaAirfoil * 0.5;
      } else {
        const { uSource, vSource, uVortex, vVortex } = computePanelInfluence(
          cp.xc,
          cp.yc,
          panels[j]
        );
        vtSum +=
          qSources[j] * (uSource * cp.tx + vSource * cp.ty) +
          gammaAirfoil * (uVortex * cp.tx + vVortex * cp.ty);
      }
    }

    cp.vt = vtSum;
    cp.gamma = gammaAirfoil;
    // Pressure coefficient Cp = 1 - (vt / Vinf)^2
    cp.cp = 1 - Math.pow(vtSum / Vinf, 2);
    totalCirculation += gammaAirfoil * cp.length;
  }

  // Compute integrated aerodynamic force coefficients
  // Chord length is assumed c = 1.0
  let clSum = 0;
  let cmC4Sum = 0;

  for (let i = 0; i < N; i++) {
    const p = panels[i];
    // Force normal to panel: dF_n = -Cp * length * n
    // Lift is force component perpendicular to freestream
    // For small/moderate alpha:
    const fx = -p.cp * p.length * p.nx;
    const fy = -p.cp * p.length * p.ny;

    // Project onto lift (perpendicular to freestream)
    const dL = -fx * Math.sin(alphaRad) + fy * Math.cos(alphaRad);
    clSum += dL;

    // Pitching moment about quarter-chord (0.25, 0.0)
    // dM = r x dF = (x - 0.25) * fy - (y - 0.0) * fx
    const dx = p.xc - 0.25;
    const dy = p.yc;
    // Nose-up is positive
    cmC4Sum += -(dx * fy - dy * fx);
  }

  // Lift by Kutta-Joukowski theorem as validation / smoothing
  const clKutta = (2 * totalCirculation) / (Vinf * 1.0);
  const finalCl = 0.5 * (clSum + clKutta);

  // Center of pressure (x_cp / c)
  const xcp = Math.abs(finalCl) > 0.01 ? 0.25 - cmC4Sum / finalCl : 0.25;

  const results: AeroResults = {
    panels,
    cl: finalCl,
    cd: 0, // Computed in boundary layer module
    cdFriction: 0,
    cdPressure: 0,
    cmC4: cmC4Sum,
    xcp: Math.max(-0.5, Math.min(1.5, xcp)),
    liftSlope: 2 * Math.PI * (Math.PI / 180), // ~0.1097 / deg
    separationUpper: null,
    separationLower: null,
    isStalled: false,
    circulation: totalCirculation,
  };

  return { results, gammaAirfoil, sourceStrengths: qSources };
}

/**
 * Calculates off-body flow velocity at point (x, y)
 */
export function getOffBodyVelocity(
  x: number,
  y: number,
  panels: Panel[],
  qSources: number[],
  gammaAirfoil: number,
  conditions: FlowConditions
): { u: number; v: number; speed: number; cp: number } {
  const alphaRad = (conditions.alphaDeg * Math.PI) / 180;
  const Vinf = conditions.vInf;

  let u = Vinf * Math.cos(alphaRad);
  let v = Vinf * Math.sin(alphaRad);

  const N = panels.length;
  for (let j = 0; j < N; j++) {
    const inf = computePanelInfluence(x, y, panels[j]);
    u += qSources[j] * inf.uSource + gammaAirfoil * inf.uVortex;
    v += qSources[j] * inf.vSource + gammaAirfoil * inf.vVortex;
  }

  const speedSq = u * u + v * v;
  const speed = Math.sqrt(speedSq);
  const cp = 1 - speedSq / (Vinf * Vinf);

  return { u, v, speed, cp };
}
