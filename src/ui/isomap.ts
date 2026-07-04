/**
 * Isometric tenement renderer — "angled plan". Diamond tiles with elevation
 * lift and shaded side-skirts for a 2.5D feel, all drawn programmatically on
 * Canvas 2D. Zero image assets. Overlays paint knowledge (anomaly heat,
 * JORC confidence) over terrain; markers show drill collars.
 * 30×30 grid at chunky tile sizes — readable at a glance (D-016).
 */

import { idx, inMap, MAP, Terrain, World } from '../core/world';
import { Knowledge, Tool } from '../core/survey';
import { Cls } from '../core/estimate';
import { Placed } from '../core/build';

export const TW = 40; // tile width in internal px
export const TH = 20; // tile height
const LIFT = 20; // max elevation lift
const ORIGIN_X = (MAP * TW) / 2 + TW / 2;
const ORIGIN_Y = LIFT + 10;

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

/** Base colour per terrain — high-contrast WA palette, lightened by elevation. */
function terrainFill(t: Terrain, elev: number): string {
  const k = 0.75 + elev * 0.5;
  switch (t) {
    case Terrain.Plain:
      return shade(178, 104, 62, k);
    case Terrain.Hill:
      return shade(168, 126, 88, k + 0.08);
    case Terrain.Outcrop:
      return shade(104, 82, 58, k);
    case Terrain.SaltLake:
      return shade(236, 229, 219, 0.96 + elev * 0.04);
    case Terrain.Creek:
      return shade(84, 128, 78, k);
    case Terrain.Workings:
      return shade(158, 96, 58, k);
    case Terrain.Heritage:
      return shade(148, 102, 78, k * 0.92);
    default:
      return shade(178, 104, 62, k);
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
  pitMask: Uint8Array | null,
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

      // Side skirts (fake 3D): left face dark, right face darker.
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

      // Top face + subtle edge so tiles read individually.
      diamond(ctx, sx, sy);
      ctx.fillStyle = terrainFill(t.terrain, t.elev);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Terrain detail — deterministic per tile, no assets.
      const hash = (x * 7 + y * 13) % 5;
      if (t.terrain === Terrain.Outcrop) {
        ctx.fillStyle = 'rgba(58, 44, 32, 0.9)';
        ctx.fillRect(sx - 8 + hash, sy + 6, 6, 3);
        ctx.fillRect(sx + 2, sy + 10 + (hash % 2), 5, 3);
        ctx.fillRect(sx - 3, sy + 12, 4, 2);
      } else if (t.terrain === Terrain.Workings) {
        // The old shaft + mullock heap + a tired headframe.
        ctx.fillStyle = 'rgba(24, 17, 12, 1)';
        ctx.fillRect(sx - 4, sy + 7, 7, 6);
        ctx.fillStyle = 'rgba(112, 84, 58, 0.95)';
        ctx.fillRect(sx + 5 + (hash % 2), sy + 10, 5, 3);
        ctx.strokeStyle = 'rgba(70, 54, 40, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx - 5, sy + 7);
        ctx.lineTo(sx - 1, sy + 1);
        ctx.lineTo(sx + 4, sy + 7);
        ctx.stroke();
      } else if (t.terrain === Terrain.Heritage) {
        ctx.strokeStyle = 'rgba(244, 236, 220, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx - 9, sy + TH / 2 + 3);
        ctx.lineTo(sx - 1, sy + TH / 2 - 5);
        ctx.moveTo(sx - 3, sy + TH / 2 + 5);
        ctx.lineTo(sx + 5, sy + TH / 2 - 3);
        ctx.moveTo(sx + 3, sy + TH / 2 + 6);
        ctx.lineTo(sx + 10, sy + TH / 2 - 1);
        ctx.stroke();
      } else if (t.terrain === Terrain.Creek && hash < 3) {
        ctx.fillStyle = 'rgba(52, 68, 44, 1)';
        ctx.fillRect(sx - 1 + (hash - 1) * 4, sy + 5, 2, 7); // trunk
        ctx.fillStyle = 'rgba(96, 128, 74, 0.95)';
        ctx.fillRect(sx - 5 + (hash - 1) * 4, sy + 2, 10, 5); // canopy
      }

      // The one knowledge ladder (D-017): Measured > Indicated > Inferred >
      // Prospective (surface smoke) > tested-and-quiet. One colour language.
      const i = idx(x, y);
      if (showFindings) {
        const c = k.cls[i];
        const a = k.anomaly[i];
        if (c !== Cls.None) {
          diamond(ctx, sx, sy);
          ctx.fillStyle =
            c === Cls.Measured
              ? 'rgba(74, 222, 128, 0.5)'
              : c === Cls.Indicated
                ? 'rgba(250, 204, 21, 0.45)'
                : 'rgba(251, 146, 60, 0.4)';
          ctx.fill();
        } else if (a > 0.12) {
          diamond(ctx, sx, sy);
          ctx.fillStyle = `rgba(167, 108, 246, ${0.16 + a * 0.4})`; // prospective
          ctx.fill();
        } else if (k.soiled[i]) {
          diamond(ctx, sx, sy);
          ctx.fillStyle = 'rgba(126, 148, 172, 0.18)'; // tested, quiet — also information
          ctx.fill();
        }
      }
    }
  }

  // Pit shell: faint fill, dashed boundary — drawn like a real pit design.
  if (pitMask) {
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        const i = idx(x, y);
        if (!pitMask[i]) continue;
        const t = world.tiles[i];
        const { sx, sy } = tileScreen(x, y, t.elev);
        diamond(ctx, sx, sy);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fill();
        let boundary = false;
        for (let dy = -1; dy <= 1 && !boundary; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!inMap(x + dx, y + dy) || !pitMask[idx(x + dx, y + dy)]) {
              boundary = true;
              break;
            }
          }
        }
        if (boundary) {
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = 'rgba(245, 245, 240, 0.65)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  // Drill collars — chunky enough to spot across the room.
  for (const hole of k.holes) {
    const t = world.tiles[idx(hole.x, hole.y)];
    const { sx, sy } = tileScreen(hole.x, hole.y, t.elev);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx - 3, sy + TH / 2 - 1, 7, 3); // shadow
    ctx.fillStyle = hole.tool === Tool.Diamond ? '#f4f4f2' : '#ffb84d';
    ctx.fillRect(sx - 1, sy - 10, 3, 13);
    ctx.fillRect(sx - 4, sy - 12, 9, 3);
  }

  // Infrastructure — programmatic pixel buildings.
  for (const b of buildings) {
    const t = world.tiles[idx(b.x, b.y)];
    const { sx, sy } = tileScreen(b.x, b.y, t.elev);
    if (b.key === 'plant') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(sx - 9, sy + TH / 2, 20, 3);
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(sx - 8, sy - 4, 14, 11);
      ctx.fillStyle = '#c8ccd2';
      ctx.fillRect(sx - 8, sy - 6, 14, 3);
      ctx.fillStyle = '#6b7078';
      ctx.fillRect(sx + 7, sy - 13, 3, 17);
      ctx.fillStyle = 'rgba(225,225,225,0.55)';
      ctx.fillRect(sx + 6, sy - 17, 6, 3);
    } else if (b.key === 'tsf') {
      diamond(ctx, sx, sy);
      ctx.fillStyle = '#7a6350';
      ctx.fill();
      ctx.strokeStyle = '#4c3d30';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#93826d';
      ctx.beginPath();
      ctx.ellipse(sx, sy + TH / 2, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#d8c9a3';
      ctx.fillRect(sx - 8, sy + 1, 7, 5);
      ctx.fillRect(sx + 2, sy + 4, 7, 5);
      ctx.fillStyle = '#8a7a55';
      ctx.fillRect(sx - 8, sy - 1, 7, 3);
      ctx.fillRect(sx + 2, sy + 2, 7, 3);
    }
  }

  // Planned programs: dashed outline + a little pennant on the tile.
  for (const p of planned) {
    const t = world.tiles[idx(p.x, p.y)];
    const { sx, sy } = tileScreen(p.x, p.y, t.elev);
    diamond(ctx, sx, sy);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(240, 192, 64, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#e8c559';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 2);
    ctx.lineTo(sx, sy - 12);
    ctx.stroke();
    ctx.fillStyle = '#f0c040';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 12);
    ctx.lineTo(sx + 9, sy - 9);
    ctx.lineTo(sx, sy - 6);
    ctx.closePath();
    ctx.fill();
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
