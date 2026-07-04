/**
 * The tenement — a seeded 50×50 tile world. Terrain on top, a hidden gold
 * system underneath (lenses strung along shear trends, WA style), and surface
 * clues where mineralization comes near surface: outcrop and old-timer
 * workings. Deterministic from the seed, like everything in core/.
 */

import { Rng, ValueNoise2D } from './rng';

export const MAP = 20; // tiles per side — chunky, readable, every tap matters
export const TILE_M = 75; // metres per tile → 1.5 km × 1.5 km tenement

export const enum Terrain {
  Plain = 0,
  Hill = 1,
  Outcrop = 2,
  SaltLake = 3,
  Creek = 4,
  Workings = 5,
  Heritage = 6,
}

export interface Tile {
  terrain: Terrain;
  elev: number; // 0..1, drives iso shading + lift
  oz: number; // contained ounces beneath this tile (the hidden truth)
  grade: number; // representative g/t Au, for assay flavour text
  depth: number; // metres to top of mineralization (meaningless if oz≈0)
}

export interface World {
  seed: string;
  tiles: Tile[];
  totalOz: number;
  companyName: string;
  ticker: string;
}

const DISTRICTS = [
  'KALGOORLIE', 'BENDIGO', 'TELFER', 'CADIA', 'BODDINGTON', 'GWALIA',
  'PLUTONIC', 'SUNRISE', 'PAULSENS', 'MEEKATHARRA', 'LAVERTON', 'CUE',
  'NORSEMAN', 'LEONORA', 'WILUNA', 'MARBLE-BAR', 'HALLS-CREEK', 'PINE-CREEK',
];

const SUFFIXES = ['GOLD NL', 'RESOURCES LTD', 'MINERALS LTD', 'METALS LTD'];

export function randomSeedName(entropy: number): string {
  const d = DISTRICTS[Math.floor(entropy * DISTRICTS.length) % DISTRICTS.length];
  const n = 1000 + Math.floor((entropy * 1e6) % 9000);
  return `${d}-${n}`;
}

export function idx(x: number, y: number): number {
  return y * MAP + x;
}

export function inMap(x: number, y: number): boolean {
  return x >= 0 && x < MAP && y >= 0 && y < MAP;
}

export function generateWorld(seed: string): World {
  const rng = new Rng(seed);
  const elevN = new ValueNoise2D(rng, MAP, MAP, 1 / 5);
  const creekN = new ValueNoise2D(rng, MAP, MAP, 1 / 4);
  const oreN = new ValueNoise2D(rng, MAP, MAP, 1 / 3.5);
  const gradeN = new ValueNoise2D(rng, MAP, MAP, 1 / 3);

  const tiles: Tile[] = new Array(MAP * MAP);

  // --- Terrain pass ---
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const elev = elevN.at(x, y);
      let terrain = Terrain.Plain;
      if (elev > 0.72) terrain = Terrain.Hill;
      else if (elev < 0.18) terrain = Terrain.SaltLake;
      else if (Math.abs(creekN.at(x, y) - 0.5) < 0.022 && elev < 0.6) terrain = Terrain.Creek;
      tiles[idx(x, y)] = { terrain, elev, oz: 0, grade: 0, depth: 999 };
    }
  }

  // --- Gold system: lenses strung along 1–2 shear trends ---
  const strike = rng.range(-0.6, 0.6) + Math.PI / 4; // NE–NW-ish strikes
  const dirX = Math.cos(strike);
  const dirY = Math.sin(strike);
  const shearCount = rng.int(1, 2);

  interface PlanLens {
    cx: number; cy: number; halfA: number; halfB: number; peakOz: number; depth: number;
  }
  const lenses: PlanLens[] = [];

  for (let s = 0; s < shearCount; s++) {
    const baseX = rng.range(6, MAP - 6);
    const baseY = rng.range(6, MAP - 6);
    const lensCount = rng.int(2, 3);
    for (let l = 0; l < lensCount; l++) {
      const t = rng.range(-6, 6);
      const first = s === 0 && l === 0;
      lenses.push({
        cx: baseX + dirX * t + rng.gauss() * 0.9,
        cy: baseY + dirY * t + rng.gauss() * 0.9,
        halfA: rng.range(1.6, 3.4), // along strike
        halfB: rng.range(0.7, 1.4), // across strike
        peakOz: rng.range(8000, 30000),
        // The first lens is always shallow-ish (old timers found SOMETHING);
        // the rest can be blind and deep — that's what drilling is for.
        depth: first ? rng.range(5, 55) : rng.range(10, 230),
      });
    }
  }

  let totalOz = 0;
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const tile = tiles[idx(x, y)];
      for (const L of lenses) {
        const dx = x - L.cx;
        const dy = y - L.cy;
        const u = (dx * dirX + dy * dirY) / L.halfA;
        const v = (-dx * dirY + dy * dirX) / L.halfB;
        const r = Math.sqrt(u * u + v * v);
        if (r < 1) {
          const continuity = 0.55 + 0.9 * oreN.at(x, y);
          tile.oz += L.peakOz * Math.pow(1 - r, 1.5) * continuity;
          tile.depth = Math.min(tile.depth, L.depth + r * 35);
        }
      }
      if (tile.oz > 300) {
        tile.grade = Math.min(9, 0.8 + (tile.oz / 6500) * (0.7 + 0.6 * gradeN.at(x, y)));
        totalOz += tile.oz;
      } else {
        tile.oz = 0;
      }
    }
  }

  // --- Surface expression: clues where gold comes near surface ---
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const tile = tiles[idx(x, y)];
      if (tile.terrain === Terrain.SaltLake || tile.terrain === Terrain.Creek) continue;
      if (tile.oz > 2400 && tile.depth < 25 && rng.next() < 0.55) tile.terrain = Terrain.Outcrop;
      else if (tile.oz > 1200 && tile.depth < 45 && rng.next() < 0.35) tile.terrain = Terrain.Workings;
    }
  }

  // --- Heritage exclusion areas: 1–2 blobs, sometimes inconveniently placed ---
  const blobCount = rng.int(1, 2);
  for (let b = 0; b < blobCount; b++) {
    const bx = rng.int(3, MAP - 4);
    const by = rng.int(3, MAP - 4);
    const rad = rng.range(1.0, 2.0);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const d = Math.hypot(x - bx, y - by);
        const tile = tiles[idx(x, y)];
        if (d < rad && (tile.terrain === Terrain.Plain || tile.terrain === Terrain.Hill)) {
          tile.terrain = Terrain.Heritage;
        }
      }
    }
  }

  const district = seed.split('-')[0] || 'AURUM';
  const companyName = `${district} ${SUFFIXES[new Rng(seed + ':co').int(0, SUFFIXES.length - 1)]}`;
  const ticker = (district.replace(/[^A-Z]/g, '') + 'XAU').slice(0, 3);

  return { seed, tiles, totalOz, companyName, ticker };
}
