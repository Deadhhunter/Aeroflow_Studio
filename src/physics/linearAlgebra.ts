/**
 * High-performance linear algebra routines for vortex panel method influence matrices
 */

/**
 * Solve linear system A * x = b using Gaussian elimination with partial pivoting.
 * A is an n x n matrix (modified in-place or copied), b is an n-vector.
 * Returns the solution vector x of length n.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Clone A and b to avoid mutating caller data
  const M: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = new Float64Array(A[i]) as unknown as number[];
  }
  const x: number[] = new Float64Array(b) as unknown as number[];

  // Forward elimination with partial pivoting
  for (let k = 0; k < n - 1; k++) {
    let maxVal = Math.abs(M[k][k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(M[i][k]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = i;
      }
    }

    // Pivot rows
    if (maxRow !== k) {
      const tempRow = M[k];
      M[k] = M[maxRow];
      M[maxRow] = tempRow;

      const tempB = x[k];
      x[k] = x[maxRow];
      x[maxRow] = tempB;
    }

    const pivot = M[k][k];
    if (Math.abs(pivot) < 1e-14) {
      continue; // Near-singular row, proceed carefully
    }

    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / pivot;
      M[i][k] = 0;
      for (let j = k + 1; j < n; j++) {
        M[i][j] -= factor * M[k][j];
      }
      x[i] -= factor * x[k];
    }
  }

  // Back-substitution
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    const diag = M[i][i];
    x[i] = Math.abs(diag) > 1e-14 ? sum / diag : 0;
  }

  return Array.from(x);
}
