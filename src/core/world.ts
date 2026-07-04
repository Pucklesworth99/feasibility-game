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
  Creek = 4, // dried watercourse — floods in the rain event
  Workings = 5,
  Heritage = 6,
  Highway = 7, // sealed road — Main Roads says no
  OldPit = 8, // abandoned working — half-price drilling, biased geology nearby
  Windmill = 9, // decorative, sacred in its own way
}

/**
 * The tenement is HAND-CRAFTED (one art-directed WA set piece — flat red
 * dirt, a highway, a dried creek, salt lake, an abandoned pit); only the
 * GEOLOGY is randomised per seed. Legend: . plain, O outcrop, S salt,
 * C creek, H highway, W old workings, X heritage, P old pit, M windmill.
 */
const LAYOUT = [
  '....................',
  '......O.............',
  '.....OO.......C.....',
  'HHHHHHHHHHHHHHHHHHHH',
  '..............C.....',
  '.....X.......C......',
  '....XX......C.......',
  '...........C........',
  '..O........C........',
  '..OO......C.........',
  '.M.......C..WPP.....',
  '.........C...PP.....',
  '........C...........',
  '.......C............',
  '......C.............',
  'SS...C..............',
  'SSS.C...............',
  'SSSC................',
  'SS.C................',
  '...C................',
];

const LAYOUT_TERRAIN: Record<string, Terrain> = {
  '.': Terrain.Plain,
  O: Terrain.Outcrop,
  S: Terrain.SaltLake,
  C: Terrain.Creek,
  H: Terrain.Highway,
  W: Terrain.Workings,
  X: Terrain.Heritage,
  P: Terrain.OldPit,
  M: Terrain.Windmill,
};

/** Centre of the abandoned pit — old-timers dug here for a reason. */
export const OLD_PIT = { x: 13.5, y: 10.5 };

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
  /** Aeromag survey response, 0..1 — the purple smoke. Mostly honest, partly liar. */
  aeromag: Float32Array;
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
  const oreN = new ValueNoise2D(rng, MAP, MAP, 1 / 3.5);
  const gradeN = new ValueNoise2D(rng, MAP, MAP, 1 / 3);

  const tiles: Tile[] = new Array(MAP * MAP);

  // --- Terrain: the hand-crafted layout, WA-flat with micro-relief ---
  const BASE_ELEV: Partial<Record<Terrain, number>> = {
    [Terrain.Plain]: 0.3,
    [Terrain.Outcrop]: 0.55,
    [Terrain.SaltLake]: 0.1,
    [Terrain.Creek]: 0.16,
    [Terrain.Highway]: 0.3,
    [Terrain.Workings]: 0.34,
    [Terrain.Heritage]: 0.32,
    [Terrain.OldPit]: 0.18,
    [Terrain.Windmill]: 0.3,
  };
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const terrain = LAYOUT_TERRAIN[LAYOUT[y][x]] ?? Terrain.Plain;
      const elev = (BASE_ELEV[terrain] ?? 0.3) + elevN.at(x, y) * 0.12;
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
    const brown = s === 0; // brownfields shear, biased to the old pit
    const baseX = brown ? OLD_PIT.x + rng.gauss() * 2.2 : rng.range(5, MAP - 5);
    const baseY = brown ? OLD_PIT.y + rng.gauss() * 2.2 : rng.range(5, MAP - 5);
    const lensCount = rng.int(2, 4);
    for (let l = 0; l < lensCount; l++) {
      const t = rng.range(-6, 6);
      const first = s === 0 && l === 0;
      lenses.push({
        cx: Math.max(1, Math.min(MAP - 2, baseX + dirX * t + rng.gauss() * 0.9)),
        cy: Math.max(1, Math.min(MAP - 2, baseY + dirY * t + rng.gauss() * 0.9)),
        halfA: rng.range(1.6, 3.4), // along strike
        halfB: rng.range(0.7, 1.4), // across strike
        peakOz: rng.range(12000, 40000),
        // The first lens is shallow-ish (the old-timers got the top of it);
        // the rest can be blind and deep — that's what drilling is for.
        depth: first ? rng.range(10, 70) : rng.range(10, 230),
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
        // Bonanza zones: ~1 in 4 ore tiles carries the spectacular stuff.
        // This is the slot-machine variance — and the 1Moz camps.
        if (rng.next() < 0.25) {
          tile.oz *= rng.range(5, 11);
          tile.grade = rng.range(9, 26);
        } else {
          tile.grade = Math.min(9, 0.8 + (tile.oz / 6500) * (0.7 + 0.6 * gradeN.at(x, y)));
        }
        totalOz += tile.oz;
      } else {
        tile.oz = 0;
      }
    }
  }

  // (Surface clues, heritage, the pit, the highway: all fixed in LAYOUT.)

  // --- Aeromag: broad geophysical haze over the real trends, modulated by
  // noise, plus 2–3 false anomalies (magnetite, not gold — the classic trap).
  const aeromag = new Float32Array(MAP * MAP);
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const oz = tiles[idx(x, y)].oz;
      if (oz <= 0) continue;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (!inMap(x + dx, y + dy)) continue;
          const d = Math.hypot(dx, dy);
          if (d > 2.8) continue;
          const j = idx(x + dx, y + dy);
          aeromag[j] = Math.max(aeromag[j], Math.min(1, oz / 26000) * (1 - d / 3.6));
        }
      }
    }
  }
  const magN = new ValueNoise2D(rng, MAP, MAP, 1 / 2.5);
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      aeromag[idx(x, y)] *= 0.6 + 0.75 * magN.at(x, y);
    }
  }
  const fakes = rng.int(2, 3);
  for (let f = 0; f < fakes; f++) {
    const fx = rng.int(2, MAP - 3);
    const fy = rng.int(2, MAP - 3);
    const fr = rng.range(1.4, 2.4);
    const str = rng.range(0.3, 0.55);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const d = Math.hypot(x - fx, y - fy);
        if (d < fr) aeromag[idx(x, y)] = Math.max(aeromag[idx(x, y)], str * (1 - d / (fr + 0.5)));
      }
    }
  }

  const district = seed.split('-')[0] || 'AURUM';
  const companyName = `${district} ${SUFFIXES[new Rng(seed + ':co').int(0, SUFFIXES.length - 1)]}`;
  const ticker = (district.replace(/[^A-Z]/g, '') + 'XAU').slice(0, 3);

  return { seed, tiles, totalOz, companyName, ticker, aeromag };
}
