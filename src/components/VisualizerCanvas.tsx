import React, { useRef, useEffect, useState } from 'react';
import {
  Panel,
  FlowConditions,
  AirfoilGeometry,
  AeroResults,
  VisualizationMode,
  SmokeParticle,
} from '../types/aerodynamics';
import { traceStreamline, updateSmokeParticles } from '../physics/flowFieldSolver';
import { getOffBodyVelocityWorld } from '../physics/vortexPanelSolver';
import { airfoilToWorldPoints, bodyToWorldPoint, panelsToWorld, worldToBodyPoint } from '../physics/coordinateTransforms';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / Math.max(1e-9, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type RGB = { r: number; g: number; b: number };
const smokeStops: Array<{ t: number; c: RGB }> = [
  { t: 0.00, c: { r: 212, g: 225, b: 236 } },
  { t: 0.30, c: { r: 255, g: 246, b: 185 } },
  { t: 0.55, c: { r: 255, g: 223, b: 66 } },
  { t: 0.78, c: { r: 255, g: 145, b: 34 } },
  { t: 1.00, c: { r: 255, g: 54, b: 52 } },
];

function stallTint(t: number): RGB {
  const u = clamp01(t);
  for (let i = 1; i < smokeStops.length; i++) {
    if (u <= smokeStops[i].t) {
      const a = smokeStops[i - 1];
      const b = smokeStops[i];
      const f = clamp01((u - a.t) / (b.t - a.t));
      return {
        r: Math.round(lerp(a.c.r, b.c.r, f)),
        g: Math.round(lerp(a.c.g, b.c.g, f)),
        b: Math.round(lerp(a.c.b, b.c.b, f)),
      };
    }
  }
  return smokeStops[smokeStops.length - 1].c;
}


interface VisualizerCanvasProps {
  geometry: AirfoilGeometry;
  panels: Panel[];
  results: AeroResults;
  conditions: FlowConditions;
  sourceStrengths: number[];
  gammaAirfoil: number;
  visMode: VisualizationMode;
  showPanels: boolean;
  showCamberLine: boolean;
  showCpIndicator: boolean;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  geometry,
  panels,
  results,
  conditions,
  sourceStrengths,
  gammaAirfoil,
  visMode,
  showPanels,
  showCamberLine,
  showCpIndicator,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Pan and zoom camera state
  const [zoom, setZoom] = useState<number>(360); // pixels per chord unit
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 260, y: 220 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Smoke material points are rendered as short streaklines. Each point carries
  // a path history so the tunnel shows continuous flowing smoke instead of dots.
  const particlesRef = useRef<SmokeParticle[]>([]);

  // Initialize a smoke-injection rake. More filaments are concentrated near the
  // airfoil where boundary-layer and separated-wake behaviour is visible.
  useEffect(() => {
    const particles: SmokeParticle[] = [];
    const numRakes = 30;
    const particlesPerRake = 12;

    for (let i = 0; i < numRakes; i++) {
      const norm = (i / (numRakes - 1)) * 2 - 1;
      const y0 = Math.sign(norm) * Math.pow(Math.abs(norm), 1.12) * 0.78;

      for (let j = 0; j < particlesPerRake; j++) {
        const x0 = -0.82 + (j / (particlesPerRake - 1)) * 2.65 + (Math.random() - 0.5) * 0.025;
        const particleSize = 1.0 + Math.random() * 1.45;
        const age = Math.random() * 1.9;
        particles.push({
          x: x0,
          y: y0,
          prevX: x0,
          prevY: y0,
          vx: conditions.vInf,
          vy: 0,
          age,
          life: 3.9 + Math.random() * 1.6,
          initialY: y0,
          size: particleSize,
          trail: [{ x: x0, y: y0 }],
        });
      }
    }
    particlesRef.current = particles;
  }, [conditions.vInf, conditions.alphaDeg, geometry, panels.length]);

  // Coordinate transforms: Physical (x, y) where x in [-0.5, 1.5], y in [-1, 1] to Canvas (px, py)
  const toCanvasX = (x: number) => pan.x + x * zoom;
  const toCanvasY = (y: number) => pan.y - y * zoom; // Invert y for standard math coordinate

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(150, Math.min(900, prev * factor)));
  };

  const resetCamera = () => {
    setZoom(360);
    setPan({ x: 260, y: 220 });
  };

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(0.04, (time - lastTime) / 1000);
      lastTime = time;

      // The aerodynamic solution is computed in body coordinates. The wind-tunnel
      // view uses a horizontal freestream, so the body geometry and velocity field
      // are rotated together by the exact floating-point alpha in radians.
      const alphaRad = (conditions.alphaDeg * Math.PI) / 180;
      const visualAngleRad = -alphaRad;
      const worldPoints = airfoilToWorldPoints(geometry.points, visualAngleRad);
      const worldPanels = panelsToWorld(panels, visualAngleRad);

      const width = canvas.width;
      const height = canvas.height;

      // Clear with dark aerodynamic wind-tunnel background
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw subtle background wind-tunnel grid
      ctx.strokeStyle = '#121b2b';
      ctx.lineWidth = 1;
      const gridSize = zoom * 0.2; // 0.2 chord grid
      const offsetX = pan.x % gridSize;
      const offsetY = pan.y % gridSize;

      ctx.beginPath();
      for (let x = offsetX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = offsetY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // 2. Draw horizontal tunnel freestream. AoA belongs to the airfoil, not the wind arrow.
      const windLen = 52;
      const windStartX = 34;
      const windStartY = 42;
      const windEndX = windStartX + windLen;
      const windEndY = windStartY;

      ctx.strokeStyle = '#00f0ff';
      ctx.fillStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(windStartX, windStartY);
      ctx.lineTo(windEndX, windEndY);
      ctx.stroke();

      // Arrowhead
      const headAngle = Math.atan2(windStartY - windEndY, windEndX - windStartX);
      ctx.beginPath();
      ctx.moveTo(windEndX, windEndY);
      ctx.lineTo(
        windEndX - 8 * Math.cos(headAngle - Math.PI / 6),
        windEndY + 8 * Math.sin(headAngle - Math.PI / 6)
      );
      ctx.lineTo(
        windEndX - 8 * Math.cos(headAngle + Math.PI / 6),
        windEndY + 8 * Math.sin(headAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      ctx.font = '10px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(
        `V∞  →  horizontal tunnel flow`,
        windStartX - 10,
        windStartY + 25
      );
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(`α = ${conditions.alphaDeg >= 0 ? '+' : ''}${conditions.alphaDeg.toFixed(3)}°  |  ${alphaRad.toFixed(7)} rad`, windStartX - 10, windStartY + 39);

      // 3. Render Selected Visualization Mode
      if (sourceStrengths.length > 0) {
        if (visMode === 'streamlines') {
          // RK2 Streamline Traces - 52 dense lines clustered around airfoil
          const numStreamlines = 52;
          const isStalled = results.isStalled;
          const sepX =
            results.separationUpper ??
            (isStalled ? Math.max(0.18, 0.7 - 0.04 * (Math.abs(conditions.alphaDeg) - 14)) : 1.5);

          for (let i = 0; i < numStreamlines; i++) {
            // Non-linear clustering: more lines close to the airfoil centerline y=0
            const norm = (i / (numStreamlines - 1)) * 2 - 1; // [-1, 1]
            const y0 = Math.sign(norm) * Math.pow(Math.abs(norm), 1.25) * 0.72;

            const { points: line, velocities } = traceStreamline(
              -0.75,
              y0,
              panels,
              sourceStrengths,
              gammaAirfoil,
              conditions,
              worldPoints,
              300,
              0.010
            );

            if (line.length > 1) {
              const avgSpeed = velocities.reduce((a, b) => a + b, 0) / velocities.length;
              const speedRatio = avgSpeed / conditions.vInf;
              const isStallStreamline =
                isStalled &&
                ((conditions.alphaDeg >= 0 && y0 > 0 && y0 < 0.65) ||
                  (conditions.alphaDeg < 0 && y0 < 0 && y0 > -0.65));

              // Draw segment by segment to show exact red color transition at stall initiation
              for (let k = 1; k < line.length; k++) {
                const ptA = line[k - 1];
                const ptB = line[k];
                const midX = 0.5 * (ptA.x + ptB.x);

                const isSeparatedSegment = isStallStreamline && midX >= sepX;

                ctx.beginPath();
                ctx.moveTo(toCanvasX(ptA.x), toCanvasY(ptA.y));
                ctx.lineTo(toCanvasX(ptB.x), toCanvasY(ptB.y));

                if (isSeparatedSegment) {
                  // TURNS GLOWING RED IN SEPARATED STALL FLOW!
                  ctx.strokeStyle = '#ff1e46';
                  ctx.lineWidth = 2.2;
                  ctx.shadowColor = '#ff1e46';
                  ctx.shadowBlur = 8;
                } else if (y0 > 0) {
                  // Upper attached suction flow (cyan)
                  ctx.strokeStyle =
                    speedRatio > 1.15
                      ? 'rgba(0, 240, 255, 0.85)'
                      : 'rgba(56, 189, 248, 0.65)';
                  ctx.lineWidth = 1.35;
                  ctx.shadowBlur = 0;
                } else {
                  // Lower attached pressure flow (amber)
                  ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
                  ctx.lineWidth = 1.35;
                  ctx.shadowBlur = 0;
                }
                ctx.stroke();
              }
              ctx.shadowBlur = 0;
            }
          }
        } else if (visMode === 'smoke') {
          // PHYSICS-BASED SMOKE STREAKLINES
          // Each visible filament is the accumulated trajectory of a material point
          // integrated through the solved off-body velocity field with RK2/Heun.
          particlesRef.current = updateSmokeParticles(
            particlesRef.current,
            panels,
            sourceStrengths,
            gammaAirfoil,
            conditions,
            worldPoints,
            dt,
            results.isStalled,
            results.separationUpper,
            time / 1000
          );

          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          const isStalled = results.isStalled;
          const sepX = results.separationUpper ?? (
            isStalled
              ? Math.max(0.16, 0.72 - 0.035 * Math.max(0, Math.abs(conditions.alphaDeg) - 14))
              : null
          );

          for (const p of particlesRef.current) {
            const trail = p.trail ?? [{ x: p.prevX, y: p.prevY }, { x: p.x, y: p.y }];
            if (trail.length < 2) continue;

            const ageFade = clamp01(Math.sin(Math.PI * clamp01(p.age / p.life)));
            // Draw two layers: broad low-opacity haze + narrow smoke core.
            // The geometry of the streak itself comes entirely from the velocity field.
            for (let k = 1; k < trail.length; k++) {
              const a = trail[k - 1];
              const b = trail[k];
              const f = k / (trail.length - 1);
              const mx = 0.5 * (a.x + b.x);
              const my = 0.5 * (a.y + b.y);
              const body = worldToBodyPoint({ x: mx, y: my }, alphaRad);
              const side = conditions.alphaDeg >= 0 ? 1 : -1;

              const nearAirfoil = Math.exp(-Math.pow((body.y - side * 0.08) / 0.15, 2));
              const downstream = sepX !== null && body.x > sepX
                ? smoothstep(sepX, sepX + 0.35, body.x) * Math.exp(-Math.pow(body.y / (0.22 + 0.08 * Math.max(0, body.x - sepX)), 2))
                : 0;
              const affected = clamp01(Math.max(nearAirfoil * smoothstep(-0.12, 0.02, body.x), downstream));

              // Stall colour is a diagnostic scalar, while the trajectory/shape remains
              // governed by the velocity field and reduced-order separated wake closure.
              let stallSignal = clamp01(results.stallProximity * affected);
              if (sepX !== null && body.x >= sepX && downstream > 0.18) {
                stallSignal = Math.max(stallSignal, 0.92 * downstream);
              }
              const tint = stallTint(stallSignal);

              const tail = Math.pow(f, 1.15);
              const alphaTrail = 0.045 + 0.22 * tail;
              const neutral = { r: 201, g: 216, b: 232 };
              const mix = clamp01(0.10 + 0.90 * affected);
              const r = Math.round(lerp(neutral.r, tint.r, mix));
              const g = Math.round(lerp(neutral.g, tint.g, mix));
              const bl = Math.round(lerp(neutral.b, tint.b, mix));

              const hazeWidth = Math.max(4.0, p.size * 3.0 * (zoom / 360));
              const coreWidth = Math.max(0.9, p.size * (0.75 + 0.8 * affected) * (zoom / 360));
              const px1 = toCanvasX(a.x);
              const py1 = toCanvasY(a.y);
              const px2 = toCanvasX(b.x);
              const py2 = toCanvasY(b.y);

              // Haze layer gives the smoke volume without making it look like a neon line.
              ctx.strokeStyle = `rgba(${r},${g},${bl},${alphaTrail * ageFade * 0.28})`;
              ctx.lineWidth = hazeWidth;
              ctx.beginPath();
              ctx.moveTo(px1, py1);
              ctx.lineTo(px2, py2);
              ctx.stroke();

              // Condensed smoke core.
              ctx.strokeStyle = `rgba(${Math.min(255,r+18)},${Math.min(255,g+18)},${Math.min(255,bl+18)},${alphaTrail * ageFade * 1.25})`;
              ctx.lineWidth = coreWidth;
              ctx.beginPath();
              ctx.moveTo(px1, py1);
              ctx.lineTo(px2, py2);
              ctx.stroke();
            }

            // A tiny inlet marker makes the smoke source read like a wind-tunnel rake.
            const px = toCanvasX(p.x);
            const py = toCanvasY(p.y);
            if (p.x < -0.62) {
              ctx.fillStyle = `rgba(226, 239, 250, ${0.12 * ageFade})`;
              ctx.beginPath();
              ctx.arc(px, py, Math.max(0.7, p.size * 0.55), 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Add a faint tunnel-wide flow ribbon layer. These are actual RK2 streamlines
          // from the same velocity field and help the eye read continuous flow direction.
          const ribbonYs = [-0.72, -0.56, -0.38, -0.20, 0.20, 0.38, 0.56, 0.72];
          for (const y0 of ribbonYs) {
            const line = traceStreamline(
              -0.76,
              y0,
              panels,
              sourceStrengths,
              gammaAirfoil,
              conditions,
              worldPoints,
              280,
              0.012
            ).points;
            if (line.length < 2) continue;
            ctx.strokeStyle = `rgba(188, 216, 235, ${Math.abs(y0) < 0.3 ? 0.055 : 0.035})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(toCanvasX(line[0].x), toCanvasY(line[0].y));
            for (let k = 1; k < line.length; k++) {
              ctx.lineTo(toCanvasX(line[k].x), toCanvasY(line[k].y));
            }
            ctx.stroke();
          }

          // Diagnostic legend. Colour indicates modeled stall proximity, NOT temperature.
          const legendX = width - 220;
          const legendY = 18;
          ctx.font = '9px monospace';
          ctx.fillStyle = 'rgba(148,163,184,0.75)';
          ctx.fillText('STALL PROXIMITY / SMOKE', legendX, legendY);
          const legendColors = [0, 0.30, 0.55, 0.78, 1].map(stallTint);
          for (let i = 0; i < legendColors.length; i++) {
            const c = legendColors[i];
            ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
            ctx.fillRect(legendX + i * 39, legendY + 8, 32, 4);
          }
          ctx.fillStyle = 'rgba(148,163,184,0.58)';
          ctx.fillText('free stream', legendX, legendY + 24);
          ctx.fillText('separation', legendX + 120, legendY + 24);
          ctx.restore();
        } else if (visMode === 'vectors') {
          // Velocity Vector Grid
          const nx = 20;
          const ny = 14;
          const arrowScale = 22 * (zoom / 360);

          for (let ix = 0; ix < nx; ix++) {
            const gx = -0.4 + (ix / (nx - 1)) * 1.8;
            for (let iy = 0; iy < ny; iy++) {
              const gy = -0.5 + (iy / (ny - 1)) * 1.0;
              const v = getOffBodyVelocityWorld(gx, gy, panels, sourceStrengths, gammaAirfoil, conditions);

              const speed = v.speed / conditions.vInf;
              const startX = toCanvasX(gx);
              const startY = toCanvasY(gy);
              const endX = startX + (v.u / conditions.vInf) * arrowScale;
              const endY = startY - (v.v / conditions.vInf) * arrowScale;

              // Color code vector by velocity ratio
              const hue = Math.max(0, Math.min(200, 200 - (speed - 0.5) * 150));
              ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.65)`;
              ctx.lineWidth = 1.2;

              ctx.beginPath();
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
              ctx.stroke();

              // Arrow tip
              ctx.fillStyle = `hsla(${hue}, 85%, 60%, 0.8)`;
              ctx.beginPath();
              ctx.arc(endX, endY, 1.5, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        } else if (visMode === 'pressure') {
          // Pressure Contours (Cp heatmap)
          const cols = 28;
          const rows = 18;
          const cellW = (2.2 / cols) * zoom;
          const cellH = (1.2 / rows) * zoom;

          for (let ix = 0; ix < cols; ix++) {
            const gx = -0.45 + (ix / cols) * 2.2;
            for (let iy = 0; iy < rows; iy++) {
              const gy = -0.6 + (iy / rows) * 1.2;
              const v = getOffBodyVelocityWorld(gx, gy, panels, sourceStrengths, gammaAirfoil, conditions);

              // Cp ranges typically from -3.0 (suction, high speed) to +1.0 (stagnation)
              // Blue for suction (negative Cp), Red for high pressure (positive Cp)
              const norm = Math.max(0, Math.min(1, (v.cp + 2.5) / 3.5));
              const r = Math.floor(255 * norm);
              const b = Math.floor(255 * (1 - norm));
              const g = Math.floor(80 * (1 - Math.abs(norm - 0.5) * 2));

              ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
              ctx.fillRect(toCanvasX(gx), toCanvasY(gy) - cellH, cellW + 1, cellH + 1);
            }
          }
        }
      }

      // 4. Draw Chord Line & Camber Line Overlay
      if (showCamberLine) {
        // Quarter-chord body axes after exact AoA rotation.
        const bodyLeading = bodyToWorldPoint({ x: 0, y: 0 }, visualAngleRad);
        const bodyTrailing = bodyToWorldPoint({ x: 1, y: 0 }, visualAngleRad);
        const pivot = bodyToWorldPoint({ x: 0.25, y: 0 }, visualAngleRad);

        ctx.strokeStyle = '#475569';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(bodyLeading.x), toCanvasY(bodyLeading.y));
        ctx.lineTo(toCanvasX(bodyTrailing.x), toCanvasY(bodyTrailing.y));
        ctx.stroke();
        ctx.setLineDash([]);

        // AoA measurement arc at quarter chord.
        if (Math.abs(alphaRad) > 1e-6) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(toCanvasX(pivot.x), toCanvasY(pivot.y), 28, 0, -alphaRad, alphaRad > 0);
          ctx.stroke();
          ctx.font = '10px monospace';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(`α ${conditions.alphaDeg >= 0 ? '+' : ''}${conditions.alphaDeg.toFixed(3)}°`, toCanvasX(pivot.x) + 33, toCanvasY(pivot.y) - 6);
        }

        // Flap hinge marker if deflected
        if (Math.abs(geometry.flapAngleDeg) > 0.01) {
          const hinge = bodyToWorldPoint({ x: geometry.flapHingeX, y: 0 }, visualAngleRad);
          ctx.strokeStyle = '#a855f7';
          ctx.beginPath();
          ctx.arc(toCanvasX(hinge.x), toCanvasY(hinge.y), 4, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }

      // 5. Render Airfoil Surface
      if (geometry.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(toCanvasX(worldPoints[0].x), toCanvasY(worldPoints[0].y));
        for (let i = 1; i < worldPoints.length; i++) {
          ctx.lineTo(toCanvasX(worldPoints[i].x), toCanvasY(worldPoints[i].y));
        }
        ctx.closePath();

        // Airfoil interior fill (aerospace stealth composite finish)
        const foilGrad = ctx.createLinearGradient(
          toCanvasX(worldPoints[0].x),
          toCanvasY(worldPoints[0].y),
          toCanvasX(worldPoints[worldPoints.length - 1].x),
          toCanvasY(worldPoints[worldPoints.length - 1].y)
        );
        foilGrad.addColorStop(0, '#131e33');
        foilGrad.addColorStop(1, '#0b1220');

        ctx.fillStyle = foilGrad;
        ctx.fill();

        // Airfoil boundary edge glow
        ctx.strokeStyle = results.isStalled ? '#ff3366' : '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = results.isStalled ? '#ff3366' : '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 6. Draw Individual Surface Panels & Normal Vectors
      if (showPanels && worldPanels.length > 0) {
        worldPanels.forEach((p, idx) => {
          // Panel node
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(toCanvasX(p.x1), toCanvasY(p.y1), 2, 0, 2 * Math.PI);
          ctx.fill();

          // Control point (midpoint)
          ctx.fillStyle = idx === 0 || idx === panels.length - 1 ? '#ffaa00' : '#38bdf8';
          ctx.beginPath();
          ctx.arc(toCanvasX(p.xc), toCanvasY(p.yc), 2.5, 0, 2 * Math.PI);
          ctx.fill();

          // Normal vector tick
          const normLen = 10;
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(toCanvasX(p.xc), toCanvasY(p.yc));
          ctx.lineTo(toCanvasX(p.xc) + p.nx * normLen, toCanvasY(p.yc) - p.ny * normLen);
          ctx.stroke();
        });
      }

      // 7. Center of Pressure (Xcp) & Lift Resultant Vector
      if (showCpIndicator && Math.abs(results.cl) > 0.05) {
        const cpWorld = bodyToWorldPoint({ x: results.xcp, y: 0 }, visualAngleRad);
        const xcpCanvas = toCanvasX(cpWorld.x);
        const ycpCanvas = toCanvasY(cpWorld.y);

        // Xcp marker
        ctx.fillStyle = '#00ff88';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(xcpCanvas, ycpCanvas, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Lift arrow originating from Xcp
        const arrowHeight = Math.max(30, Math.min(120, Math.abs(results.cl) * 65 * (zoom / 360)));
        const arrowDirection = results.cl >= 0 ? -1 : 1; // screen y is inverted
        const arrowTipY = ycpCanvas + arrowDirection * arrowHeight;

        ctx.strokeStyle = '#00ff88';
        ctx.fillStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xcpCanvas, ycpCanvas);
        ctx.lineTo(xcpCanvas, arrowTipY);
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(xcpCanvas, arrowTipY);
        ctx.lineTo(xcpCanvas - 6, arrowTipY - arrowDirection * 10);
        ctx.lineTo(xcpCanvas + 6, arrowTipY - arrowDirection * 10);
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`L = ${results.cl.toFixed(2)}`, xcpCanvas + 10, arrowTipY + 12);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`Xcp = ${(results.xcp * 100).toFixed(1)}%`, xcpCanvas + 10, ycpCanvas + 15);
      }

      // 8. Stall separation initiation marker and wake indicator
      if (results.isStalled) {
        const sepX =
          results.separationUpper ??
          Math.max(0.18, 0.7 - 0.04 * (Math.abs(conditions.alphaDeg) - 14));

        // Separation is solved in body coordinates, then transformed into the tunnel frame.
        let sepSurfaceY = conditions.alphaDeg >= 0 ? 0.08 : -0.08;
        if (geometry.points.length > 0) {
          const targetSign = conditions.alphaDeg >= 0 ? 1 : -1;
          const surfacePoint = geometry.points.reduce((best, curr) => {
            const sameSide = curr.y * targetSign >= -1e-5;
            if (!sameSide) return best;
            return Math.abs(curr.x - sepX) < Math.abs(best.x - sepX) ? curr : best;
          }, { x: sepX, y: sepSurfaceY });
          sepSurfaceY = surfacePoint.y;
        }

        const sepWorld = bodyToWorldPoint({ x: sepX, y: sepSurfaceY }, visualAngleRad);
        const sepCanvasX = toCanvasX(sepWorld.x);
        const sepCanvasY = toCanvasY(sepWorld.y);

        // Soft separated-flow envelope, aligned with the rotated airfoil.
        ctx.save();
        const bubble = bodyToWorldPoint({ x: Math.min(1.15, sepX + 0.28), y: conditions.alphaDeg >= 0 ? 0.25 : -0.25 }, visualAngleRad);
        ctx.fillStyle = 'rgba(255, 70, 110, 0.055)';
        ctx.beginPath();
        ctx.ellipse(toCanvasX(bubble.x), toCanvasY(bubble.y), 85, 42, alphaRad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();

        // Pulsing red separation initiation marker
        ctx.save();
        ctx.strokeStyle = '#ff1e46';
        ctx.fillStyle = '#ff1e46';
        ctx.shadowColor = '#ff1e46';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(sepCanvasX, sepCanvasY, 5.5, 0, 2 * Math.PI);
        ctx.fill();

        // Pulsing outer ripple
        const ripple = (performance.now() / 300) % 1;
        ctx.beginPath();
        ctx.arc(sepCanvasX, sepCanvasY, 6 + ripple * 14, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(255, 30, 70, ${1 - ripple})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Warning Callout Box above initiation point
        const calloutY = sepCanvasY - 45;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#ff1e46';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(sepCanvasX - 65, calloutY - 14, 130, 24, 6);
        ctx.fill();
        ctx.stroke();

        // Pointer tick line
        ctx.beginPath();
        ctx.moveTo(sepCanvasX, sepCanvasY - 5);
        ctx.lineTo(sepCanvasX, calloutY + 10);
        ctx.stroke();

        ctx.font = 'bold 9.5px monospace';
        ctx.fillStyle = '#ff3366';
        ctx.textAlign = 'center';
        ctx.fillText(`STALL INITIATED: ${(sepX * 100).toFixed(0)}%c`, sepCanvasX, calloutY + 2);
        ctx.textAlign = 'start';
        ctx.restore();
      }

      // Next frame
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    geometry,
    panels,
    results,
    conditions,
    sourceStrengths,
    gammaAirfoil,
    visMode,
    showPanels,
    showCamberLine,
    showCpIndicator,
    zoom,
    pan,
  ]);

  return (
    <div className="hud-panel rounded-2xl overflow-hidden border border-cyan-500/20 relative">
      {/* Canvas Header bar */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-slate-300 font-semibold">{geometry.name} FLOWFIELD SIMULATION</span>
          <span className="text-slate-500 hidden sm:inline">| Drag to Pan, Scroll to Zoom</span>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom((prev) => Math.min(900, prev * 1.2))}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((prev) => Math.max(150, prev * 0.8))}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetCamera}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Canvas */}
      <div className="relative cursor-grab active:cursor-grabbing w-full h-[450px] lg:h-[520px]">
        <canvas
          ref={canvasRef}
          width={1000}
          height={520}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full object-cover"
        />

        {/* Overlay Scale Ruler */}
        <div className="absolute bottom-3 left-4 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center gap-2 pointer-events-none">
          <span>Scale:</span>
          <div className="w-12 h-1 bg-cyan-400 rounded-full" />
          <span>c = 1.0 (Chord)</span>
        </div>

        {/* Active Mode Badge */}
        <div className="absolute top-3 right-4 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/30 text-[11px] font-mono text-cyan-300 pointer-events-none uppercase">
          MODE: {visMode}
        </div>
      </div>
    </div>
  );
};
