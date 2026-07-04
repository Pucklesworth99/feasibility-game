/**
 * Sampling & knowledge. The player never sees the truth — only what their
 * programs reveal: a fuzzy surface anomaly layer (soils/aircore AOE) and
 * point drill data (RC/diamond) that the JORC classifier turns into
 * Measured / Indicated / Inferred tiles by data spacing and quality.
 */

import { Rng } from './rng';
import { idx, inMap, MAP, Terrain, World } from './world';

/** JORC-translated confidence classes per tile. */
export const enum Cls {
  None = 0,
  Inferred = 1,
  Indicated = 2,
  Measured = 3,
}

export const enum Tool {
  Soil = 0,
  Aircore = 1,
  RC = 2,
  Diamond = 3,
}

export interface ToolSpec {
  tool: Tool;
  name: string;
  short: string;
  cost: number;
  days: number;
  radius: number; // AOE in tiles
  maxDepth: number; // metres it can "see"
  noise: number; // relative assay/estimation error
  desc: string;
}

export const TOOLS: ToolSpec[] = [
  {
    tool: Tool.Soil,
    name: 'Soil Test',
    short: 'SOIL TEST',
    cost: 60_000,
    days: 10,
    radius: 3,
    maxDepth: 30,
    noise: 0.5,
    desc: 'Cheap surface test over a wide area. Shows where gold MIGHT be — not how much. (Real term: geochemical soil sampling.)',
  },
  {
    tool: Tool.Aircore,
    name: 'Shallow Drill',
    short: 'SHALLOW DRILL',
    cost: 150_000,
    days: 14,
    radius: 2,
    maxDepth: 60,
    noise: 0.3,
    desc: 'Quick, shallow holes — a first look under the surface, down to ~60 m. (Real term: aircore drilling.)',
  },
  {
    tool: Tool.RC,
    name: 'Deep Drill',
    short: 'DEEP DRILL',
    cost: 320_000,
    days: 21,
    radius: 1,
    maxDepth: 200,
    noise: 0.15,
    desc: 'Proper drilling with real gold assays, down to ~200 m. This is what builds a resource. (Real term: reverse circulation / RC.)',
  },
  {
    tool: Tool.Diamond,
    name: 'Core Drill',
    short: 'CORE DRILL',
    cost: 600_000,
    days: 28,
    radius: 1,
    maxDepth: 280, // matches the Diamond Rig's reach — one source of truth
    noise: 0.07,
    desc: 'Expensive, but it pulls solid rock core the banks trust. Any depth. Needed for Measured. (Real term: diamond drilling.)',
  },
];

export interface Hole {
  x: number;
  y: number;
  tool: Tool;
}

export interface Knowledge {
  anomaly: Float32Array; // 0..1 surface signal per tile
  known: Uint8Array; // 1 = direct drill estimate exists
  est: Float32Array; // estimated oz where known
  resOz: Float32Array; // per-tile resource ounces (est or interpolated)
  cls: Uint8Array; // Cls per tile
  holes: Hole[];
  soiled: Uint8Array; // 1 = covered by a soil/AC surface program (render hint)
}

export function newKnowledge(): Knowledge {
  return {
    anomaly: new Float32Array(MAP * MAP),
    known: new Uint8Array(MAP * MAP),
    est: new Float32Array(MAP * MAP),
    resOz: new Float32Array(MAP * MAP),
    cls: new Uint8Array(MAP * MAP),
    holes: [],
    soiled: new Uint8Array(MAP * MAP),
  };
}

export interface ProgramResult {
  tool: Tool;
  hitOz: number; // estimated ounces at the collar tile (drilling tools)
  bestGrade: number; // g/t flavour for the announcement
  blindBelow: boolean; // mineralization exists deeper than this tool can see
}

/** Deterministic assay noise per (seed, tile, tool) — replays identically. */
function assayNoise(seed: string, x: number, y: number, tool: Tool): number {
  return new Rng(`${seed}:assay:${x},${y}:${tool}`).gauss();
}

export function applyProgram(
  world: World,
  k: Knowledge,
  tool: Tool,
  cx: number,
  cy: number,
): ProgramResult {
  const spec = TOOLS[tool];
  const result: ProgramResult = { tool, hitOz: 0, bestGrade: 0, blindBelow: false };

  if (tool === Tool.Soil || tool === Tool.Aircore) {
    // Surface AOE: every tile in radius gets an anomaly signal — but only for
    // mineralization shallow enough for this tool to sense.
    for (let y = cy - spec.radius; y <= cy + spec.radius; y++) {
      for (let x = cx - spec.radius; x <= cx + spec.radius; x++) {
        if (!inMap(x, y) || Math.hypot(x - cx, y - cy) > spec.radius + 0.4) continue;
        const t = world.tiles[idx(x, y)];
        // Signal attenuates with cover depth beyond the tool's reach rather
        // than cutting off — dispersion lets soils "see" a little deeper,
        // faintly. Blind by ~40 m past maxDepth.
        const atten =
          t.depth <= spec.maxDepth ? 1 : Math.max(0, 1 - (t.depth - spec.maxDepth) / 40);
        const sensed = t.oz > 0 ? Math.min(1, t.oz / 3500) * atten : 0;
        const n = 0.65 + 0.6 * Math.abs(assayNoise(world.seed, x, y, tool)) * spec.noise;
        const signal = Math.min(1, sensed * n);
        const i = idx(x, y);
        k.anomaly[i] = Math.max(k.anomaly[i], signal);
        k.soiled[i] = 1;
        if (signal > 0.15) result.bestGrade = Math.max(result.bestGrade, t.grade * 0.5);
      }
    }
  }

  if (tool === Tool.Aircore || tool === Tool.RC || tool === Tool.Diamond) {
    // Point data at the collar tile.
    const t = world.tiles[idx(cx, cy)];
    const i = idx(cx, cy);
    const seen = t.oz > 0 && t.depth <= spec.maxDepth;
    const est = seen
      ? Math.max(0, t.oz * (1 + assayNoise(world.seed, cx, cy, tool) * spec.noise))
      : 0;
    k.known[i] = 1;
    k.est[i] = Math.max(k.est[i], est);
    if (tool !== Tool.Aircore) k.holes.push({ x: cx, y: cy, tool });
    result.hitOz = est;
    result.bestGrade = Math.max(result.bestGrade, seen ? t.grade : 0);
    result.blindBelow = t.oz > 0 && t.depth > spec.maxDepth;
    if (est > 300) k.anomaly[i] = Math.max(k.anomaly[i], Math.min(1, est / 3500));
  }

  classify(k);
  return result;
}

/**
 * JORC classification per tile from drill spacing & quality (translated from
 * real practice):
 *   Measured  — a hole ≤1.5 tiles away, ≥3 holes within 2.5, incl. ≥1 diamond
 *   Indicated — a hole ≤2.5 tiles away and ≥2 holes within 2.5
 *   Inferred  — a hole ≤4 tiles away with surface-anomaly geological support
 */
export function classify(k: Knowledge): void {
  k.cls.fill(Cls.None);
  k.resOz.fill(0);
  if (k.holes.length === 0) return;

  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      let d1 = Infinity;
      let near = 0;
      let hasDD = false;
      let wSum = 0;
      let wOz = 0;
      for (const h of k.holes) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < d1) d1 = d;
        if (d <= 2.5) {
          near++;
          if (h.tool === Tool.Diamond) hasDD = true;
        }
        if (d <= 4) {
          const w = 1 / Math.pow(d + 0.4, 2);
          wSum += w;
          wOz += w * k.est[idx(h.x, h.y)];
        }
      }

      let c: number = Cls.None;
      if (d1 <= 1.5 && near >= 3 && hasDD) c = Cls.Measured;
      else if (d1 <= 2.5 && near >= 2) c = Cls.Indicated;
      else if (d1 <= 4 && k.anomaly[idx(x, y)] > 0.22) c = Cls.Inferred;
      if (c === Cls.None) continue;

      const i = idx(x, y);
      const oz = k.known[i] ? k.est[i] : wSum > 0 ? wOz / wSum : 0;
      if (oz > 150) {
        k.cls[i] = c;
        k.resOz[i] = oz;
      }
    }
  }
}

export interface ResourceTotals {
  measured: number;
  indicated: number;
  inferred: number;
  total: number;
  bankableShare: number; // M+I / total
}

export function resourceTotals(k: Knowledge): ResourceTotals {
  let m = 0;
  let i2 = 0;
  let f = 0;
  for (let i = 0; i < k.cls.length; i++) {
    if (k.cls[i] === Cls.Measured) m += k.resOz[i];
    else if (k.cls[i] === Cls.Indicated) i2 += k.resOz[i];
    else if (k.cls[i] === Cls.Inferred) f += k.resOz[i];
  }
  const total = m + i2 + f;
  return {
    measured: m,
    indicated: i2,
    inferred: f,
    total,
    bankableShare: total > 0 ? (m + i2) / total : 0,
  };
}

/** Cost multiplier / permission for sampling a given terrain. */
export function terrainAccess(t: Terrain): { allowed: boolean; costMult: number; note?: string } {
  if (t === Terrain.Heritage) {
    return { allowed: false, costMult: 1, note: 'Sacred ground. Not for sale.' };
  }
  if (t === Terrain.Highway) {
    return { allowed: false, costMult: 1, note: 'Main Roads would like a word. No.' };
  }
  if (t === Terrain.Windmill) {
    return { allowed: false, costMult: 1, note: 'Not the windmill. Have some respect.' };
  }
  if (t === Terrain.OldPit) {
    return { allowed: true, costMult: 0.5, note: 'Old-timers loosened it for you — half price.' };
  }
  if (t === Terrain.SaltLake) {
    return { allowed: true, costMult: 1.5, note: 'Salt lake — bog mats and pain. +50% cost.' };
  }
  return { allowed: true, costMult: 1 };
}
