/**
 * Isometric tenement renderer — "angled plan", McDonald's-game energy (D-020):
 * saturated flat colours, fat dark outlines, chunky multi-tile buildings on
 * cleared pads, and ambient animation (plant smoke, working rigs, gold
 * glints). All programmatic on Canvas 2D — still zero image assets.
 */

import { idx, inMap, MAP, Terrain, World } from '../core/world';
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
}

export function canvasSize(): { w: number; h: number } {
  return { w: MAP * TW + TW, h: MAP * TH + TH + LIFT + 18 };
}

/** Tile → internal-canvas position of the diamond's top vertex. */
export function tileScreen(x: number, y: number, elev: number): { sx: number; sy: number } {
  return {
    sx: ORIGIN_X + ((x - y) * TW) / 2,
    sy: ORIGIN_Y + ((x + y) * TH) / 2 - elev * LIFT,
  };
}

/** Grid-corner (not tile) → screen, at a fixed elevation. */
function cornerScreen(cx: number, cy: number, elev: number): { sx: number; sy: number } {
  return {
    sx: ORIGIN_X + ((cx - cy) * TW) / 2,
    sy: ORIGIN_Y + ((cx + cy) * TH) / 2 - elev * LIFT,
  };
}

/** Screen → tile. Inverts the base transform, then refines against elevation. */
export function pick(
  canvas: HTMLCanvasElement,
  ev: MouseEvent,
  world: World,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const mx = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const my = ((ev.clientY - rect.top) / rect.height) * canvas.height;

  const a = (mx - ORIGIN_X) / (TW / 2);
  const b = (my - ORIGIN_Y + 0.5 * LIFT) / (TH / 2); // assume mid elevation
  const bx = Math.round((a + b) / 2 - 0.5);
  const by = Math.round((b - a) / 2 - 0.5);

  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx;
      const y = by + dy;
      if (x < 0 || x >= MAP || y < 0 || y >= MAP) continue;
      const t = world.tiles[idx(x, y)];
      const { sx, sy } = tileScreen(x, y, t.elev);
      const px = Math.abs(mx - sx) / (TW / 2);
      const py = Math.abs(my - (sy + TH / 2)) / (TH / 2);
      if (px + py <= 1.15) {
        const d = px + py;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
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

function shade(r: number, g: number, b: number, k: number): string {
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

/** Saturated flat-colour terrain — pops like a cartoon, shades with height. */
function terrainFill(t: Terrain, elev: number): string {
  const k = 0.78 + elev * 0.45;
  switch (t) {
    case Terrain.Plain:
      return shade(196, 106, 54, k);
    case Terrain.Hill:
      return shade(186, 132, 82, k + 0.08);
    case Terrain.Outcrop:
      return shade(116, 86, 54, k);
    case Terrain.SaltLake:
      return shade(242, 235, 224, 0.96 + elev * 0.04);
    case Terrain.Creek:
      return shade(74, 138, 74, k);
    case Terrain.Workings:
      return shade(178, 100, 52, k);
    case Terrain.Heritage:
      return shade(164, 104, 82, k * 0.92);
    default:
      return shade(196, 106, 54, k);
  }
}

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

      // Top face + edge so tiles read individually.
      diamond(ctx, sx, sy);
      ctx.fillStyle = terrainFill(t.terrain, t.elev);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Terrain detail — deterministic per tile.
      const hash = (x * 7 + y * 13) % 5;
      if (t.terrain === Terrain.Outcrop) {
        ctx.fillStyle = 'rgba(58, 44, 32, 0.95)';
        ctx.fillRect(sx - 8 + hash, sy + 6, 7, 4);
        ctx.fillRect(sx + 2, sy + 10 + (hash % 2), 6, 3);
        ctx.fillRect(sx - 3, sy + 12, 4, 2);
      } else if (t.terrain === Terrain.Workings) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(sx - 5, sy + 7, 8, 7);
        ctx.fillStyle = 'rgba(122, 92, 62, 1)';
        ctx.fillRect(sx + 5 + (hash % 2), sy + 10, 6, 4);
        ctx.strokeStyle = 'rgba(64, 48, 34, 1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy + 7);
        ctx.lineTo(sx - 1, sy);
        ctx.lineTo(sx + 5, sy + 7);
        ctx.stroke();
      } else if (t.terrain === Terrain.Heritage) {
        ctx.strokeStyle = 'rgba(248, 240, 224, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 9, sy + TH / 2 + 3);
        ctx.lineTo(sx - 1, sy + TH / 2 - 5);
        ctx.moveTo(sx - 3, sy + TH / 2 + 5);
        ctx.lineTo(sx + 5, sy + TH / 2 - 3);
        ctx.moveTo(sx + 3, sy + TH / 2 + 6);
        ctx.lineTo(sx + 10, sy + TH / 2 - 1);
        ctx.stroke();
      } else if (t.terrain === Terrain.Creek && hash < 3) {
        ctx.fillStyle = 'rgba(48, 66, 40, 1)';
        ctx.fillRect(sx - 1 + (hash - 1) * 5, sy + 4, 3, 8);
        ctx.fillStyle = 'rgba(104, 142, 76, 1)';
        ctx.fillRect(sx - 6 + (hash - 1) * 5, sy + 1, 12, 6);
      }

      // Knowledge paint. Heat mode (Gate 1.5+): every tap paints — hits warm,
      // misses cold. Falls back to the class ladder when no heat is supplied.
      const i = idx(x, y);
      if (heat) {
        // Bright yellow → white: a colour family the terrain never uses, so
        // the knowledge layer pops off the red dirt instead of staining it.
        const wv = heat.warm[i];
        const cv = heat.cold[i];
        if (wv > 0.02) {
          diamond(ctx, sx, sy);
          const b = Math.round(60 + wv * 150);
          ctx.fillStyle = `rgba(255, ${Math.round(228 + wv * 27)}, ${b}, ${0.4 + wv * 0.4})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(70, 45, 8, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (wv > 0.6) {
            diamond(ctx, sx, sy);
            ctx.fillStyle = `rgba(255, 255, 235, ${(wv - 0.6) * 0.6})`;
            ctx.fill();
          }
        } else if (cv > 0.02) {
          diamond(ctx, sx, sy);
          ctx.fillStyle = `rgba(62, 105, 158, ${0.2 + cv * 0.6})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(20, 35, 60, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
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
  if (pit) {
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
        if (pit.dug) {
          // Excavated: benches at the rim, deeper floor inside.
          ctx.fillStyle = boundary ? '#6b543c' : '#463526';
          ctx.fill();
          ctx.strokeStyle = 'rgba(20, 14, 9, 0.8)';
          ctx.lineWidth = boundary ? 2 : 1;
          ctx.stroke();
        } else {
          // Planned: faint wash + dashed rim, like a pit design drawing.
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
  }

  // Drill collars (skip ones swallowed by a dug pit). Hits and misses look
  // different at a glance: gold marker vs. a grey stub — the map remembers.
  for (const hole of k.holes) {
    if (pit?.dug && pit.mask[idx(hole.x, hole.y)]) continue;
    const t = world.tiles[idx(hole.x, hole.y)];
    const { sx, sy } = tileScreen(hole.x, hole.y, t.elev);
    const hit = k.est[idx(hole.x, hole.y)] > 250;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx - 3, sy + TH / 2 - 1, 8, 3);
    if (hit) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(sx - 2, sy - 13, 6, 18);
      ctx.fillStyle = hole.tool === Tool.Diamond ? '#f4f4f2' : '#f0c040';
      ctx.fillRect(sx - 1, sy - 12, 4, 16);
      ctx.fillRect(sx - 5, sy - 14, 12, 3);
      ctx.fillStyle = '#fff4b4';
      ctx.fillRect(sx, sy - 9, 2, 2); // glint
    } else {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(sx - 2, sy - 5, 6, 9);
      ctx.fillStyle = '#8a8f98';
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
        const r = phase < 6 ? phase / 2 : (12 - phase) / 2;
        ctx.strokeStyle = 'rgba(255, 244, 180, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx - r * 2, gy);
        ctx.lineTo(gx + r * 2, gy);
        ctx.moveTo(gx, gy - r);
        ctx.lineTo(gx, gy + r);
        ctx.stroke();
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
    // Rig: outlined mast + skid, with pulsing dust.
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(sx - 2, sy - 15, 6, 18);
    ctx.fillStyle = '#e8c559';
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
  ctx.fillStyle = b.key === 'tsf' ? '#96794f' : b.key === 'camp' ? '#cdb98e' : '#b3b8bf';
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Footprint centre in screen space.
  const mid = cornerScreen(b.x + def.w / 2, b.y + def.h / 2, elev);
  const mx = mid.sx;
  const my = mid.sy;

  if (b.key === 'plant') {
    // Mill shed.
    outlinedRect(ctx, mx - 26, my - 26, 32, 22, '#8d939c');
    outlinedRect(ctx, mx - 26, my - 31, 32, 6, '#c8ccd2'); // roof
    // Ball mill cylinder — with a rotating stripe so it visibly TURNS.
    outlinedRect(ctx, mx - 20, my - 9, 20, 8, '#7c828c');
    const spin = (tick % 16) / 16;
    ctx.fillStyle = '#5a6068';
    ctx.fillRect(mx - 19 + spin * 14, my - 8, 4, 6);
    // Stack with a red band.
    outlinedRect(ctx, mx + 12, my - 40, 8, 38, '#6b7078');
    ctx.fillStyle = '#c94f3f';
    ctx.fillRect(mx + 13, my - 38, 6, 5);
    // Conveyor to the ROM pad — dashes crawl along the belt.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx - 26, my - 6);
    ctx.lineTo(mx - 44, my + 6);
    ctx.stroke();
    ctx.strokeStyle = '#e8c559';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -(tick % 40) / 2.5;
    ctx.beginPath();
    ctx.moveTo(mx - 26, my - 6);
    ctx.lineTo(mx - 44, my + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    // Smoke — the plant is alive.
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
    ctx.fillStyle = '#3f7d8c';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Pond shimmer.
    ctx.strokeStyle = `rgba(210, 235, 240, ${0.25 + 0.2 * Math.sin(tick / 10)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - 12, my - 2);
    ctx.lineTo(mx + 4, my - 6);
    ctx.stroke();
    // Discharge pipe.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mx, my - TH * 0.9);
    ctx.lineTo(mx, my - TH * 1.6);
    ctx.stroke();
  } else {
    // Camp: rows of dongas + the mess.
    outlinedRect(ctx, mx - 26, my - 16, 14, 9, '#f2ede2');
    outlinedRect(ctx, mx - 8, my - 13, 14, 9, '#f2ede2');
    outlinedRect(ctx, mx + 10, my - 16, 14, 9, '#f2ede2');
    ctx.fillStyle = '#7c6a48';
    ctx.fillRect(mx - 26, my - 19, 14, 4);
    ctx.fillRect(mx - 8, my - 16, 14, 4);
    ctx.fillRect(mx + 10, my - 19, 14, 4);
    // Flagpole.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx + 28, my - 8);
    ctx.lineTo(mx + 28, my - 26);
    ctx.stroke();
    ctx.fillStyle = '#e8b60f';
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
