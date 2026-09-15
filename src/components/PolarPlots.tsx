import React, { useState } from 'react';
import { PolarPoint } from '../types/aerodynamics';

interface PolarPlotsProps {
  polars: PolarPoint[];
  currentAlpha: number;
  currentCl: number;
  currentCd: number;
}

type PolarTab = 'lift' | 'drag' | 'efficiency';

export const PolarPlots: React.FC<PolarPlotsProps> = ({
  polars,
  currentAlpha,
  currentCl,
  currentCd,
}) => {
  const [activeTab, setActiveTab] = useState<PolarTab>('lift');

  if (polars.length === 0) return null;

  const width = 500;
  const height = 240;
  const padLeft = 50;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 35;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Max and min bounds based on active polar tab
  let minX = -10;
  let maxX = 20;
  let minY = -0.5;
  let maxY = 1.8;

  if (activeTab === 'lift') {
    minX = -10;
    maxX = 20;
    minY = -0.6;
    maxY = 1.8;
  } else if (activeTab === 'drag') {
    // CD vs CL (drag polar)
    minX = 0.0;
    maxX = 0.08;
    minY = -0.6;
    maxY = 1.8;
  } else if (activeTab === 'efficiency') {
    // L/D vs alpha
    minX = -10;
    maxX = 20;
    minY = -20;
    maxY = 70;
  }

  const scaleX = (val: number) => padLeft + ((val - minX) / (maxX - minX)) * plotW;
  const scaleY = (val: number) => padTop + plotH - ((val - minY) / (maxY - minY)) * plotH;

  // Build SVG path
  let pathD = '';
  polars.forEach((pt, i) => {
    let px = 0;
    let py = 0;
    if (activeTab === 'lift') {
      px = scaleX(pt.alpha);
      py = scaleY(pt.cl);
    } else if (activeTab === 'drag') {
      px = scaleX(pt.cd);
      py = scaleY(pt.cl);
    } else {
      px = scaleX(pt.alpha);
      py = scaleY(Math.max(-20, Math.min(80, pt.ld)));
    }

    if (i === 0) {
      pathD += `M ${px} ${py}`;
    } else {
      pathD += ` L ${px} ${py}`;
    }
  });

  // Current operating point coordinates
  let curX = scaleX(currentAlpha);
  let curY = scaleY(currentCl);
  if (activeTab === 'drag') {
    curX = scaleX(currentCd);
    curY = scaleY(currentCl);
  } else if (activeTab === 'efficiency') {
    const curLd = currentCd > 0 ? currentCl / currentCd : 0;
    curX = scaleX(currentAlpha);
    curY = scaleY(Math.max(-20, Math.min(80, curLd)));
  }

  // Find max L/D
  let maxLd = 0;
  let maxLdAlpha = 0;
  polars.forEach((p) => {
    if (p.ld > maxLd && p.alpha > 0) {
      maxLd = p.ld;
      maxLdAlpha = p.alpha;
    }
  });

  return (
    <div className="hud-panel rounded-2xl p-4 border border-cyan-500/20 flex flex-col justify-between">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('lift')}
            className={`px-2.5 py-1 rounded transition ${
              activeTab === 'lift'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            CL vs α
          </button>
          <button
            onClick={() => setActiveTab('drag')}
            className={`px-2.5 py-1 rounded transition ${
              activeTab === 'drag'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            CL vs CD
          </button>
          <button
            onClick={() => setActiveTab('efficiency')}
            className={`px-2.5 py-1 rounded transition ${
              activeTab === 'efficiency'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            L/D vs α
          </button>
        </div>

        <div className="text-[11px] font-mono text-emerald-400">
          (L/D)max: <span className="font-bold">{maxLd.toFixed(1)}</span> @ α={maxLdAlpha.toFixed(1)}°
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full aspect-[2/1] max-h-[260px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none">
          {/* Background Grid */}
          <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="#0b121e" rx="6" />

          {/* Grid lines */}
          {activeTab === 'lift' && (
            <>
              {[-10, -5, 0, 5, 10, 15, 20].map((a) => (
                <g key={a}>
                  <line
                    x1={scaleX(a)}
                    y1={padTop}
                    x2={scaleX(a)}
                    y2={padTop + plotH}
                    stroke={a === 0 ? '#334155' : '#1e293b'}
                    strokeDasharray={a === 0 ? '' : '2,2'}
                  />
                  <text
                    x={scaleX(a)}
                    y={padTop + plotH + 16}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {a}°
                  </text>
                </g>
              ))}

              {[-0.5, 0.0, 0.5, 1.0, 1.5].map((c) => (
                <g key={c}>
                  <line
                    x1={padLeft}
                    y1={scaleY(c)}
                    x2={padLeft + plotW}
                    y2={scaleY(c)}
                    stroke={c === 0 ? '#334155' : '#1e293b'}
                    strokeDasharray={c === 0 ? '' : '2,2'}
                  />
                  <text
                    x={padLeft - 8}
                    y={scaleY(c) + 3}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {c.toFixed(1)}
                  </text>
                </g>
              ))}

              {/* Thin Airfoil Theory Reference Slope: dCL/dalpha = 2pi */}
              <line
                x1={scaleX(-5)}
                y1={scaleY(-5 * 0.1097)}
                x2={scaleX(12)}
                y2={scaleY(12 * 0.1097)}
                stroke="#64748b"
                strokeWidth="1.2"
                strokeDasharray="4,4"
              />
            </>
          )}

          {activeTab === 'drag' && (
            <>
              {[0.01, 0.02, 0.04, 0.06, 0.08].map((cd) => (
                <g key={cd}>
                  <line
                    x1={scaleX(cd)}
                    y1={padTop}
                    x2={scaleX(cd)}
                    y2={padTop + plotH}
                    stroke="#1e293b"
                    strokeDasharray="2,2"
                  />
                  <text
                    x={scaleX(cd)}
                    y={padTop + plotH + 16}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {cd.toFixed(2)}
                  </text>
                </g>
              ))}

              {[-0.5, 0.0, 0.5, 1.0, 1.5].map((c) => (
                <g key={c}>
                  <line
                    x1={padLeft}
                    y1={scaleY(c)}
                    x2={padLeft + plotW}
                    y2={scaleY(c)}
                    stroke={c === 0 ? '#334155' : '#1e293b'}
                    strokeDasharray={c === 0 ? '' : '2,2'}
                  />
                  <text
                    x={padLeft - 8}
                    y={scaleY(c) + 3}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {c.toFixed(1)}
                  </text>
                </g>
              ))}
            </>
          )}

          {activeTab === 'efficiency' && (
            <>
              {[-10, 0, 10, 20].map((a) => (
                <g key={a}>
                  <line
                    x1={scaleX(a)}
                    y1={padTop}
                    x2={scaleX(a)}
                    y2={padTop + plotH}
                    stroke={a === 0 ? '#334155' : '#1e293b'}
                    strokeDasharray={a === 0 ? '' : '2,2'}
                  />
                  <text
                    x={scaleX(a)}
                    y={padTop + plotH + 16}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {a}°
                  </text>
                </g>
              ))}

              {[0, 20, 40, 60].map((ld) => (
                <g key={ld}>
                  <line
                    x1={padLeft}
                    y1={scaleY(ld)}
                    x2={padLeft + plotW}
                    y2={scaleY(ld)}
                    stroke={ld === 0 ? '#334155' : '#1e293b'}
                    strokeDasharray={ld === 0 ? '' : '2,2'}
                  />
                  <text
                    x={padLeft - 8}
                    y={scaleY(ld) + 3}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {ld}
                  </text>
                </g>
              ))}
            </>
          )}

          {/* Polar Curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#00f0ff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Current Operating Point Marker */}
          {curX >= padLeft && curX <= padLeft + plotW && curY >= padTop && curY <= padTop + plotH && (
            <g>
              <circle cx={curX} cy={curY} r="7" fill="none" stroke="#00ff88" strokeWidth="2" className="animate-ping" />
              <circle cx={curX} cy={curY} r="4.5" fill="#00ff88" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          )}

          {/* Axis Labels */}
          <text
            x={padLeft + plotW / 2}
            y={height - 5}
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            textAnchor="middle"
          >
            {activeTab === 'drag' ? 'Drag Coefficient (CD)' : 'Angle of Attack α (deg)'}
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
            {activeTab === 'efficiency' ? 'Efficiency (L / D)' : 'Lift Coefficient (CL)'}
          </text>
        </svg>
      </div>

      <div className="mt-2 text-[10px] text-slate-500 font-mono flex justify-between">
        <span>* Dashed line: Thin Airfoil Theory ideal slope (2π)</span>
        <span className="text-emerald-400">Pulsing dot: Current Operating State</span>
      </div>
    </div>
  );
};
