import { useState, useMemo } from 'react';
import { generateNaca4 } from './physics/nacaGenerator';
import { solveVortexPanels } from './physics/vortexPanelSolver';
import { computeBoundaryLayerAndDrag } from './physics/boundaryLayer';
import {
  FlowConditions,
  VisualizationMode,
  PolarPoint,
} from './types/aerodynamics';
import { Header } from './components/Header';
import { AeroStatsHUD } from './components/AeroStatsHUD';
import { ControlPanel } from './components/ControlPanel';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import { CpDistributionPlot } from './components/CpDistributionPlot';
import { PolarPlots } from './components/PolarPlots';
import { TheoryModal } from './components/TheoryModal';

export function App() {
  // Preset or custom NACA code
  const [nacaCode, setNacaCode] = useState<string>('2412');
  const [numPanels, setNumPanels] = useState<number>(80);

  // Flight & Flow conditions
  const [conditions, setConditions] = useState<FlowConditions>({
    alphaDeg: 4.0,
    vInf: 15.0,
    reynolds: 1.0e6,
  });

  // Geometry custom overrides (camber, position, thickness, flap)
  const [camber, setCamber] = useState<number>(0.02);
  const [camberPos, setCamberPos] = useState<number>(0.4);
  const [thickness, setThickness] = useState<number>(0.12);
  const [flapAngleDeg, setFlapAngleDeg] = useState<number>(0);
  const [flapHingeX, setFlapHingeX] = useState<number>(0.75);

  // Visualization modes & overlays
  const [visMode, setVisMode] = useState<VisualizationMode>('smoke');
  const [showPanels, setShowPanels] = useState<boolean>(false);
  const [showCamberLine, setShowCamberLine] = useState<boolean>(true);
  const [showCpIndicator, setShowCpIndicator] = useState<boolean>(true);
  const [isTheoryOpen, setIsTheoryOpen] = useState<boolean>(false);

  // When a preset is chosen, update parameters
  const handleSelectPreset = (code: string) => {
    setNacaCode(code);
    const m = parseInt(code[0], 10) / 100;
    const p = parseInt(code[1], 10) / 10;
    const t = parseInt(code.slice(2, 4), 10) / 100;
    setCamber(m);
    setCamberPos(p);
    setThickness(t);
  };

  // Generate current geometry & panels using continuous high-precision parameters
  const { geometry, panels } = useMemo(() => {
    return generateNaca4(
      { m: camber, p: camberPos, t: thickness },
      numPanels,
      flapAngleDeg,
      flapHingeX
    );
  }, [camber, camberPos, thickness, numPanels, flapAngleDeg, flapHingeX]);

  // Solve current operating point
  const { results, sourceStrengths, gammaAirfoil } = useMemo(() => {
    // 1. Solve inviscid potential flow
    const inviscid = solveVortexPanels(panels, conditions);
    // 2. Solve viscous boundary layer & profile drag
    const viscousResults = computeBoundaryLayerAndDrag(panels, inviscid.results, conditions);

    return {
      results: viscousResults,
      sourceStrengths: inviscid.sourceStrengths,
      gammaAirfoil: inviscid.gammaAirfoil,
    };
  }, [panels, conditions]);

  // Compute full aerodynamic polar curve sweep
  const polars: PolarPoint[] = useMemo(() => {
    const sweep: PolarPoint[] = [];
    // Sweep alpha from -10 deg to +20 deg
    for (let a = -10; a <= 20; a += 0.5) {
      const sweepCond: FlowConditions = { ...conditions, alphaDeg: a };
      const inv = solveVortexPanels(panels, sweepCond);
      const visc = computeBoundaryLayerAndDrag(panels, inv.results, sweepCond);
      const ld = visc.cd > 0 ? visc.cl / visc.cd : 0;

      sweep.push({
        alpha: a,
        cl: visc.cl,
        cd: visc.cd,
        cm: visc.cmC4,
        ld,
      });
    }
    return sweep;
  }, [panels, conditions.reynolds, conditions.vInf]);

  return (
    <div className="min-h-screen bg-[#06090e] text-slate-100 flex flex-col font-sans">
      {/* Header with Presets & Export */}
      <Header
        currentCode={nacaCode}
        onSelectPreset={handleSelectPreset}
        onOpenTheory={() => setIsTheoryOpen(true)}
        geometry={geometry}
        polars={polars}
      />

      {/* Main Cockpit Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 flex flex-col gap-5">
        {/* Top Instrumentation Readouts (CL, CD, L/D, Cm, Xcp, Stall) */}
        <AeroStatsHUD results={results} conditions={conditions} />

        {/* Center Workspace: Visualizer + Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Canvas + Charts (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-5">
            {/* Realtime 60fps Flowfield Canvas */}
            <VisualizerCanvas
              geometry={geometry}
              panels={panels}
              results={results}
              conditions={conditions}
              sourceStrengths={sourceStrengths}
              gammaAirfoil={gammaAirfoil}
              visMode={visMode}
              showPanels={showPanels}
              showCamberLine={showCamberLine}
              showCpIndicator={showCpIndicator}
            />

            {/* Aerodynamic Graphs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CpDistributionPlot panels={results.panels} cl={results.cl} />
              <PolarPlots
                polars={polars}
                currentAlpha={conditions.alphaDeg}
                currentCl={results.cl}
                currentCd={results.cd}
              />
            </div>
          </div>

          {/* Right Column: Flight & Geometry Control Sliders (4 cols) */}
          <div className="lg:col-span-4">
            <ControlPanel
              geometry={geometry}
              conditions={conditions}
              numPanels={numPanels}
              visMode={visMode}
              showPanels={showPanels}
              showCamberLine={showCamberLine}
              showCpIndicator={showCpIndicator}
              onUpdateGeometry={(newGeom) => {
                if (newGeom.camber !== undefined) setCamber(newGeom.camber);
                if (newGeom.camberPos !== undefined) setCamberPos(newGeom.camberPos);
                if (newGeom.thickness !== undefined) setThickness(newGeom.thickness);
                if (newGeom.flapAngleDeg !== undefined) setFlapAngleDeg(newGeom.flapAngleDeg);
                if (newGeom.flapHingeX !== undefined) setFlapHingeX(newGeom.flapHingeX);
              }}
              onUpdateConditions={(newCond) => {
                setConditions((prev) => ({ ...prev, ...newCond }));
              }}
              onUpdateNumPanels={(n) => setNumPanels(n)}
              onUpdateVisMode={(mode) => setVisMode(mode)}
              onToggleShowPanels={() => setShowPanels(!showPanels)}
              onToggleShowCamber={() => setShowCamberLine(!showCamberLine)}
              onToggleShowCpIndicator={() => setShowCpIndicator(!showCpIndicator)}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs font-mono text-slate-500 flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto w-full gap-2">
        <span>AeroFlow Studio &bull; Aerospace Engineering Portfolio Project</span>
        <span>Hess-Smith 2D Panel Method &bull; Thwaites / Squire-Young Viscous BL</span>
      </footer>

      {/* Aerodynamic Theory & Equations Modal */}
      <TheoryModal isOpen={isTheoryOpen} onClose={() => setIsTheoryOpen(false)} />
    </div>
  );
}
