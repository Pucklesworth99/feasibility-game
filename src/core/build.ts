/**
 * Phase 3 lite — site your infrastructure, then find out whether the pit
 * agrees with you. Buildings occupy real multi-tile footprints (D-020);
 * the estimated pit outline comes from what you KNOW (classified tiles);
 * the true pit comes from what's THERE. Anything inside the true pit gets
 * relocated at great expense — "don't sterilise your orebody", in cash.
 */

import { idx, inMap, MAP, Terrain, World } from './world';
import { Cls, Knowledge } from './survey';

export type BuildingKey = 'plant' | 'tsf' | 'camp';

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  short: string;
  w: number; // footprint tiles along x
  h: number; // footprint tiles along y
  desc: string;
}

export const BUILDINGS: BuildingDef[] = [
  {
    key: 'plant',
    name: 'Process Plant',
    short: 'PLANT',
    w: 2,
    h: 2,
    desc: 'Where rock becomes money. Big, expensive, and very annoying to move. Takes a 2×2 pad.',
  },
  {
    key: 'tsf',
    name: 'Tailings Dam',
    short: 'TAILINGS',
    w: 2,
    h: 2,
    desc: 'Where the leftover ground goes, forever. 2×2 — and keep it AWAY from the creek.',
  },
  {
    key: 'camp',
    name: 'Camp',
    short: 'CAMP',
    w: 2,
    h: 1,
    desc: 'Beds, a dry mess, a wet mess. Morale lives here. 2×1.',
  },
];

export function defOf(key: BuildingKey): BuildingDef {
  return BUILDINGS.find((d) => d.key === key)!;
}

export interface Placed {
  key: BuildingKey;
  x: number; // anchor (top-left of footprint)
  y: number;
}

/** All tiles of a footprint anchored at (ax, ay), or null if out of bounds. */
export function footprintTiles(def: BuildingDef, ax: number, ay: number): Array<{ x: number; y: number }> | null {
  const out: Array<{ x: number; y: number }> = [];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      if (!inMap(ax + dx, ay + dy)) return null;
      out.push({ x: ax + dx, y: ay + dy });
    }
  }
  return out;
}

/** Which placed building (if any) covers tile (x, y). */
export function occupiedBy(buildings: Placed[], x: number, y: number): Placed | undefined {
  return buildings.find((b) => {
    const d = defOf(b.key);
    return x >= b.x && x < b.x + d.w && y >= b.y && y < b.y + d.h;
  });
}

/** Can this building sit here? Returns a human reason when it can't. */
export function canPlace(
  world: World,
  estPit: Uint8Array,
  buildings: Placed[],
  def: BuildingDef,
  ax: number,
  ay: number,
): { ok: boolean; reason?: string } {
  const tiles = footprintTiles(def, ax, ay);
  if (!tiles) return { ok: false, reason: 'No room — the footprint runs off the tenement.' };
  for (const t of tiles) {
    const terr = world.tiles[idx(t.x, t.y)].terrain;
    if (terr === Terrain.Heritage) return { ok: false, reason: 'Heritage area — nothing gets built here.' };
    if (terr === Terrain.Creek) return { ok: false, reason: "Part of the pad is in the creek. No." };
    if (occupiedBy(buildings, t.x, t.y)) return { ok: false, reason: 'Something is already built there.' };
    if (estPit[idx(t.x, t.y)]) {
      return { ok: false, reason: "That's inside the pit you've planned. The diggers would like that ground back." };
    }
  }
  return { ok: true };
}

/** Dilate a boolean tile mask by `grow` tiles (chebyshev). */
function dilate(mask: Uint8Array, grow: number): Uint8Array {
  let cur = mask;
  for (let g = 0; g < grow; g++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (!cur[idx(x, y)]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inMap(x + dx, y + dy)) next[idx(x + dx, y + dy)] = 1;
          }
        }
      }
    }
    cur = next;
  }
  return cur;
}

/** The pit you can PREDICT: classified tiles + one pushback ring. */
export function estimatedPit(k: Knowledge): Uint8Array {
  const base = new Uint8Array(MAP * MAP);
  for (let i = 0; i < base.length; i++) if (k.cls[i] !== Cls.None) base[i] = 1;
  return dilate(base, 1);
}

/** The pit the OREBODY wants: true ore tiles + one pushback ring. */
export function truePit(world: World): Uint8Array {
  const base = new Uint8Array(MAP * MAP);
  for (let i = 0; i < base.length; i++) if (world.tiles[i].oz > 150) base[i] = 1;
  return dilate(base, 1);
}

export interface SitingPenalty {
  cost: number;
  line: string;
}

/** Mark the siting homework against the true pit + the creek. */
export function sitingPenalties(world: World, buildings: Placed[]): SitingPenalty[] {
  const pit = truePit(world);
  const out: SitingPenalty[] = [];

  for (const b of buildings) {
    const def = defOf(b.key);
    const tiles = footprintTiles(def, b.x, b.y) ?? [];
    if (tiles.some((t) => pit[idx(t.x, t.y)])) {
      out.push({
        cost: 6_000_000,
        line: `The pit's later pushbacks wanted the ground under your ${def.name}. Relocation: $6.0M. Every consultant has this war story — now you have yours.`,
      });
    }
    if (b.key === 'tsf') {
      let nearCreek = false;
      for (const t of tiles) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inMap(t.x + dx, t.y + dy) && world.tiles[idx(t.x + dx, t.y + dy)].terrain === Terrain.Creek) {
              nearCreek = true;
            }
          }
        }
      }
      if (nearCreek) {
        out.push({
          cost: 8_000_000,
          line: "The tailings dam seeps toward the creek. The regulator's letter is not friendly: $8.0M in lining, monitoring and apologies.",
        });
      }
    }
  }
  return out;
}
