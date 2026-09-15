import React, { useState } from 'react';
import { Panel } from '../types/aerodynamics';

interface CpDistributionPlotProps {
  panels: Panel[];
  cl: number;
}

export const CpDistributionPlot: React.FC<CpDistributionPlotProps> = ({ panels, cl }) => {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; cp: number; surface: string } | null>(null);

  if (panels.length === 0) return null;

  const N = panels.length;
  const halfN = Math.floor(N / 2);

  // Upper surface panels: 0 to halfN (from TE to LE)
  // Lower surface panels: halfN to N (from LE to TE)
  const upperPanels = panels.slice(0, halfN).reverse(); // reverse so x goes 0 -> 1
  const lowerPanels = panels.slice(halfN); // x goes 0 -> 1

  // Find min and max Cp for scaling (invert Y axis: negative Cp on top)
  let minCp = -1.5;
  let maxCp = 1.0;
  panels.forEach((p) => {
    if (p.cp < minCp) minCp = Math.max(-4.0, p.cp);
    if (p.cp > maxCp) maxCp = Math.min(2.0, p.cp);
  });

  // Plot canvas dimensions
  const width = 500;
  const height = 240;
  const padLeft = 50;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 35;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Scale functions
  // x/c from 0.0 to 1.0
  const scaleX = (x: number) => padLeft + Math.max(0, Math.min(1, x)) * plotW;
  // Inverted Cp: more negative Cp -> top (smaller y in SVG)
  const scaleY = (cp: number) => padTop + ((cp - minCp) / (maxCp - minCp)) * plotH;

  // Build SVG path strings
  const buildPath = (pts: Panel[]) => {
    if (pts.length === 0) return '';
    let d = `M ${scaleX(pts[0].xc)} ${scaleY(pts[0].cp)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${scaleX(pts[i].xc)} ${scaleY(pts[i].cp)}`;
    }
    return d;
  };

  const upperPath = buildPath(upperPanels);
  const lowerPath = buildPath(lowerPanels);

  // Cp = 0 reference line
  const zeroCpY = scaleY(0);

  return (
    <div className="hud-panel rounded-2xl p-4 border border-cyan-500/20 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-slate-300">
            PRESSURE COEFFICIENT DISTRIBUTION (-Cp vs x/c)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="w-2.5 h-0.5 bg-cyan-400 rounded-full" /> Upper (Suction)
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-0.5 bg-amber-400 rounded-full" /> Lower (Pressure)
          </span>
        </div>
      </div>

      <div className="relative w-full aspect-[2/1] max-h-[260px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full select-none"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Background Grid */}
          <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="#0b121e" rx="6" />

          {/* Vertical grid lines (x/c = 0.2, 0.4, 0.6, 0.8, 1.0) */}
          {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((x) => (
            <g key={x}>
              <line
                x1={scaleX(x)}
                y1={padTop}
                x2={scaleX(x)}
                y2={padTop + plotH}
                stroke="#1e293b"
                strokeDasharray="2,2"
              />
              <text
                x={scaleX(x)}
                y={padTop + plotH + 16}
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {x.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Horizontal grid lines for Cp */}
          {[-3, -2, -1, 0, 1].map((cpVal) => {
            if (cpVal < minCp || cpVal > maxCp) return null;
            const y = scaleY(cpVal);
            return (
              <g key={cpVal}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke={cpVal === 0 ? '#334155' : '#1e293b'}
                  strokeWidth={cpVal === 0 ? 1.5 : 1}
                  strokeDasharray={cpVal === 0 ? '' : '2,2'}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  fill={cpVal === 0 ? '#94a3b8' : '#64748b'}
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {cpVal > 0 ? `+${cpVal}` : cpVal}
                </text>
              </g>
            );
          })}

          {/* Zero Cp baseline indicator */}
          {zeroCpY >= padTop && zeroCpY <= padTop + plotH && (
            <line
              x1={padLeft}
              y1={zeroCpY}
              x2={padLeft + plotW}
              y2={zeroCpY}
              stroke="#00f0ff22"
              strokeWidth="1.5"
            />
          )}

          {/* Upper Surface Curve (Suction) */}
          <path
            d={upperPath}
            fill="none"
            stroke="#00f0ff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Lower Surface Curve (Pressure) */}
          <path
            d={lowerPath}
            fill="none"
            stroke="#ffaa00"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive node hover targets */}
          {upperPanels.map((p, i) => (
            <circle
              key={`u-${i}`}
              cx={scaleX(p.xc)}
              cy={scaleY(p.cp)}
              r="3.5"
              className="fill-transparent hover:fill-cyan-400 cursor-pointer transition"
              onMouseEnter={() => setHoveredPoint({ x: p.xc, cp: p.cp, surface: 'Upper (Suction)' })}
            />
          ))}

          {lowerPanels.map((p, i) => (
            <circle
              key={`l-${i}`}
              cx={scaleX(p.xc)}
              cy={scaleY(p.cp)}
              r="3.5"
              className="fill-transparent hover:fill-amber-400 cursor-pointer transition"
              onMouseEnter={() => setHoveredPoint({ x: p.xc, cp: p.cp, surface: 'Lower (Pressure)' })}
            />
          ))}

          {/* Axis Labels */}
          <text
            x={padLeft + plotW / 2}
            y={height - 5}
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            Chordwise Position (x / c)
          </text>

          <text
            x={15}
            y={padTop + plotH / 2}
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
            transform={`rotate(-90 15 ${padTop + plotH / 2})`}
          >
            Pressure Coefficient (Cp)
          </text>
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div className="absolute top-2 right-4 bg-slate-900/95 border border-cyan-500/40 px-2.5 py-1.5 rounded-lg text-[11px] font-mono shadow-xl pointer-events-none">
            <div className="text-slate-400">{hoveredPoint.surface}</div>
            <div className="text-cyan-300 font-bold">
              x/c: {hoveredPoint.x.toFixed(3)} | Cp: {hoveredPoint.cp.toFixed(3)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-[10px] text-slate-500 font-mono flex justify-between">
        <span>* Inverted axis convention: Suction peak points upward</span>
        <span className="text-cyan-400">Loop Area ∝ CL ({cl.toFixed(2)})</span>
      </div>
    </div>
  );
};
