import { Panel, FlowConditions, AeroResults } from '../types/aerodynamics';

/**
 * Solves integral boundary layer and computes skin friction, pressure drag, and total profile drag
 * using Thwaites' laminar method, transition prediction, and the Squire-Young relation.
 */
export function computeBoundaryLayerAndDrag(
  panels: Panel[],
  inviscidResults: AeroResults,
  conditions: FlowConditions
): AeroResults {
  const N = panels.length;
  const Vinf = conditions.vInf;
  const Re = Math.max(1e4, conditions.reynolds);
  const alphaDeg = conditions.alphaDeg;

  // Find stagnation panel (minimum velocity or closest to LE x ~ 0)
  let stagIndex = Math.floor(N / 2);
  let minSpeed = Infinity;
  for (let i = Math.floor(N / 4); i < Math.floor((3 * N) / 4); i++) {
    const speed = Math.abs(panels[i].vt);
    if (speed < minSpeed) {
      minSpeed = speed;
      stagIndex = i;
    }
  }

  // Upper surface panels: from stagIndex toward index 0 (TE upper)
  const upperPanels: { panel: Panel; s: number; Ue: number; x: number }[] = [];
  let sUpper = 0;
  for (let i = stagIndex; i >= 0; i--) {
    const p = panels[i];
    sUpper += p.length;
    upperPanels.push({
      panel: p,
      s: sUpper,
      Ue: Math.max(0.01 * Vinf, Math.abs(p.vt)),
      x: p.xc,
    });
  }

  // Lower surface panels: from stagIndex toward index N-1 (TE lower)
  const lowerPanels: { panel: Panel; s: number; Ue: number; x: number }[] = [];
  let sLower = 0;
  for (let i = stagIndex; i < N; i++) {
    const p = panels[i];
    sLower += p.length;
    lowerPanels.push({
      panel: p,
      s: sLower,
      Ue: Math.max(0.01 * Vinf, Math.abs(p.vt)),
      x: p.xc,
    });
  }

  // Analyze upper and lower boundary layer development
  const upperBL = solveSurfaceBL(upperPanels, Re, Vinf);
  const lowerBL = solveSurfaceBL(lowerPanels, Re, Vinf);

  // Squire-Young formula for total profile drag at trailing edge
  // CD = 2 * (theta_upper + theta_lower) * (Ue_TE / Vinf)^((H_TE + 5) / 2)
  const thetaTE = upperBL.thetaTE + lowerBL.thetaTE;
  const H_TE_avg = 0.5 * (upperBL.H_TE + lowerBL.H_TE);
  const Ue_TE_avg = 0.5 * (upperBL.Ue_TE + lowerBL.Ue_TE);

  const exponent = (H_TE_avg + 5) / 2;
  const speedRatio = Math.max(0.1, Math.min(1.5, Ue_TE_avg / Vinf));

  let cdProfile = 2 * thetaTE * Math.pow(speedRatio, exponent);
  const cdFriction = upperBL.cdFriction + lowerBL.cdFriction;

  // Form (pressure) drag is the difference
  let cdPressure = Math.max(0.001, cdProfile - cdFriction);

  // Stall & high angle-of-attack detection
  // Typical 2D airfoil stall onset is modelled around 12° to 17° here, with a
  // small camber-dependent shift. The continuous proximity value is used by
  // the wind-tunnel smoke diagnostic so the color changes gradually before
  // the actual stall flag trips.
  const stallAlphaDeg = 14.5 + 10 * (panels[0].yc);
  const alphaAbs = Math.abs(alphaDeg);
  const preStallWindowDeg = 4.5;
  const stallMarginDeg = stallAlphaDeg - alphaAbs;
  const alphaProximity = Math.max(0, Math.min(1,
    (alphaAbs - (stallAlphaDeg - preStallWindowDeg)) / preStallWindowDeg
  ));
  const hasSeparation = upperBL.separated || lowerBL.separated;
  const isStalled = alphaAbs > stallAlphaDeg || hasSeparation;
  const stallProximity = isStalled ? 1 : (hasSeparation ? Math.max(alphaProximity, 0.9) : alphaProximity);

  let effectiveCl = inviscidResults.cl;

  if (isStalled) {
    const dAlpha = alphaAbs - stallAlphaDeg;
    // Post-stall lift decay & plateau
    const dropFactor = Math.max(0.4, 1.0 - 0.08 * dAlpha);
    effectiveCl = inviscidResults.cl * dropFactor;

    // Post-stall massive drag rise due to separated wake
    const extraSeparationDrag = 1.2 * Math.pow(Math.sin((alphaDeg * Math.PI) / 180), 2);
    cdPressure += extraSeparationDrag;
    cdProfile = cdFriction + cdPressure;
  }

  // Ensure realistic non-zero drag floor
  const minCd = 0.006 * Math.pow(1e6 / Re, 0.2);
  cdProfile = Math.max(minCd, cdProfile);

  return {
    ...inviscidResults,
    cl: effectiveCl,
    cd: cdProfile,
    cdFriction,
    cdPressure,
    isStalled,
    separationUpper: upperBL.separationX,
    separationLower: lowerBL.separationX,
    stallAlphaDeg,
    stallMarginDeg,
    stallProximity,
  };
}

interface SurfaceBLResult {
  thetaTE: number;
  H_TE: number;
  Ue_TE: number;
  cdFriction: number;
  separated: boolean;
  separationX: number | null;
}

function solveSurfaceBL(
  surface: { panel: Panel; s: number; Ue: number; x: number }[],
  Re: number,
  Vinf: number
): SurfaceBLResult {
  if (surface.length === 0) {
    return { thetaTE: 0.002, H_TE: 1.4, Ue_TE: Vinf, cdFriction: 0.003, separated: false, separationX: null };
  }

  const nu = (Vinf * 1.0) / Re; // kinematic viscosity (c=1.0)
  let isTurbulent = false;
  let separated = false;
  let separationX: number | null = null;
  let theta = 1e-5;
  let H = 2.6; // initial laminar shape factor
  let totalCfDrag = 0;

  let integralU5 = 0;

  for (let i = 0; i < surface.length; i++) {
    const item = surface[i];
    const ds = i === 0 ? item.s : item.s - surface[i - 1].s;
    const Ue = item.Ue;
    const Rex = Math.max(10, (Ue * Math.max(0.01, item.s)) / nu);

    // Compute velocity gradient dUe/ds
    let dUe_ds = 0;
    if (i < surface.length - 1) {
      dUe_ds = (surface[i + 1].Ue - Ue) / Math.max(1e-4, surface[i + 1].s - item.s);
    } else if (i > 0) {
      dUe_ds = (Ue - surface[i - 1].Ue) / Math.max(1e-4, ds);
    }

    if (!isTurbulent) {
      // Laminar (Thwaites method)
      integralU5 += Math.pow(Ue, 5) * ds;
      const thetaSq = (0.45 * nu / Math.pow(Ue, 6)) * integralU5;
      theta = Math.sqrt(Math.max(1e-10, thetaSq));

      const lambda = (theta * theta / nu) * dUe_ds;
      // Thwaites separation condition: lambda <= -0.09
      if (lambda <= -0.085 && !separated) {
        separated = true;
        separationX = item.x;
      }

      // Laminar skin friction
      const cf = (2 * 0.22 / Math.max(1e-4, Math.sqrt(Rex)));
      totalCfDrag += cf * ds;

      // Transition check: Michel's criterion or Re_theta > 350 in adverse gradient
      const ReTheta = (Ue * theta) / nu;
      if (ReTheta > 1.174 * (1 + 22400 / Rex) * Math.pow(Rex, 0.46) || (dUe_ds < 0 && ReTheta > 320)) {
        isTurbulent = true;
        H = 1.4; // turbulent shape factor
      }
    } else {
      // Turbulent flow (White's power-law / Head's empirical relation)
      const ReTheta = Math.max(100, (Ue * theta) / nu);
      const cf = 0.026 / Math.pow(ReTheta, 0.268);

      // Momentum thickness growth d(theta)/ds = cf/2 - (H + 2)*(theta/Ue)*dUe/ds
      const dTheta = (cf / 2 - (H + 2) * (theta / Ue) * dUe_ds) * ds;
      theta = Math.max(1e-5, theta + dTheta);

      // Turbulent separation check
      if (dUe_ds < -2.5 * Vinf && !separated) {
        H = Math.min(3.0, H + 0.1);
        if (H > 2.4) {
          separated = true;
          separationX = item.x;
        }
      }

      totalCfDrag += cf * ds;
    }
  }

  const lastItem = surface[surface.length - 1];
  return {
    thetaTE: Math.min(0.05, Math.max(0.0005, theta)),
    H_TE: H,
    Ue_TE: lastItem.Ue,
    cdFriction: totalCfDrag * 0.5,
    separated,
    separationX,
  };
}
