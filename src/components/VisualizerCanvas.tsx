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
import { getOffBodyVelocity } from '../physics/vortexPanelSolver';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

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

  // Smoke particles persistent pool
  const particlesRef = useRef<SmokeParticle[]>([]);

  // Initialize dense smoke particle rake
  useEffect(() => {
    const particles: SmokeParticle[] = [];
    const numRakes = 48;
    const particlesPerRake = 28;

    for (let i = 0; i < numRakes; i++) {
      // Non-linear clustering: more rakes close to the airfoil centerline y=0
      const norm = (i / (numRakes - 1)) * 2 - 1; // [-1, 1]
      const y0 = Math.sign(norm) * Math.pow(Math.abs(norm), 1.25) * 0.62;

      for (let j = 0; j < particlesPerRake; j++) {
        const x0 = -0.75 + (j / particlesPerRake) * 2.8 + (Math.random() - 0.5) * 0.05;
        const particleSize = 1.2 + Math.random() * 1.6;
        particles.push({
          x: x0,
          y: y0,
          prevX: x0,
          prevY: y0,
          vx: conditions.vInf,
          vy: 0,
          age: Math.random() * 2.8,
          life: 2.8 + Math.random() * 1.6,
          initialY: y0,
          size: particleSize,
        });
      }
    }
    particlesRef.current = particles;
  }, [conditions.vInf]);

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

      // 2. Draw Wind Direction Vector Arrow in top left
      const windLen = 35;
      const windAngleRad = (conditions.alphaDeg * Math.PI) / 180;
      const windStartX = 40;
      const windStartY = 45;
      const windEndX = windStartX + windLen * Math.cos(windAngleRad);
      const windEndY = windStartY - windLen * Math.sin(windAngleRad);

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
        `V∞ (α = ${conditions.alphaDeg > 0 ? `+${conditions.alphaDeg}°` : `${conditions.alphaDeg}°`})`,
        windStartX - 10,
        windStartY + 25
      );

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
              geometry.points,
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
          // Dense Luminous Smoke Wind Tunnel
          particlesRef.current = updateSmokeParticles(
            particlesRef.current,
            panels,
            sourceStrengths,
            gammaAirfoil,
            conditions,
            geometry.points,
            dt,
            results.isStalled,
            results.separationUpper
          );

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';

          const isStalled = results.isStalled;
          const sepX =
            results.separationUpper ??
            (isStalled ? Math.max(0.18, 0.7 - 0.04 * (Math.abs(conditions.alphaDeg) - 14)) : 1.5);

          for (const p of particlesRef.current) {
            const px = toCanvasX(p.x);
            const py = toCanvasY(p.y);
            const prevPx = toCanvasX(p.prevX);
            const prevPy = toCanvasY(p.prevY);

            const speedSq = p.vx * p.vx + p.vy * p.vy;
            const speedRatio = Math.min(2.5, Math.sqrt(speedSq) / conditions.vInf);

            // Smooth bell-curve alpha
            const lifeRatio = Math.min(1.0, p.age / p.life);
            let alpha = Math.sin(lifeRatio * Math.PI);
            if (p.x < -0.45) alpha *= Math.max(0.1, (p.x + 0.75) / 0.3);

            // Check if particle is inside the separated stall zone
            const isSeparatedParticle =
              isStalled &&
              p.x >= sepX &&
              ((conditions.alphaDeg >= 0 && p.y >= -0.05 && p.y <= 0.65) ||
                (conditions.alphaDeg < 0 && p.y <= 0.05 && p.y >= -0.65));

            let r = 180,
              g = 220,
              b = 255;

            if (isSeparatedParticle) {
              // TURNS RED IN STALL FLOW SEPARATION ZONE!
              r = 255;
              g = 25;
              b = 65;
              alpha = Math.min(1.0, alpha * 1.5);
            } else if (speedRatio > 1.15) {
              // Suction acceleration -> luminous cyan
              r = 0;
              g = 240;
              b = 255;
            } else if (speedRatio < 0.85) {
              // Stagnation deceleration -> warm amber
              r = 255;
              g = 160;
              b = 40;
            }

            // Draw silky smooth streakline segment
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${isSeparatedParticle ? alpha * 0.9 : alpha * 0.5})`;
            ctx.lineWidth = Math.max(isSeparatedParticle ? 2.0 : 1.2, p.size * (zoom / 360));
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(prevPx, prevPy);
            ctx.lineTo(px, py);
            ctx.stroke();

            // Glowing particle head
            const radius = Math.max(
              isSeparatedParticle ? 2.4 : 1.5,
              (p.size * (isSeparatedParticle ? 1.2 : 0.9)) * (zoom / 360)
            );
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.95})`;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, 2 * Math.PI);
            ctx.fill();
          }

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
              const v = getOffBodyVelocity(gx, gy, panels, sourceStrengths, gammaAirfoil, conditions);

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
              const v = getOffBodyVelocity(gx, gy, panels, sourceStrengths, gammaAirfoil, conditions);

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
        // Chord line: (0, 0) to (1, 0)
        ctx.strokeStyle = '#475569';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), toCanvasY(0));
        ctx.lineTo(toCanvasX(1), toCanvasY(0));
        ctx.stroke();
        ctx.setLineDash([]);

        // Flap hinge line if deflected
        if (Math.abs(geometry.flapAngleDeg) > 0.01) {
          ctx.strokeStyle = '#a855f7';
          ctx.beginPath();
          ctx.arc(toCanvasX(geometry.flapHingeX), toCanvasY(0), 4, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }

      // 5. Render Airfoil Surface
      if (geometry.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(toCanvasX(geometry.points[0].x), toCanvasY(geometry.points[0].y));
        for (let i = 1; i < geometry.points.length; i++) {
          ctx.lineTo(toCanvasX(geometry.points[i].x), toCanvasY(geometry.points[i].y));
        }
        ctx.closePath();

        // Airfoil interior fill (aerospace stealth composite finish)
        const foilGrad = ctx.createLinearGradient(
          toCanvasX(0),
          toCanvasY(0.2),
          toCanvasX(1),
          toCanvasY(-0.2)
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
      if (showPanels && panels.length > 0) {
        panels.forEach((p, idx) => {
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
        const xcpCanvas = toCanvasX(results.xcp);
        const ycpCanvas = toCanvasY(0);

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

        // Find surface y at separation x
        let sepSurfaceY = 0.08;
        if (geometry.points.length > 0) {
          const closestPt = geometry.points.reduce((prev, curr) =>
            Math.abs(curr.x - sepX) < Math.abs(prev.x - sepX) && curr.y > 0 ? curr : prev
          );
          sepSurfaceY = closestPt.y;
        }

        const sepCanvasX = toCanvasX(sepX);
        const sepCanvasY = toCanvasY(conditions.alphaDeg >= 0 ? sepSurfaceY : -sepSurfaceY);

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
