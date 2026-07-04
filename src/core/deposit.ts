/**
 * Seeded orebody generation. A deposit is a 2D grade field (g/t Au) on a
 * cross-section grid — the hidden truth the player pays to discover.
 */

import { Rng, ValueNoise2D } from './rng';

export const GRID_W = 110; // columns, 10 m each → 1.1 km of strike section
export const GRID_H = 64; //  rows, 10 m each → 640 m depth
export const CELL_M = 10; //  metres per cell
/** Tonnes per cell: 10 m × 10 m × 20 m section thickness × 2.7 t/m³. */
export const CELL_TONNES = 5400;
/** Resource cut-off grade, g/t. */
export const CUTOFF = 0.4;

export interface Lens {
  cx: number;
  cy: number;
  halfLen: number; // along dip, cells
  halfThick: number; // across dip, cells
  angle: number; // dip, radians (0 = flat)
  peak: number; // core grade g/t
}

export interface Deposit {
  seed: string;
  grade: Float32Array; // GRID_W × GRID_H, g/t (0 = waste)
  overburden: number; // barren cover rows from surface
  lenses: Lens[];
  /** Total in-situ ounces above cut-off — the truth the player never fully sees. */
  totalOz: number;
  totalOreCells: number;
}

const DISTRICTS = [
  'KALGOORLIE', 'BENDIGO', 'TELFER', 'CADIA', 'BODDINGTON', 'GWALIA',
  'PLUTONIC', 'SUNRISE', 'PAULSENS', 'MEEKATHARRA', 'LAVERTON', 'CUE',
  'NORSEMAN', 'LEONORA', 'WILUNA', 'MARBLE-BAR', 'HALLS-CREEK', 'PINE-CREEK',
];

/** A shareable, mining-flavoured seed, e.g. "KALGOORLIE-4471". */
export function randomSeedName(entropy: number): string {
  const d = DISTRICTS[Math.floor(entropy * DISTRICTS.length) % DISTRICTS.length];
  const n = 1000 + Math.floor((entropy * 1e6) % 9000);
  return `${d}-${n}`;
}

export function generateDeposit(seed: string): Deposit {
  const rng = new Rng(seed);
  const grade = new Float32Array(GRID_W * GRID_H);
  const overburden = rng.int(3, 6);

  // Broad continuity noise — makes grade lumpy along the lenses.
  const noise = new ValueNoise2D(rng, GRID_W, GRID_H, 1 / 5);

  // 1–3 lenses. One is always reachable at moderate depth; extras may sit
  // deeper or along strike ("blind" mineralization drilling has to find).
  const lensCount = rng.next() < 0.25 ? 1 : rng.int(2, 3);
  const lenses: Lens[] = [];
  for (let i = 0; i < lensCount; i++) {
    const primary = i === 0;
    lenses.push({
      cx: primary ? rng.range(25, GRID_W - 25) : rng.range(12, GRID_W - 12),
      cy: primary
        ? rng.range(overburden + 8, GRID_H * 0.55)
        : rng.range(overburden + 10, GRID_H - 8),
      halfLen: rng.range(14, 32),
      halfThick: rng.range(2.2, 5.5),
      angle: rng.range(0.35, 1.0) * (rng.next() < 0.5 ? 1 : -1), // ~20–57° dip
      peak: rng.range(3.0, 11.0),
    });
  }

  for (let y = overburden; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let g = 0;
      for (const L of lenses) {
        // Transform into lens-local coordinates (rotate by dip).
        const dx = x - L.cx;
        const dy = y - L.cy;
        const cos = Math.cos(L.angle);
        const sin = Math.sin(L.angle);
        const u = (dx * cos + dy * sin) / L.halfLen;
        const v = (-dx * sin + dy * cos) / L.halfThick;
        const r = Math.sqrt(u * u + v * v);
        if (r < 1) {
          const shape = Math.pow(1 - r, 1.4);
          const continuity = 0.55 + 0.9 * noise.at(x, y);
          g += L.peak * shape * continuity;
        }
      }
      // Occasional coarse-gold spike near mineralization — the nugget effect.
      if (g > 0.3 && rng.next() < 0.015) g *= rng.range(2, 3.5);
      grade[y * GRID_W + x] = g;
    }
  }

  let totalOz = 0;
  let totalOreCells = 0;
  for (let i = 0; i < grade.length; i++) {
    if (grade[i] >= CUTOFF) {
      totalOreCells++;
      totalOz += (grade[i] * CELL_TONNES) / 31.1035;
    }
  }

  return { seed, grade, overburden, lenses, totalOz, totalOreCells };
}

export function gradeAt(dep: Deposit, x: number, y: number): number {
  return dep.grade[y * GRID_W + x];
}
