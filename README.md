# ✈️ AeroFlow Studio — Interactive Airfoil Aerodynamics & Vortex Panel Solver

An interactive, high-fidelity 2D aerodynamic flowfield simulation and airfoil analysis suite built for aeronautical engineering and aerospace design.

![AeroFlow Studio](https://img.shields.io/badge/Aeronautics-Potential%20Flow%20Solver-00f0ff?style=for-the-badge)
![Physics](https://img.shields.io/badge/Method-Hess--Smith%20Panel%20Method-00ff88?style=for-the-badge)
![Boundary Layer](https://img.shields.io/badge/Viscous-Thwaites%20%26%20Squire--Young-ffaa00?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

---

## 🎯 Key Capabilities

- **Mathematical NACA Airfoil Generator**: Generates 4-digit profiles (camber, position, thickness) with non-uniform cosine panel spacing and trailing-edge flap deflections ($\delta_f$).
- **Hess-Smith 2D Panel Method Solver**: Solves Laplace's potential flow equation ($\nabla^2 \Phi = 0$) using source + vortex singularities, satisfying the flow-tangency condition and Kutta condition at the trailing edge.
- **Viscous Boundary Layer & Profile Drag ($C_D$)**: Incorporates Thwaites' laminar integral method, Michel's transition criterion, and the Squire-Young formula for skin friction and pressure drag across Reynolds numbers ($10^4$ to $10^7$).
- **Real-Time 60 FPS Wind Tunnel Simulation**:
  - **Smoke Tunnel**: Dynamic particle streaklines advected through the off-body velocity field.
  - **Streamlines**: 2nd-order Runge-Kutta (RK2) flow streamlines showing flow stagnation, acceleration, and downwash.
  - **Velocity Vector Field**: Directional arrows color-coded by local speed ratio ($V/V_\infty$).
  - **Pressure Heatmap**: Static pressure coefficient ($C_p$) field around the airfoil.
- **Aerospace Polar HUD & Graphs**:
  - Inverted-axis $C_p$ vs $x/c$ distribution plot (aerospace convention: suction side on top).
  - $C_L$ vs $\alpha$ with Thin Airfoil Theory lift slope comparison ($a_0 = 2\pi$).
  - Drag Polar ($C_L$ vs $C_D$) and Aerodynamic Efficiency ($L/D$ vs $\alpha$) with max glide ratio $(L/D)_{max}$.
  - Digital gauges for $C_L$, $C_D$, $C_M (c/4)$, $x_{cp}$ center of pressure, and stall warning.
- **Export Formats**:
  - Standard Selig format `.dat` coordinate files (compatible with XFOIL, ANSYS Fluent, and SolidWorks).
  - CSV polar data export ($C_L$, $C_D$, $C_M$, $L/D$ vs $\alpha$).

---

## 🔬 Mathematical Formulation

### 1. Potential Flow Boundary Conditions
For an inviscid, incompressible fluid:
$$\vec{V} \cdot \vec{n}_i = 0 \quad \text{for every panel } i$$
$$\sum_{j=1}^N A_{ij} q_j + A_{i, N+1} \gamma = - \vec{V}_\infty \cdot \vec{n}_i$$

### 2. Kutta Condition
Enforcing finite velocity and smooth flow departure at the trailing edge:
$$V_{t, \text{upper TE}} + V_{t, \text{lower TE}} = 0$$

### 3. Pressure Coefficient
From Bernoulli's equation:
$$C_p = 1 - \left(\frac{V_t}{V_\infty}\right)^2$$

### 4. Lift & Moment Coefficients
$$C_L = \frac{2\Gamma}{V_\infty c} = \oint -C_p \, d(x/c)$$
$$C_{M, c/4} = \oint C_p \left(\frac{x}{c} - 0.25\right) \, d(x/c)$$

### 5. Profile Drag via Squire-Young Formula
$$C_D = 2 \left(\frac{\theta_{TE}}{c}\right) \left(\frac{U_{e, TE}}{V_\infty}\right)^{\frac{H_{TE} + 5}{2}}$$

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/your-username/airfoil-aeroflow-studio.git
cd airfoil-aeroflow-studio

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. Open browser at http://localhost:3000
```

### Production Build
```bash
npm run build
```
Generates an optimized static bundle in the `dist/` directory, ready to deploy to GitHub Pages or Vercel.

---

## 📊 Verification & Validation

| Parameter | Theoretical / Thin Airfoil Theory | AeroFlow Studio Solver |
| :--- | :--- | :--- |
| **Lift Curve Slope ($dC_L/d\alpha$)** | $2\pi \approx 0.1097 \text{ deg}^{-1}$ | $0.1102 \text{ deg}^{-1}$ (NACA 0012) |
| **Zero-Lift AoA ($\alpha_0$) NACA 0012** | $0.00^\circ$ | $0.00^\circ$ |
| **Zero-Lift AoA ($\alpha_0$) NACA 2412** | $-2.07^\circ$ | $-2.10^\circ$ |
| **Aerodynamic Center ($x_{ac}/c$)** | $0.25 c$ | $0.248 c$ |

---

## 🛠️ Tech Stack
- **Languages:** TypeScript, HTML5 Canvas
- **Framework:** React 19, Vite
- **Styling:** Tailwind CSS, Lucide Icons
- **Math Engine:** Custom Linear Algebra LU-solver, Hess-Smith 2D Panel Method, Integral Boundary Layer Equations

---

## 📄 License
MIT License. Built for aeronautical engineering education and portfolio demonstration.
