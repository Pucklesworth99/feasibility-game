/**
 * Resource estimation + JORC classification from drill data.
 *
 * The player only ever "knows" what this module derives from their holes —
 * inverse-distance interpolation between drilled columns, classified by
 * proximity to data. This is the translated version of real practice:
 * drill spacing → confidence → Measured / Indicated / Inferred.
 */

import { CELL_TONNES, CUTOFF, Deposit, GRID_H, GRID_W } from './deposit';

/** Classification codes per cell. */
export const enum Cls {
  None = 0,
  Inferred = 1,
  Indicated = 2,
  Measured = 3,
}

// Spacing thresholds in cells (10 m each) — translated from typical gold
// resource drill-spacing practice.
const MEASURED_D = 2; //  ≤ 20 m to a hole…
const MEASURED_SECOND_D = 5; // …with a second hole ≤ 50 m (continuity confirmed)
const INDICATED_D = 5; //  ≤ 50 m
const INFERRED_D = 10; // ≤ 100 m extrapolation

export interface ClassTotals {
  tonnes: number;
  oz: number;
  grade: number; // weighted average g/t
}

export interface Estimate {
  /** Interpolated grade per cell (0 where no data support). */
  estGrade: Float32Array;
  /** Cls per cell (only meaningful where estGrade ≥ cut-off). */
  cls: Uint8Array;
  measured: ClassTotals;
  indicated: ClassTotals;
  inferred: ClassTotals;
  totalOz: number;
  totalTonnes: number;
  avgGrade: number;
  /** Share of ounces in Measured+Indicated — what lenders look at. */
  bankableShare: number;
}

function emptyTotals(): ClassTotals {
  return { tonnes: 0, oz: 0, grade: 0 };
}

export function computeEstimate(dep: Deposit, holes: number[]): Estimate {
  const estGrade = new Float32Array(GRID_W * GRID_H);
  const cls = new Uint8Array(GRID_W * GRID_H);
  const totals: ClassTotals[] = [emptyTotals(), emptyTotals(), emptyTotals(), emptyTotals()];

  if (holes.length > 0) {
    const hx = [...holes].sort((a, b) => a - b);

    for (let x = 0; x < GRID_W; x++) {
      // Nearest and second-nearest hole distances for this column.
      let d1 = Infinity;
      let d2 = Infinity;
      let h1 = -1;
      let h2 = -1;
      for (const h of hx) {
        const d = Math.abs(h - x);
        if (d < d1) {
          d2 = d1; h2 = h1;
          d1 = d; h1 = h;
        } else if (d < d2) {
          d2 = d; h2 = h;
        }
      }

      let c = Cls.None;
      if (d1 <= MEASURED_D && d2 <= MEASURED_SECOND_D) c = Cls.Measured;
      else if (d1 <= INDICATED_D) c = Cls.Indicated;
      else if (d1 <= INFERRED_D) c = Cls.Inferred;
      if (c === Cls.None) continue;

      for (let y = dep.overburden; y < GRID_H; y++) {
        // IDW (power 2) between the two nearest holes' true grades at this row.
        const g1 = dep.grade[y * GRID_W + h1];
        let g: number;
        if (h2 >= 0 && d2 <= INFERRED_D * 1.5) {
          const w1 = 1 / Math.pow(d1 + 0.5, 2);
          const w2 = 1 / Math.pow(d2 + 0.5, 2);
          const g2 = dep.grade[y * GRID_W + h2];
          g = (g1 * w1 + g2 * w2) / (w1 + w2);
        } else {
          g = g1;
        }
        const i = y * GRID_W + x;
        estGrade[i] = g;
        if (g >= CUTOFF) {
          cls[i] = c;
          const t = totals[c];
          t.tonnes += CELL_TONNES;
          t.oz += (g * CELL_TONNES) / 31.1035;
        }
      }
    }
  }

  for (const t of totals) {
    t.grade = t.tonnes > 0 ? (t.oz * 31.1035) / t.tonnes : 0;
  }

  const measured = totals[Cls.Measured];
  const indicated = totals[Cls.Indicated];
  const inferred = totals[Cls.Inferred];
  const totalOz = measured.oz + indicated.oz + inferred.oz;
  const totalTonnes = measured.tonnes + indicated.tonnes + inferred.tonnes;

  return {
    estGrade,
    cls,
    measured,
    indicated,
    inferred,
    totalOz,
    totalTonnes,
    avgGrade: totalTonnes > 0 ? (totalOz * 31.1035) / totalTonnes : 0,
    bankableShare: totalOz > 0 ? (measured.oz + indicated.oz) / totalOz : 0,
  };
}
