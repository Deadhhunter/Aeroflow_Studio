import React from 'react';
import { Wind, Download, BookOpen, Activity, ChevronDown } from 'lucide-react';
import { AIRFOIL_PRESETS } from '../physics/nacaGenerator';
import { AirfoilGeometry, PolarPoint } from '../types/aerodynamics';

interface HeaderProps {
  currentCode: string;
  onSelectPreset: (code: string) => void;
  onOpenTheory: () => void;
  geometry: AirfoilGeometry;
  polars: PolarPoint[];
}

export const Header: React.FC<HeaderProps> = ({
  currentCode,
  onSelectPreset,
  onOpenTheory,
  geometry,
  polars,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  // Export airfoil coordinates as standard Selig format .dat file
  const exportDatFile = () => {
    let content = `${geometry.name}\n`;
    geometry.points.forEach((p) => {
      content += `   ${p.x.toFixed(6)}   ${p.y.toFixed(6)}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${geometry.name.replace(/\s+/g, '_')}.dat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export polars as CSV
  const exportPolarCsv = () => {
    let csv = 'alpha_deg,Cl,Cd,Cm_c4,L_over_D\n';
    polars.forEach((p) => {
      csv += `${p.alpha.toFixed(2)},${p.cl.toFixed(5)},${p.cd.toFixed(5)},${p.cm.toFixed(5)},${p.ld.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${geometry.name.replace(/\s+/g, '_')}_polars.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="border-b border-cyan-500/20 bg-[#0a0f18]/90 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Wind className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-mono flex items-center gap-1.5">
                AERO<span className="text-cyan-400">FLOW</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-sans font-medium">
                  STUDIO v1.0
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              2D Vortex Panel Aerodynamics & Viscous Boundary Layer Solver
            </p>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-mono hidden sm:inline-block">PRESET:</label>
          <div className="relative">
            <select
              value={currentCode}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="bg-slate-900 border border-cyan-500/30 text-cyan-300 text-xs font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              {AIRFOIL_PRESETS.map((preset) => (
                <option key={preset.code} value={preset.code}>
                  {preset.name} — {preset.desc.split(' ')[0]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Solver Status indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>SOLVER: ONLINE</span>
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-lg bg-slate-900 border border-slate-700 shadow-xl py-1 z-50 text-xs font-sans"
                onMouseLeave={() => setDropdownOpen(false)}
              >
                <button
                  onClick={() => {
                    exportDatFile();
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 flex flex-col"
                >
                  <span className="font-semibold">Coordinates (.DAT)</span>
                  <span className="text-[10px] text-slate-500">XFOIL & CAD Selig format</span>
                </button>
                <button
                  onClick={() => {
                    exportPolarCsv();
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 flex flex-col"
                >
                  <span className="font-semibold">Aero Polars (.CSV)</span>
                  <span className="text-[10px] text-slate-500">Cl, Cd, Cm vs alpha data</span>
                </button>
              </div>
            )}
          </div>

          {/* Theory / Equations Button */}
          <button
            onClick={onOpenTheory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-medium transition"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Theory & Math</span>
          </button>
        </div>
      </div>
    </header>
  );
};
