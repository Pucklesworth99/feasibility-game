/**
 * Phase 3 lite — site your infrastructure, then find out whether the pit
 * agrees with you. The estimated pit outline comes from what you KNOW
 * (classified tiles); the true pit comes from what's THERE. Anything you
 * build inside the true pit gets relocated at great expense — the
 * "don't sterilise your orebody" lesson, payable in cash.
 */

import { idx, inMap, MAP, Terrain, World } from './world';
import { Cls } from './estimate';
import { Knowledge } from './survey';

export type BuildingKey = 'plant' | 'tsf' | 'camp';

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  short: string;
  desc: string;
}

export const BUILDINGS: BuildingDef[] = [
  {
    key: 'plant',
    name: 'Process Plant',
    short: 'PLANT',
    desc: 'Where rock becomes money. Big, expensive, and very annoying to move.',
  },
  {
    key: 'tsf',
    name: 'Tailings Dam',
    short: 'TAILINGS',
    desc: 'Where the leftover ground goes, forever. Keep it AWAY from the creek.',
  },
  {
    key: 'camp',
    name: 'Camp',
    short: 'CAMP',
    desc: 'Beds, a dry mess, a wet mess. Morale lives here.',
  },
];

export interface Placed {
  key: BuildingKey;
  x: number;
  y: number;
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
    const def = BUILDINGS.find((d) => d.key === b.key)!;
    if (pit[idx(b.x, b.y)]) {
      out.push({
        cost: 6_000_000,
        line: `The pit's later pushbacks wanted the ground under your ${def.name}. Relocation: $6.0M. Every consultant has this war story — now you have yours.`,
      });
    }
    if (b.key === 'tsf') {
      let nearCreek = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (inMap(b.x + dx, b.y + dy) && world.tiles[idx(b.x + dx, b.y + dy)].terrain === Terrain.Creek) {
            nearCreek = true;
          }
        }
      }
      if (nearCreek) {
        out.push({
          cost: 8_000_000,
          line: 'The tailings dam seeps toward the creek. The regulator\'s letter is not friendly: $8.0M in lining, monitoring and apologies.',
        });
      }
    }
  }
  return out;
}
