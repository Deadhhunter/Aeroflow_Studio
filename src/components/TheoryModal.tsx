import React from 'react';
import { X, BookOpen, CheckCircle2 } from 'lucide-react';

interface TheoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TheoryModal: React.FC<TheoryModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0a0f18] border border-cyan-500/40 rounded-2xl p-6 lg:p-8 shadow-2xl text-slate-200 font-sans">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-mono text-white flex items-center gap-2">
              AERODYNAMIC THEORY & MATHEMATICAL FORMULATION
            </h2>
            <p className="text-xs text-slate-400">
              Complete governing equations for the 2D Panel Method, Boundary Layer & Profile Drag
            </p>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-6 text-sm leading-relaxed text-slate-300">
          {/* Section 1: Potential Flow & Singularity Panels */}
          <section className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
            <h3 className="text-base font-bold font-mono text-cyan-400 mb-2 flex items-center gap-2">
              1. Hess-Smith 2D Vortex/Source Panel Method
            </h3>
            <p className="mb-3 text-xs text-slate-400">
              For inviscid, incompressible, and irrotational flow, the velocity field is governed by Laplace's equation for velocity potential:
            </p>
            <div className="bg-[#06090e] p-3 rounded-lg border border-slate-800 font-mono text-xs text-cyan-300 text-center my-2">
              ∇²Φ = 0  ⇒  ∂²Φ/∂x² + ∂²Φ/∂y² = 0
            </div>
            <p className="text-xs mb-2">
              The continuous airfoil boundary is discretized into <em>N</em> planar panels. Each panel <em>j</em> carries a constant source distribution <em>q_j</em> and a uniform vortex circulation sheet <em>γ</em> across all panels.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-cyan-400 font-bold block mb-1">Source Induction:</span>
                u_loc = (q / 2π) · ln(r₁ / r₂)<br />
                v_loc = (q / 2π) · β
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-amber-400 font-bold block mb-1">Vortex Induction:</span>
                u_loc = (γ / 2π) · β<br />
                v_loc = -(γ / 2π) · ln(r₁ / r₂)
              </div>
            </div>
          </section>

          {/* Section 2: Boundary Conditions & Kutta Condition */}
          <section className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
            <h3 className="text-base font-bold font-mono text-cyan-400 mb-2">
              2. Boundary Conditions & Kutta Condition
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Flow-Tangency (No-Penetration Condition):</strong>
                  <p className="text-slate-400">
                    At every panel control point <em>(xc_i, yc_i)</em>, the total normal velocity component must vanish:
                  </p>
                  <div className="font-mono bg-slate-950 p-2 rounded mt-1 text-slate-300">
                    V_total · n_i = 0  ⇒  Σ [A_ij · q_j] + A_i,N+1 · γ = -V_∞ · n_i
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">The Kutta Condition:</strong>
                  <p className="text-slate-400">
                    In real fluid flows, viscosity enforces smooth flow departure at the sharp trailing edge without infinite velocity or pressure singularities. In the panel method, this is implemented by equating upper and lower trailing edge tangential velocities:
                  </p>
                  <div className="font-mono bg-slate-950 p-2 rounded mt-1 text-cyan-300">
                    V_t(upper TE) + V_t(lower TE) = 0
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Pressure & Aerodynamic Forces */}
          <section className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
            <h3 className="text-base font-bold font-mono text-cyan-400 mb-2">
              3. Pressure Coefficient (Cp) & Integrated Forces
            </h3>
            <p className="text-xs mb-2">
              From Bernoulli's equation for steady incompressible flow:
            </p>
            <div className="bg-[#06090e] p-3 rounded-lg border border-slate-800 font-mono text-xs text-amber-300 text-center my-2">
              Cp_i = (p_i - p_∞) / (½ ρ V_∞²) = 1 - (V_t,i / V_∞)²
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono mt-3">
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-cyan-400 font-bold block mb-1">Lift (CL):</span>
                CL = (2Γ) / (V_∞ · c) = ∮ -Cp · d(x/c)
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-purple-400 font-bold block mb-1">Pitching Moment (Cm,c/4):</span>
                Cm = ∮ Cp · (x/c - 0.25) · d(x/c)
              </div>
              <div className="bg-slate-950 p-3 rounded border border-slate-800">
                <span className="text-emerald-400 font-bold block mb-1">Center of Pressure:</span>
                Xcp / c = 0.25 - (Cm,c/4 / CL)
              </div>
            </div>
          </section>

          {/* Section 4: Boundary Layer & Drag */}
          <section className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
            <h3 className="text-base font-bold font-mono text-cyan-400 mb-2">
              4. Viscous Boundary Layer & Squire-Young Profile Drag
            </h3>
            <p className="text-xs mb-2 text-slate-300">
              Potential flow by itself predicts zero drag (d'Alembert's paradox). To model real aerodynamic performance, AeroFlow Studio integrates the boundary layer along both surfaces:
            </p>
            <div className="space-y-2 text-xs">
              <div className="bg-slate-950 p-2.5 rounded font-mono">
                <span className="text-cyan-400 font-bold">Thwaites Laminar Method:</span> θ²(s) = (0.45 ν / Ue⁶) ∫ Ue⁵ ds
              </div>
              <div className="bg-slate-950 p-2.5 rounded font-mono">
                <span className="text-amber-400 font-bold">Michel Transition Criterion:</span> Re_θ,crit = 1.174 (1 + 22400 / Re_x) · Re_x^0.46
              </div>
              <div className="bg-slate-950 p-2.5 rounded font-mono">
                <span className="text-emerald-400 font-bold">Squire-Young Profile Drag:</span> CD = 2 (θ_TE / c) · (Ue_TE / V_∞)^((H_TE + 5) / 2)
              </div>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs shadow-lg shadow-cyan-500/20 transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
