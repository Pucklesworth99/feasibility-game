/**
 * Isometric tenement renderer — "angled plan", McDonald's-game energy (D-020):
 * saturated flat colours, fat dark outlines, chunky multi-tile buildings on
 * cleared pads, and ambient animation (plant smoke, working rigs, gold
 * glints). All programmatic on Canvas 2D — still zero image assets.
 */

import { idx, inMap, MAP, OLD_PIT, Terrain, World } from '../core/world';
import { Cls, Knowledge, Tool } from '../core/survey';
import { defOf, Placed } from '../core/build';

export const TW = 56; // tile width in internal px — 20×20 grid, chunky tiles
export const TH = 28; // tile height
const LIFT = 24; // max elevation lift
const ORIGIN_X = (MAP * TW) / 2 + TW / 2;
const ORIGIN_Y = LIFT + 10;
const OUTLINE = '#221812';

export interface PitView {
  mask: Uint8Array;
  dug: boolean; // false = planned outline, true = excavated benches
}

/** Continuous knowledge heat: warm = interpolated grade, cold = tested-and-empty. */
export interface HeatView {
  warm: Float32Array; // 0..1 per tile
  cold: Float32Array; // 0..0.5 per tile
  smoke?: Float32Array; // 0..1 aeromag haze — where to LOOK, not where gold IS
}

export function canvasSize(): { w: number; h: number } {
  return { w: MAP * TW + TW, h: MAP * TH + TH + LIFT + 18 };
}

/** Tile → internal-canvas position of the diamond's top vertex.
 *  INTEGER-SNAPPED (Art Bible rule 3): the whole world lands on whole pixels,
 *  so the ink outlines stay ink instead of AA fuzz. */
export function tileScreen(x: number, y: number, elev: number): { sx: number; sy: number } {
  return {
    sx: Math.round(ORIGIN_X + ((x - y) * TW) / 2),
    sy: Math.round(ORIGIN_Y + ((x + y) * TH) / 2 - elev * LIFT),
  };
}

/** Grid-corner (not tile) → screen, at a fixed elevation. */
function cornerScreen(cx: number, cy: number, elev: number): { sx: number; sy: number } {
  return {
    sx: Math.round(ORIGIN_X + ((cx - cy) * TW) / 2),
    sy: Math.round(ORIGIN_Y + ((cx + cy) * TH) / 2 - elev * LIFT),
  };
}

/** ART BIBLE — named ramps, hue-shifted (shadows violet, highlights warm).
 *  "Darker" means the next ramp step, never rgb × k. */
export const PAL = {
  INK: '#221812',
  DIRT: ['#8C4430', '#C46A36', '#EA9A50'],
  ROCK: ['#4A3626', '#745636', '#A8845C'],
  SAND: ['#B99868', '#CEB68A', '#F2EBE0'],
  GOLD: ['#A6790E', '#D4A018', '#F0C040'],
  GLINT: '#FFF4B4',
  STEEL: ['#3A3F47', '#7C828C', '#C8CCD2'],
  HIDE: ['#6B4E34', '#8A6B48', '#A97D54'],
  CAT: '#D98E2B', // machinery bodywork — machinery and money never share a swatch
  ALERT: '#C94F3F',
  HIVIS: '#FF7A1A',
  GALAH: '#E8A0B4',
  WATER: '#3F7D8C',
  DUST: '#D6BEA0',
  SMOKE: '#787876',
} as const;

/** Elevation quantised to 3 ramp bands — no two-hundred shades of dirt. */
function band(elev: number): number {
  return elev < 0.28 ? 0 : elev < 0.42 ? 1 : 2;
}

/** Screen → tile. Inverts the base transform, then refines against elevation. */
export function pick(
  canvas: HTMLCanvasElement,
  ev: MouseEvent,
  world: World,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const { w: LW, h: LH } = canvasSize(); // logical px — independent of DPR backing store
  if (rect.width === 0 || rect.height === 0) return null; // not laid out yet
  const mx = ((ev.clientX - rect.left) / rect.width) * LW;
  const my = ((ev.clientY - rect.top) / rect.height) * LH;
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;

  const a = (mx - ORIGIN_X) / (TW / 2);
  const b = (my - ORIGIN_Y + 0.5 * LIFT) / (TH / 2); // assume mid elevation
  const bx = Math.round((a + b) / 2 - 0.5);
  const by = Math.round((b - a) / 2 - 0.5);

  // Topmost-in-painter's-order wins: the tile drawn LAST under the cursor is
  // the one the player sees, so it's the one they mean.
  let best: { x: number; y: number } | null = null;
  let bestOrder = -1;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = bx + dx;
      const y = by + dy;
      if (x < 0 || x >= MAP || y < 0 || y >= MAP) continue;
      const t = world.tiles[idx(x, y)];
      const { sx, sy } = tileScreen(x, y, t.elev);
      const px = Math.abs(mx - sx) / (TW / 2);
      const py = Math.abs(my - (sy + TH / 2)) / (TH / 2);
      if (px + py <= 1.02 && x + y > bestOrder) {
        bestOrder = x + y;
        best = { x, y };
      }
    }
  }
  return best;
}

function diamond(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + TW / 2, sy + TH / 2);
  ctx.lineTo(sx, sy + TH);
  ctx.lineTo(sx - TW / 2, sy + TH / 2);
  ctx.closePath();
}

/** Terrain colour = named ramp × quantised elevation band. Two Plain tiles
 *  at similar height are now the SAME colour — a palette, not a gradient. */
function terrainFill(t: Terrain, elev: number): string {
  const b = band(elev);
  switch (t) {
    case Terrain.Hill:
      return PAL.DIRT[Math.min(2, b + 1)];
    case Terrain.Outcrop:
      return PAL.ROCK[b];
    case Terrain.SaltLake:
      return PAL.SAND[2]; // salt is flat and blinding — one colour
    case Terrain.Creek:
      return PAL.SAND[Math.min(1, b)]; // dried sandy bed
    case Terrain.Highway:
      return PAL.STEEL[0]; // asphalt, flat-lit
    case Terrain.OldPit:
      return PAL.ROCK[Math.max(0, b - 1)];
    default:
      return PAL.DIRT[b]; // Plain, Workings, Heritage, Windmill share the dirt
  }
}

/** Per-terrain [shadow, base, light] for dither grain. Highway stays flat. */
const TERRAIN_RAMP: Partial<Record<Terrain, readonly [string, string, string]>> = {
  [Terrain.Plain]: [PAL.DIRT[0], PAL.DIRT[1], PAL.DIRT[2]],
  [Terrain.Hill]: [PAL.DIRT[1], PAL.DIRT[2], PAL.SAND[1]],
  [Terrain.Outcrop]: [PAL.ROCK[0], PAL.ROCK[1], PAL.ROCK[2]],
  [Terrain.SaltLake]: [PAL.SAND[1], PAL.SAND[2], '#FFFFFF'],
  [Terrain.Creek]: [PAL.SAND[0], PAL.SAND[1], PAL.SAND[2]],
  [Terrain.Workings]: [PAL.DIRT[0], PAL.DIRT[1], PAL.DIRT[2]],
  [Terrain.Heritage]: [PAL.DIRT[0], PAL.DIRT[1], PAL.DIRT[2]],
  [Terrain.OldPit]: [PAL.ROCK[0], PAL.ROCK[0], PAL.ROCK[1]],
  [Terrain.Windmill]: [PAL.DIRT[0], PAL.DIRT[1], PAL.DIRT[2]],
};

// Dither dots on an 8×8 cell — scattered so it tiles without a checkerboard.
// This is what turns flat vector fills into pixel-art ground grain.
const SHADE_DOTS = [[1, 1], [5, 4], [3, 6]];
const LIGHT_DOTS = [[4, 1], [1, 4], [6, 6]];
const texCache = new Map<Terrain, CanvasPattern | null>();

function terrainTexture(ctx: CanvasRenderingContext2D, terr: Terrain): CanvasPattern | null {
  if (texCache.has(terr)) return texCache.get(terr)!;
  const ramp = TERRAIN_RAMP[terr];
  if (!ramp) {
    texCache.set(terr, null);
    return null;
  }
  const oc = document.createElement('canvas');
  oc.width = 8;
  oc.height = 8;
  const o = oc.getContext('2d')!;
  o.fillStyle = ramp[1];
  o.fillRect(0, 0, 8, 8);
  const soft = terr === Terrain.SaltLake ? 1 : SHADE_DOTS.length; // salt barely grains
  o.fillStyle = ramp[0];
  for (let i = 0; i < soft; i++) o.fillRect(SHADE_DOTS[i][0], SHADE_DOTS[i][1], 2, 2);
  o.fillStyle = ramp[2];
  for (let i = 0; i < soft; i++) o.fillRect(LIGHT_DOTS[i][0], LIGHT_DOTS[i][1], 2, 2);
  const pat = ctx.createPattern(oc, 'repeat');
  texCache.set(terr, pat);
  return pat;
}

/** Depth into the pit per tile (0 = not pit, 1 = rim, higher = deeper).
 *  Multi-source BFS from every non-pit / off-map cell — this is the
 *  neighbour-awareness that makes the benches step correctly. */
function pitDepth(mask: Uint8Array): Int16Array {
  const depth = new Int16Array(MAP * MAP);
  const q: number[] = [];
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const i = idx(x, y);
      if (!mask[i]) continue;
      // Rim = a pit tile touching a non-pit or the map edge.
      let rim = false;
      for (let d = 0; d < 4 && !rim; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (!inMap(nx, ny) || !mask[idx(nx, ny)]) rim = true;
      }
      if (rim) {
        depth[i] = 1;
        q.push(i);
      }
    }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % MAP;
    const y = (i / MAP) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny);
      if (mask[j] && depth[j] === 0) {
        depth[j] = depth[i] + 1;
        q.push(j);
      }
    }
  }
  return depth;
}

// Bench floor palette: rim (lit) → deep (near-ink), for the terraced bowl.
const PIT_SHADE = ['#A8845C', '#745636', '#5A4230', '#43301F', '#2E2014'];

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  k: Knowledge,
  showFindings: boolean,
  hover: { x: number; y: number } | null,
  hoverRadius: number,
  planned: Array<{ x: number; y: number }>,
  buildings: Placed[],
  pit: PitView | null,
  tick: number,
  heat?: HeatView | null,
  flooded?: boolean,
): void {
  const { w, h } = canvasSize();
  ctx.fillStyle = '#0d0f13';
  ctx.fillRect(0, 0, w, h);

  // Painter's order: far (small x+y) → near.
  for (let s = 0; s <= 2 * (MAP - 1); s++) {
    for (let x = Math.max(0, s - MAP + 1); x <= Math.min(MAP - 1, s); x++) {
      const y = s - x;
      const t = world.tiles[idx(x, y)];
      const { sx, sy } = tileScreen(x, y, t.elev);
      const drop = t.elev * LIFT + 8;

      // Side skirts (fake 3D).
      ctx.fillStyle = 'rgba(34, 22, 15, 0.95)';
      ctx.beginPath();
      ctx.moveTo(sx - TW / 2, sy + TH / 2);
      ctx.lineTo(sx, sy + TH);
      ctx.lineTo(sx, sy + TH + drop);
      ctx.lineTo(sx - TW / 2, sy + TH / 2 + drop);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(56, 36, 24, 0.95)';
      ctx.beginPath();
      ctx.moveTo(sx + TW / 2, sy + TH / 2);
      ctx.lineTo(sx, sy + TH);
      ctx.lineTo(sx, sy + TH + drop);
      ctx.lineTo(sx + TW / 2, sy + TH / 2 + drop);
      ctx.closePath();
      ctx.fill();

      // Top face: a dither-grain pattern (carries its own base colour) turns
      // flat vector fills into pixel-art ground; highway stays flat asphalt.
      diamond(ctx, sx, sy);
      const tex = terrainTexture(ctx, t.terrain);
      ctx.fillStyle = tex ?? terrainFill(t.terrain, t.elev);
      ctx.fill();
      ctx.strokeStyle = 'rgba(34, 24, 18, 0.22)'; // the grid line is INK too
      ctx.lineWidth = 1;
      ctx.stroke();

      // Terrain detail — deterministic per tile.
      const hash = (x * 7 + y * 13) % 5;
      if (t.terrain === Terrain.Outcrop) {
        ctx.fillStyle = PAL.ROCK[0];
        ctx.fillRect(sx - 8 + hash, sy + 6, 7, 4);
        ctx.fillRect(sx + 2, sy + 10 + (hash % 2), 6, 3);
        ctx.fillRect(sx - 3, sy + 12, 4, 2);
      } else if (t.terrain === Terrain.Workings) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(sx - 5, sy + 7, 8, 7);
        ctx.fillStyle = PAL.ROCK[1];
        ctx.fillRect(sx + 5 + (hash % 2), sy + 10, 6, 4);
        ctx.strokeStyle = PAL.ROCK[0];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy + 7);
        ctx.lineTo(sx - 1, sy);
        ctx.lineTo(sx + 5, sy + 7);
        ctx.stroke();
      } else if (t.terrain === Terrain.Heritage) {
        ctx.strokeStyle = 'rgba(242, 235, 224, 0.7)'; // SAND light
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 9, sy + TH / 2 + 3);
        ctx.lineTo(sx - 1, sy + TH / 2 - 5);
        ctx.moveTo(sx - 3, sy + TH / 2 + 5);
        ctx.lineTo(sx + 5, sy + TH / 2 - 3);
        ctx.moveTo(sx + 3, sy + TH / 2 + 6);
        ctx.lineTo(sx + 10, sy + TH / 2 - 1);
        ctx.stroke();
      } else if (t.terrain === Terrain.Creek) {
        if (flooded) {
          // The creek remembers it's a creek.
          diamond(ctx, sx, sy);
          ctx.fillStyle = 'rgba(63, 125, 156, 0.88)';
          ctx.fill();
          ctx.strokeStyle = `rgba(210, 235, 240, ${0.3 + 0.25 * Math.sin(tick / 8 + x)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx - 8, sy + TH / 2 + 2);
          ctx.lineTo(sx + 6, sy + TH / 2 - 2);
          ctx.stroke();
        } else if (hash < 3) {
          // Dry bed: cracked sand + a river gum hanging on.
          ctx.strokeStyle = 'rgba(185, 152, 104, 0.8)'; // SAND shadow
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx - 7, sy + 8);
          ctx.lineTo(sx + 2, sy + 11);
          ctx.moveTo(sx - 1, sy + 5);
          ctx.lineTo(sx + 7, sy + 9);
          ctx.stroke();
          ctx.fillStyle = PAL.SAND[2];
          ctx.fillRect(sx - 1 + (hash - 1) * 5, sy + 3, 3, 9); // ghost-gum trunk
          ctx.fillStyle = 'rgba(104, 142, 76, 1)';
          ctx.fillRect(sx - 7 + (hash - 1) * 5, sy - 1, 14, 6);
        }
      } else if (t.terrain === Terrain.Highway) {
        // Centreline dashes crawl nowhere — it's a highway, it just IS.
        ctx.strokeStyle = PAL.SAND[2]; // road paint, not bullion
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(sx - TW / 4, sy + TH / 4);
        ctx.lineTo(sx + TW / 4, sy + (3 * TH) / 4);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (t.terrain === Terrain.OldPit) {
        // Abandoned benches, a rusty relic, a sagging fence — ROCK ink.
        diamond(ctx, sx, sy);
        ctx.strokeStyle = PAL.ROCK[0];
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = PAL.ROCK[0];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 5);
        ctx.lineTo(sx + TW / 4, sy + TH / 2);
        ctx.lineTo(sx, sy + TH - 5);
        ctx.lineTo(sx - TW / 4, sy + TH / 2);
        ctx.closePath();
        ctx.stroke();
        if (x === Math.floor(OLD_PIT.x) && y === Math.floor(OLD_PIT.y)) {
          // The rusted ute of legend, and its resident crow.
          ctx.fillStyle = 'rgba(34, 24, 18, 0.35)'; // even legends cast shadows
          ctx.fillRect(sx - 8, sy + 13, 11, 3);
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(sx - 5, sy + 8, 11, 5);
          ctx.fillStyle = PAL.DIRT[0]; // rust IS shadow-dirt — the desert wins
          ctx.fillRect(sx - 4, sy + 9, 9, 3);
          ctx.fillStyle = PAL.ROCK[0];
          ctx.fillRect(sx + 2, sy + 6, 3, 3); // cab
          const peck = tick % 55 < 9;
          ctx.fillStyle = PAL.INK;
          ctx.fillRect(sx - 3, peck ? sy + 6 : sy + 4, 3, 3); // crow
          ctx.fillRect(sx - 1, peck ? sy + 8 : sy + 3, 2, 1); // beak down/up
        }
      } else if (t.terrain === Terrain.SaltLake) {
        if (hash < 2) {
          // Heat shimmer off the salt.
          // Straight dashes, stepped rise — shimmer without AA spaghetti.
          const sh = Math.floor(tick / 9 + y) % 3;
          ctx.fillStyle = `rgba(255,255,255,${0.22 + 0.2 * Math.sin(tick / 7 + x * 2)})`;
          ctx.fillRect(sx - 8, sy + TH / 2 + 2 - sh, 6, 1);
          ctx.fillRect(sx + 2, sy + TH / 2 + 3 - sh, 6, 1);
        }
      } else if (t.terrain === Terrain.Windmill) {
        // Southern Cross windmill — steel legs inside ink, spinning in steps.
        ctx.fillStyle = 'rgba(34, 24, 18, 0.35)';
        ctx.fillRect(sx - 8, sy + 10, 10, 3); // grounded, like everything else
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy + 10);
        ctx.lineTo(sx, sy - 14);
        ctx.moveTo(sx + 4, sy + 10);
        ctx.lineTo(sx, sy - 14);
        ctx.stroke();
        ctx.strokeStyle = PAL.STEEL[1];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy + 10);
        ctx.lineTo(sx, sy - 14);
        ctx.moveTo(sx + 4, sy + 10);
        ctx.lineTo(sx, sy - 14);
        ctx.stroke();
        // Joints step (Art Bible rule 5): 8 quantised blade positions.
        const ang = (Math.floor(tick / 4) % 8) * (Math.PI / 4);
        ctx.strokeStyle = PAL.STEEL[2];
        ctx.lineWidth = 2;
        for (let b = 0; b < 6; b++) {
          const a = ang + (b * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(sx, sy - 14);
          ctx.lineTo(Math.round(sx + Math.cos(a) * 7), Math.round(sy - 14 + Math.sin(a) * 7));
          ctx.stroke();
        }
        ctx.fillStyle = PAL.STEEL[2];
        ctx.fillRect(sx + 6, sy - 16, 5, 3); // tail vane
      }

      // Knowledge paint. Heat mode (Gate 1.5+): every tap paints — hits warm,
      // misses cold. Falls back to the class ladder when no heat is supplied.
      const i = idx(x, y);
      if (heat) {
        // Bright yellow → white: a colour family the terrain never uses.
        // Intensities QUANTISED (rule 1 applies to alpha too): 4 heat steps,
        // 3 smoke steps, 2 cold steps — no per-tile colour snowflakes.
        const wv = Math.round(heat.warm[i] * 4) / 4;
        const cv = Math.round(heat.cold[i] * 2) / 2;
        if (wv > 0) {
          diamond(ctx, sx, sy);
          ctx.fillStyle = `rgba(255, ${228 + wv * 27}, ${60 + wv * 150}, ${0.4 + wv * 0.4})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(70, 45, 8, 0.55)';
          ctx.lineWidth = 2;
          ctx.stroke();
          if (wv > 0.6) {
            diamond(ctx, sx, sy);
            ctx.fillStyle = `rgba(255, 255, 235, ${(wv - 0.5) * 0.5})`;
            ctx.fill();
          }
        } else {
          const sm = heat.smoke ? Math.ceil(heat.smoke[i] * 3) / 3 : 0;
          if (sm > 0.3) {
            diamond(ctx, sx, sy);
            ctx.fillStyle = `rgba(167, 108, 246, ${0.1 + sm * 0.34})`;
            ctx.fill();
          }
          if (cv > 0) {
            diamond(ctx, sx, sy);
            ctx.fillStyle = `rgba(62, 105, 158, ${0.2 + cv * 0.5})`;
            ctx.fill();
            ctx.strokeStyle = 'rgba(20, 35, 60, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      } else if (showFindings) {
        const c = k.cls[i];
        const a = k.anomaly[i];
        if (c !== Cls.None) {
          diamond(ctx, sx, sy);
          ctx.fillStyle =
            c === Cls.Measured
              ? 'rgba(74, 222, 128, 0.6)'
              : c === Cls.Indicated
                ? 'rgba(250, 204, 21, 0.55)'
                : 'rgba(251, 146, 60, 0.5)';
          ctx.fill();
        } else if (a > 0.12) {
          diamond(ctx, sx, sy);
          ctx.fillStyle = `rgba(167, 108, 246, ${0.2 + a * 0.45})`;
          ctx.fill();
        } else if (k.soiled[i]) {
          diamond(ctx, sx, sy);
          ctx.fillStyle = 'rgba(126, 148, 172, 0.2)';
          ctx.fill();
        }
      }
    }
  }

  // Pit shell.
  if (pit && pit.dug) {
    // A terraced open-cut: concentric benches stepping down to the orebody,
    // each tile's walls drawn against its SHALLOWER neighbours.
    const depth = pitDepth(pit.mask);
    const maxD = Math.max(1, ...depth);
    for (let s = 0; s <= 2 * (MAP - 1); s++) {
      for (let x = Math.max(0, s - MAP + 1); x <= Math.min(MAP - 1, s); x++) {
        const y = s - x;
        const i = idx(x, y);
        const d = depth[i];
        if (!d) continue;
        const t = world.tiles[i];
        const { sx, sy } = tileScreen(x, y, t.elev);
        const shade = PIT_SHADE[Math.min(PIT_SHADE.length - 1, d - 1)];

        // Floor.
        diamond(ctx, sx, sy);
        ctx.fillStyle = shade;
        ctx.fill();

        // Terrace step: where a neighbour is SHALLOWER, this edge is a riser —
        // dark shadow line + a lit crest just inside → concentric benches.
        const nb = (nx: number, ny: number): number =>
          !inMap(nx, ny) || !pit.mask[idx(nx, ny)] ? 0 : depth[idx(nx, ny)];
        const T = { x: sx, y: sy };
        const R = { x: sx + TW / 2, y: sy + TH / 2 };
        const B = { x: sx, y: sy + TH };
        const L = { x: sx - TW / 2, y: sy + TH / 2 };
        const step = (a: { x: number; y: number }, b: { x: number; y: number }, nd: number): void => {
          if (nd >= d) return; // deeper/equal neighbour draws its own edge
          ctx.strokeStyle = 'rgba(20,12,6,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,238,205,0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - 2);
          ctx.lineTo(b.x, b.y - 2);
          ctx.stroke();
        };
        step(R, B, nb(x + 1, y)); // front-right edge
        step(B, L, nb(x, y + 1)); // front-left edge
        step(T, R, nb(x, y - 1)); // back-right
        step(L, T, nb(x - 1, y)); // back-left

        // Rubble speckle + bench crest lines toward deeper neighbours.
        const h = (x * 7 + y * 13) % 4;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(sx - 6 + h * 2, sy + 8, 2, 2);
        ctx.fillRect(sx + 3, sy + 5 + h, 2, 2);
        ctx.fillStyle = 'rgba(255,240,210,0.14)';
        ctx.fillRect(sx - 2, sy + 6, 2, 2);

        // Exposed orebody at the floor — the gold you're actually mining.
        if (t.oz > 4000 && d >= maxD - 1) {
          ctx.fillStyle = PAL.GOLD[1];
          ctx.fillRect(sx - 3, sy + 9, 2, 2);
          ctx.fillStyle = PAL.GLINT;
          ctx.fillRect(sx + 2, sy + 7, 2, 2);
        }

        // Rim highlight — the top edge of the whole pit catches the sun.
        if (d === 1) {
          diamond(ctx, sx, sy);
          ctx.strokeStyle = 'rgba(255,240,210,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  } else if (pit) {
    // Planned: faint wash + dashed rim, like a pit design drawing.
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const i = idx(x, y);
        if (!pit.mask[i]) continue;
        const t = world.tiles[i];
        const { sx, sy } = tileScreen(x, y, t.elev);
        let boundary = false;
        for (let dy = -1; dy <= 1 && !boundary; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inMap(x + dx, y + dy) || !pit.mask[idx(x + dx, y + dy)]) {
              boundary = true;
              break;
            }
          }
        }
        diamond(ctx, sx, sy);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fill();
        if (boundary) {
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = 'rgba(245, 245, 240, 0.7)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  // Drill collars (skip ones swallowed by a dug pit). Hits and misses look
  // different at a glance: gold marker vs. a grey stub — the map remembers.
  for (const hole of k.holes) {
    if (pit?.dug && pit.mask[idx(hole.x, hole.y)]) continue;
    const t = world.tiles[idx(hole.x, hole.y)];
    const { sx, sy } = tileScreen(hole.x, hole.y, t.elev);
    const hit = k.est[idx(hole.x, hole.y)] > 250;
    // Sun is screen-right: shadows fall LEFT (Art Bible rule 4).
    ctx.fillStyle = 'rgba(34,24,18,0.35)';
    ctx.fillRect(sx - 6, sy + TH / 2 - 1, 8, 3);
    if (hit) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(sx - 2, sy - 13, 6, 18);
      ctx.fillRect(sx - 6, sy - 15, 14, 5); // crossbar wears its ink too
      ctx.fillStyle = hole.tool === Tool.Diamond ? PAL.STEEL[2] : PAL.GOLD[2];
      ctx.fillRect(sx - 1, sy - 12, 4, 16);
      ctx.fillRect(sx - 5, sy - 14, 12, 3);
      ctx.fillStyle = PAL.GLINT;
      ctx.fillRect(sx, sy - 9, 2, 2); // glint
    } else {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(sx - 2, sy - 5, 6, 9);
      ctx.fillStyle = PAL.STEEL[1];
      ctx.fillRect(sx - 1, sy - 4, 4, 7);
    }
  }

  // Gold glints on high-confidence ground — the map twinkles where it pays.
  if (showFindings) {
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const i = idx(x, y);
        if (k.cls[i] !== Cls.Measured && !(k.known[i] && k.est[i] > 2600)) continue;
        if (pit?.dug && pit.mask[i]) continue;
        const phase = (tick + x * 13 + y * 29) % 140;
        if (phase >= 12) continue;
        const t = world.tiles[i];
        const { sx, sy } = tileScreen(x, y, t.elev);
        const gx = sx + ((x * 7 + y * 3) % 9) - 4;
        const gy = sy + 6 + ((x * 3 + y * 11) % 5) - 2;
        // 3-frame plus: small → big → small, pure fillRect (rule 3).
        const frame = phase < 4 ? 0 : phase < 8 ? 1 : 0;
        ctx.fillStyle = PAL.GLINT;
        if (frame === 0) {
          ctx.fillRect(gx - 1, gy, 3, 1);
          ctx.fillRect(gx, gy - 1, 1, 3);
        } else {
          ctx.fillRect(gx - 3, gy, 7, 1);
          ctx.fillRect(gx, gy - 3, 1, 7);
          ctx.fillRect(gx - 1, gy - 1, 3, 3);
        }
      }
    }
  }

  // Buildings — big, chunky, outlined, on cleared pads (D-020).
  for (const b of buildings) {
    drawBuilding(ctx, world, b, tick);
  }

  // Planned programs: dashed claim + a little working rig.
  for (const p of planned) {
    const t = world.tiles[idx(p.x, p.y)];
    const { sx, sy } = tileScreen(p.x, p.y, t.elev);
    diamond(ctx, sx, sy);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(240, 192, 64, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    // Rig: outlined mast + skid, with pulsing dust. Machinery wears CAT.
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(sx - 2, sy - 15, 6, 18);
    ctx.fillStyle = PAL.CAT;
    ctx.fillRect(sx - 1, sy - 14, 4, 16);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(sx - 6, sy + 2, 13, 4);
    if ((tick + p.x * 11) % 26 < 13) {
      ctx.fillStyle = 'rgba(214, 190, 160, 0.75)';
      ctx.beginPath();
      ctx.arc(sx + 7, sy - 2 - ((tick + p.x * 11) % 13) / 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Hover: AOE ghost + selected tile.
  if (hover) {
    if (hoverRadius > 0) {
      for (let dy = -hoverRadius; dy <= hoverRadius; dy++) {
        for (let dx = -hoverRadius; dx <= hoverRadius; dx++) {
          const x = hover.x + dx;
          const y = hover.y + dy;
          if (x < 0 || x >= MAP || y < 0 || y >= MAP) continue;
          if (Math.hypot(dx, dy) > hoverRadius + 0.4) continue;
          const t = world.tiles[idx(x, y)];
          const { sx, sy } = tileScreen(x, y, t.elev);
          diamond(ctx, sx, sy);
          ctx.fillStyle = 'rgba(212, 160, 24, 0.16)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(212, 160, 24, 0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    const t = world.tiles[idx(hover.x, hover.y)];
    const { sx, sy } = tileScreen(hover.x, hover.y, t.elev);
    diamond(ctx, sx, sy);
    ctx.strokeStyle = 'rgba(240, 192, 64, 1)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Cleared pad across the footprint + a chunky outlined structure on top. */
function drawBuilding(ctx: CanvasRenderingContext2D, world: World, b: Placed, tick: number): void {
  const def = defOf(b.key);
  const elev = world.tiles[idx(b.x, b.y)].elev;

  // Pad: one flat earthworks platform over the whole footprint.
  const c0 = cornerScreen(b.x, b.y, elev);
  const c1 = cornerScreen(b.x + def.w, b.y, elev);
  const c2 = cornerScreen(b.x + def.w, b.y + def.h, elev);
  const c3 = cornerScreen(b.x, b.y + def.h, elev);
  ctx.beginPath();
  ctx.moveTo(c0.sx, c0.sy);
  ctx.lineTo(c1.sx, c1.sy);
  ctx.lineTo(c2.sx, c2.sy);
  ctx.lineTo(c3.sx, c3.sy);
  ctx.closePath();
  ctx.fillStyle = b.key === 'tsf' ? PAL.ROCK[1] : b.key === 'camp' ? PAL.SAND[1] : PAL.STEEL[2];
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Footprint centre in screen space.
  const mid = cornerScreen(b.x + def.w / 2, b.y + def.h / 2, elev);
  const mx = mid.sx;
  const my = mid.sy;

  if (b.key === 'plant') {
    // Mill shed — STEEL ramp, top-lit.
    outlinedRect(ctx, mx - 26, my - 26, 32, 22, PAL.STEEL[1]);
    outlinedRect(ctx, mx - 26, my - 31, 32, 6, PAL.STEEL[2]); // roof
    // Ball mill cylinder — stripe steps through 4 positions (rule 5).
    outlinedRect(ctx, mx - 20, my - 9, 20, 8, PAL.STEEL[1]);
    const spin = Math.floor(tick / 4) % 4;
    ctx.fillStyle = PAL.STEEL[0];
    ctx.fillRect(mx - 19 + spin * 5, my - 8, 4, 6);
    // Stack with a red band.
    outlinedRect(ctx, mx + 12, my - 40, 8, 38, PAL.STEEL[0]);
    ctx.fillStyle = PAL.ALERT;
    ctx.fillRect(mx + 13, my - 38, 6, 5);
    // Conveyor to the ROM pad — dashes crawl along the belt.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx - 26, my - 6);
    ctx.lineTo(mx - 44, my + 6);
    ctx.stroke();
    ctx.strokeStyle = PAL.CAT;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -Math.floor(tick / 4) * 2; // stepped crawl
    ctx.beginPath();
    ctx.moveTo(mx - 26, my - 6);
    ctx.lineTo(mx - 44, my + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    // Smoke — particle class: round, unoutlined, exempt (rule 2).
    for (let i = 0; i < 3; i++) {
      const puffY = (tick * 0.9 + i * 16) % 48;
      const alpha = Math.max(0, 0.55 - puffY / 90);
      ctx.fillStyle = `rgba(225, 225, 220, ${alpha})`;
      ctx.beginPath();
      ctx.arc(mx + 16 + Math.sin((tick + i * 20) / 14) * 3, my - 42 - puffY, 3 + puffY / 9, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (b.key === 'tsf') {
    // Embankment ring + process-water pond.
    const inset = 0.3;
    const p0 = cornerScreen(b.x + inset, b.y + inset, elev);
    const p1 = cornerScreen(b.x + def.w - inset, b.y + inset, elev);
    const p2 = cornerScreen(b.x + def.w - inset, b.y + def.h - inset, elev);
    const p3 = cornerScreen(b.x + inset, b.y + def.h - inset, elev);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy);
    ctx.closePath();
    ctx.fillStyle = PAL.WATER;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Pond shimmer — water particle, stepped drift.
    ctx.fillStyle = `rgba(210, 235, 240, ${0.25 + 0.2 * Math.sin(tick / 10)})`;
    ctx.fillRect(mx - 12 + (Math.floor(tick / 8) % 3) * 3, my - 5, 12, 2);
    // Discharge pipe.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, my - TH * 0.9);
    ctx.lineTo(mx, my - TH * 1.6);
    ctx.stroke();
  } else {
    // Camp: rows of dongas + the mess. SAND walls, HIDE roofs.
    outlinedRect(ctx, mx - 26, my - 16, 14, 9, PAL.SAND[2]);
    outlinedRect(ctx, mx - 8, my - 13, 14, 9, PAL.SAND[2]);
    outlinedRect(ctx, mx + 10, my - 16, 14, 9, PAL.SAND[2]);
    ctx.fillStyle = PAL.HIDE[0];
    ctx.fillRect(mx - 26, my - 19, 14, 4);
    ctx.fillRect(mx - 8, my - 16, 14, 4);
    ctx.fillRect(mx + 10, my - 19, 14, 4);
    // Flagpole — steel in ink, like the windmill.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx + 28, my - 8);
    ctx.lineTo(mx + 28, my - 26);
    ctx.stroke();
    ctx.strokeStyle = PAL.STEEL[1];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx + 28, my - 8);
    ctx.lineTo(mx + 28, my - 26);
    ctx.stroke();
    ctx.fillStyle = PAL.GOLD[1];
    ctx.fillRect(mx + 28, my - 26, 7, 4);
  }
}

function outlinedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}
