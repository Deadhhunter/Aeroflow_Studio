export interface Point2D {
  x: number;
  y: number;
}

export interface Panel {
  index: number;
  // End points
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Control point (midpoint)
  xc: number;
  yc: number;
  // Panel geometric properties
  length: number;
  theta: number; // Angle of panel with positive x-axis [radians]
  // Unit normal vector (pointing into the flow, outward from airfoil)
  nx: number;
  ny: number;
  // Unit tangent vector (in panel direction)
  tx: number;
  ty: number;
  // Solved aerodynamic properties
  gamma: number; // Vortex strength / panel circulation density
  vt: number;    // Surface tangential velocity (normalized by V_inf)
  cp: number;    // Pressure coefficient Cp = 1 - (vt / V_inf)^2
}

export interface AirfoilGeometry {
  name: string;
  points: Point2D[]; // Closed loop of coordinates
  camber: number;    // Max camber as % chord (e.g., 0.02 for 2%)
  camberPos: number; // Position of max camber (e.g., 0.4 for 40% chord)
  thickness: number; // Max thickness as % chord (e.g., 0.12 for 12%)
  flapAngleDeg: number;
  flapHingeX: number; // Flap hinge location (e.g., 0.75 for 75% chord)
}

export interface FlowConditions {
  alphaDeg: number;  // Angle of attack in degrees; evaluated continuously, converted to radians in solver
  vInf: number;      // Freestream speed (m/s)
  reynolds: number;  // Reynolds number
}

export interface AeroResults {
  panels: Panel[];
  cl: number;          // Total lift coefficient
  cd: number;          // Total drag coefficient (Squire-Young)
  cdFriction: number;  // Skin friction drag component
  cdPressure: number;  // Form / pressure drag component
  cmC4: number;        // Pitching moment coefficient about quarter-chord (0.25c)
  xcp: number;         // Center of pressure (x/c)
  liftSlope: number;   // dCl/dalpha in 1/deg
  separationUpper: number | null; // Separation point x/c on upper surface
  separationLower: number | null; // Separation point x/c on lower surface
  isStalled: boolean;
  stallAlphaDeg: number;    // Modelled onset angle for stall [deg]
  stallMarginDeg: number;   // Positive = margin remaining to nominal stall [deg]
  stallProximity: number;   // 0..1, used for continuous near-stall visualization
  circulation: number; // Total circulation Gamma
}

export interface PolarPoint {
  alpha: number;
  cl: number;
  cd: number;
  cm: number;
  ld: number;
}

export type VisualizationMode = 'streamlines' | 'smoke' | 'vectors' | 'pressure';

export interface SmokeParticle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  initialY: number;
  size: number;
  /** Recent material path of the injected smoke filament, newest point last. */
  trail: Point2D[];
}
