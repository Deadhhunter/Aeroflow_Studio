import React, { useState, useCallback } from 'react';
import { AirfoilGeometry, FlowConditions, VisualizationMode } from '../types/aerodynamics';
import { Sliders, Waves, Wind, Compass, Sparkles } from 'lucide-react';

interface ControlPanelProps {
  geometry: AirfoilGeometry;
  conditions: FlowConditions;
  numPanels: number;
  visMode: VisualizationMode;
  showPanels: boolean;
  showCamberLine: boolean;
  showCpIndicator: boolean;
  onUpdateGeometry: (newGeom: Partial<AirfoilGeometry>) => void;
  onUpdateConditions: (newCond: Partial<FlowConditions>) => void;
  onUpdateNumPanels: (n: number) => void;
  onUpdateVisMode: (mode: VisualizationMode) => void;
  onToggleShowPanels: () => void;
  onToggleShowCamber: () => void;
  onToggleShowCpIndicator: () => void;
}

/**
 * Reusable dual-mode control: slider + exact numeric input together.
 * Clicking the value badge makes it editable.
 */
function PrecisionControl({
  label,
  value,
  min,
  max,
  step,
  displayFn,
  onChange,
  color = 'cyan',
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayFn: (v: number) => string;
  onChange: (v: number) => void;
  color?: 'cyan' | 'amber' | 'purple' | 'emerald' | 'slate';
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);

  const colorClass: Record<string, string> = {
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    slate: 'text-slate-300',
  };

  const borderClass: Record<string, string> = {
    cyan: 'border-cyan-500/50 focus:border-cyan-400',
    amber: 'border-amber-500/50 focus:border-amber-400',
    purple: 'border-purple-500/50 focus:border-purple-400',
    emerald: 'border-emerald-500/50 focus:border-emerald-400',
    slate: 'border-slate-600 focus:border-slate-400',
  };

  const commitEdit = useCallback(
    (raw: string) => {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = Math.min(max, Math.max(min, parsed));
        onChange(clamped);
      }
      setEditing(false);
    },
    [min, max, onChange]
  );

  return (
    <div>
      <div className="flex justify-between items-center text-xs font-mono mb-1">
        <span className="text-slate-300">{label}</span>
        {editing ? (
          <input
            autoFocus
            type="number"
            step={step}
            min={min}
            max={max}
            defaultValue={value}
            className={`w-24 bg-slate-950 border rounded px-1.5 py-0.5 text-right text-xs font-mono outline-none ${borderClass[color]} ${colorClass[color]}`}
            onBlur={(e) => commitEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Click to type exact value"
            className={`font-bold ${colorClass[color]} hover:underline cursor-text border-b border-dashed border-current/30 tabular-nums`}
          >
            {displayFn(value)}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      {hint && (
        <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-0.5">
          {hint.split('|').map((h, i) => (
            <span key={i}>{h.trim()}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  geometry,
  conditions,
  numPanels,
  visMode,
  showPanels,
  showCamberLine,
  showCpIndicator,
  onUpdateGeometry,
  onUpdateConditions,
  onUpdateNumPanels,
  onUpdateVisMode,
  onToggleShowPanels,
  onToggleShowCamber,
  onToggleShowCpIndicator,
}) => {
  return (
    <div className="hud-panel rounded-2xl p-4 lg:p-5 border border-cyan-500/20 flex flex-col gap-5">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm font-semibold">
          <Sliders className="w-4 h-4" />
          <span>FLIGHT &amp; GEOMETRY CONTROLS</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 bg-emerald-900/20 border border-emerald-700/30 text-emerald-400 px-2 py-0.5 rounded-full">
          REALTIME SOLVER
        </span>
      </div>

      {/* ── Section 1: Aerodynamic Conditions ── */}
      <div className="space-y-3.5">
        <h3 className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
          1 — Aerodynamic Conditions
        </h3>

        <PrecisionControl
          label="Angle of Attack (α):"
          value={conditions.alphaDeg}
          min={-18}
          max={25}
          step={0.01}
          displayFn={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}°`}
          onChange={(v) => onUpdateConditions({ alphaDeg: v })}
          color="cyan"
          hint="-18° | 0° | +10° | +25°"
        />
        <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
          <span className="text-slate-600">Body/tunnel transform</span>
          <span className="text-cyan-300 tabular-nums">α = {((conditions.alphaDeg * Math.PI) / 180).toFixed(7)} rad</span>
        </div>

        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-1">
            <span className="text-slate-300">Reynolds Number (Re):</span>
            <span className="text-amber-400 font-bold tabular-nums">
              {conditions.reynolds >= 1e6
                ? `${(conditions.reynolds / 1e6).toFixed(3)} × 10⁶`
                : `${(conditions.reynolds / 1e3).toFixed(1)} k`}
            </span>
          </div>
          <input
            type="range"
            min={4.0}
            max={7.0}
            step={0.01}
            value={Math.log10(conditions.reynolds)}
            onChange={(e) => onUpdateConditions({ reynolds: Math.pow(10, parseFloat(e.target.value)) })}
            className="w-full"
          />
          {/* Precise Re input */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] text-slate-500 font-mono">Re =</span>
            <input
              type="number"
              step="10000"
              min="10000"
              max="10000000"
              value={Math.round(conditions.reynolds)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1e4 && v <= 1e7) onUpdateConditions({ reynolds: v });
              }}
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-right text-[11px] font-mono text-amber-400 outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-slate-500 font-mono">Re</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-0.5">
            <span>10 k</span>
            <span>100 k</span>
            <span>1 M</span>
            <span>10 M</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: Airfoil Geometry ── */}
      <div className="space-y-3.5 pt-3 border-t border-slate-800">
        <h3 className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
          2 — Airfoil Geometry Parameters
        </h3>
        <p className="text-[10px] text-slate-600 font-mono -mt-1">
          Click any value to type an exact number (press Enter to confirm).
        </p>

        <PrecisionControl
          label="Max Camber (m):"
          value={geometry.camber}
          min={0}
          max={0.095}
          step={0.001}
          displayFn={(v) => `${(v * 100).toFixed(2)}% c`}
          onChange={(v) => onUpdateGeometry({ camber: v })}
          color="cyan"
          hint="0% | 2% | 5% | 9.5%"
        />

        <PrecisionControl
          label="Camber Position (p):"
          value={geometry.camberPos}
          min={0.05}
          max={0.90}
          step={0.01}
          displayFn={(v) => `${(v * 100).toFixed(1)}% c`}
          onChange={(v) => onUpdateGeometry({ camberPos: v })}
          color="cyan"
          hint="5% | 20% | 40% | 90%"
        />

        <PrecisionControl
          label="Max Thickness (t):"
          value={geometry.thickness}
          min={0.02}
          max={0.35}
          step={0.001}
          displayFn={(v) => `${(v * 100).toFixed(2)}% c`}
          onChange={(v) => onUpdateGeometry({ thickness: v })}
          color="cyan"
          hint="2% | 9% | 15% | 35%"
        />

        <PrecisionControl
          label="TE Flap Deflection (δf):"
          value={geometry.flapAngleDeg}
          min={-20}
          max={40}
          step={0.5}
          displayFn={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`}
          onChange={(v) => onUpdateGeometry({ flapAngleDeg: v })}
          color="purple"
          hint="-20° (up) | 0° | +40° (down)"
        />

        <PrecisionControl
          label="Flap Hinge Location (x/c):"
          value={geometry.flapHingeX}
          min={0.4}
          max={0.95}
          step={0.01}
          displayFn={(v) => `${(v * 100).toFixed(1)}% c`}
          onChange={(v) => onUpdateGeometry({ flapHingeX: v })}
          color="purple"
          hint="40% | 60% | 75% | 95%"
        />

        <div>
          <div className="flex justify-between items-center text-xs font-mono mb-1">
            <span className="text-slate-300">Surface Panels (N):</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onUpdateNumPanels(Math.max(20, numPanels - 10))}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center"
              >-</button>
              <input
                type="number"
                step="2"
                min="20"
                max="200"
                value={numPanels}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 20 && v <= 200) onUpdateNumPanels(v % 2 === 0 ? v : v + 1);
                }}
                className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-slate-300 outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => onUpdateNumPanels(Math.min(200, numPanels + 10))}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center"
              >+</button>
            </div>
          </div>
          <input
            type="range"
            min={20}
            max={200}
            step={2}
            value={numPanels}
            onChange={(e) => onUpdateNumPanels(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-0.5">
            <span>20 (fast)</span>
            <span>80 (default)</span>
            <span>200 (precise)</span>
          </div>
        </div>
      </div>

      {/* ── Section 3: Visualization Modes ── */}
      <div className="space-y-2 pt-3 border-t border-slate-800">
        <h3 className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase">
          3 — Flowfield Visualization Mode
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          {(
            [
              { mode: 'smoke', icon: <Sparkles className="w-3.5 h-3.5" />, label: 'Smoke Tunnel' },
              { mode: 'streamlines', icon: <Waves className="w-3.5 h-3.5" />, label: 'Streamlines' },
              { mode: 'vectors', icon: <Compass className="w-3.5 h-3.5" />, label: 'Velocity Grid' },
              { mode: 'pressure', icon: <Wind className="w-3.5 h-3.5" />, label: 'Cp Contours' },
            ] as { mode: VisualizationMode; icon: React.ReactNode; label: string }[]
          ).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => onUpdateVisMode(mode)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border transition ${
                visMode === mode
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-semibold shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <span className="text-cyan-400">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 4: Overlays ── */}
      <div className="space-y-1.5 pt-3 border-t border-slate-800">
        <h3 className="text-[10px] font-mono font-bold tracking-widest text-slate-500 uppercase mb-2">
          4 — Overlays &amp; Diagnostics
        </h3>

        {[
          { label: `Show Panel Discretization (N=${numPanels})`, checked: showPanels, onToggle: onToggleShowPanels },
          { label: 'Show Chord & Camber Line', checked: showCamberLine, onToggle: onToggleShowCamber },
          { label: 'Show Center of Pressure (Xcp)', checked: showCpIndicator, onToggle: onToggleShowCpIndicator },
        ].map(({ label, checked, onToggle }) => (
          <label
            key={label}
            className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer hover:text-slate-100 transition"
          >
            <div
              onClick={onToggle}
              className={`w-8 h-4 rounded-full flex items-center transition-colors relative cursor-pointer ${
                checked ? 'bg-cyan-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`absolute w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  checked ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span onClick={onToggle}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
