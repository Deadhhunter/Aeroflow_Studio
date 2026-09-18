import React from 'react';
import { AeroResults, FlowConditions } from '../types/aerodynamics';
import { Gauge, ShieldAlert, ArrowUpRight, Compass, ShieldCheck } from 'lucide-react';

interface AeroStatsHUDProps {
  results: AeroResults;
  conditions: FlowConditions;
}

export const AeroStatsHUD: React.FC<AeroStatsHUDProps> = ({ results, conditions }) => {
  const ldRatio = results.cd > 0 ? results.cl / results.cd : 0;
  const isStalled = results.isStalled;
  const stallProximity = results.stallProximity ?? (isStalled ? 1 : 0);
  const stallMargin = results.stallMarginDeg ?? 999;
  const flowLabel = isStalled
    ? 'STALL DETECTED'
    : stallProximity >= 0.75
      ? 'NEAR STALL'
      : stallProximity >= 0.35
        ? 'PRE-STALL'
        : 'ATTACHED FLOW';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {/* Lift Coefficient (Cl) */}
      <div className="hud-panel rounded-xl p-3 border border-cyan-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-mono tracking-wider font-semibold">LIFT COEFF</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono text-cyan-300 hud-glow">
            {results.cl >= 0 ? `+${results.cl.toFixed(3)}` : results.cl.toFixed(3)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">CL</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>Slope:</span>
          <span className="text-cyan-400">~0.11 / deg</span>
        </div>
        <div className="absolute top-0 right-0 w-8 h-8 bg-cyan-500/5 rounded-bl-full pointer-events-none" />
      </div>

      {/* Drag Coefficient (Cd) */}
      <div className="hud-panel rounded-xl p-3 border border-amber-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-mono tracking-wider font-semibold">DRAG COEFF</span>
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono text-amber-300 hud-glow-amber">
            {results.cd.toFixed(4)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">CD</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>Skin/Form:</span>
          <span className="text-amber-400">
            {(results.cdFriction * 1000).toFixed(1)} / {(results.cdPressure * 1000).toFixed(1)} cts
          </span>
        </div>
      </div>

      {/* Lift-to-Drag Ratio (L/D) */}
      <div className="hud-panel rounded-xl p-3 border border-emerald-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-mono tracking-wider font-semibold">EFFICIENCY</span>
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono text-emerald-300 hud-glow-green">
            {ldRatio.toFixed(1)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">L/D</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>Glide Ratio:</span>
          <span className="text-emerald-400">
            {ldRatio > 0 ? `${ldRatio.toFixed(1)} : 1` : 'N/A'}
          </span>
        </div>
      </div>

      {/* Pitching Moment (Cm_c/4) */}
      <div className="hud-panel rounded-xl p-3 border border-purple-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-mono tracking-wider font-semibold">MOMENT (c/4)</span>
          <span className="text-[10px] font-mono text-purple-400">AERO CTR</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono text-purple-300">
            {results.cmC4 >= 0 ? `+${results.cmC4.toFixed(4)}` : results.cmC4.toFixed(4)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Cm</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>Stability:</span>
          <span className={results.cmC4 < 0 ? 'text-emerald-400' : 'text-amber-400'}>
            {results.cmC4 < 0 ? 'Nose-down (Stable)' : 'Nose-up'}
          </span>
        </div>
      </div>

      {/* Center of Pressure (x_cp) */}
      <div className="hud-panel rounded-xl p-3 border border-blue-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-mono tracking-wider font-semibold">PRESSURE CTR</span>
          <span className="text-[10px] font-mono text-blue-400">Xcp / c</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold font-mono text-blue-300">
            {(results.xcp * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] text-slate-500 font-mono">chord</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>x/c:</span>
          <span className="text-blue-400">{results.xcp.toFixed(3)}</span>
        </div>
      </div>

      {/* Flow & Stall Status */}
      <div
        className={`hud-panel rounded-xl p-3 border relative overflow-hidden transition-colors ${
          isStalled
            ? 'border-red-500/50 bg-red-950/20'
            : stallProximity >= 0.75
              ? 'border-orange-400/40 bg-orange-950/10'
              : stallProximity >= 0.35
                ? 'border-yellow-400/30 bg-yellow-950/10'
                : 'border-emerald-500/30 bg-emerald-950/10'
        }`}
      >
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-mono tracking-wider font-semibold">FLOW REGIME</span>
          {isStalled ? (
            <ShieldAlert className="w-4 h-4 text-red-400 animate-bounce" />
          ) : stallProximity >= 0.75 ? (
            <ShieldAlert className="w-4 h-4 text-orange-300" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-xl font-bold font-mono ${
              isStalled ? 'text-red-400' : stallProximity >= 0.75 ? 'text-orange-300' : stallProximity >= 0.35 ? 'text-yellow-200' : 'text-emerald-300'
            }`}
          >
            {flowLabel}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>AoA / Re:</span>
          <span className="text-slate-300">
            {conditions.alphaDeg > 0 ? `+${conditions.alphaDeg}°` : `${conditions.alphaDeg}°`} | {(conditions.reynolds / 1e6).toFixed(1)}M
          </span>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-400 font-mono flex justify-between">
          <span>Stall margin:</span>
          <span className={stallMargin <= 0 ? 'text-red-400' : stallMargin <= 4.5 ? 'text-orange-300' : 'text-emerald-300'}>
            {stallMargin <= -0.05 ? `${Math.abs(stallMargin).toFixed(2)}° past` : `${Math.max(0, stallMargin).toFixed(2)}°`}
          </span>
        </div>
      </div>
    </div>
  );
};
