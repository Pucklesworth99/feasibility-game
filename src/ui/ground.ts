/**
 * The Ground — pixel cross-section renderer. Fog of war over the truth,
 * grade revealed down drill holes, optional confidence (JORC class) overlay.
 * Everything is drawn programmatically: zero image assets.
 */

import { CUTOFF, Deposit, GRID_H, GRID_W } from '../core/deposit';
import { Cls } from '../core/estimate';

export const PX = 8; // internal pixels per cell
const SKY_ROWS = 4;

export interface DrillHole {
  x: number; // column
  depth: number; // revealed depth in cells (animates towards GRID_H)
}

export interface GroundView {
  showConfidence: boolean;
}

const W = GRID_W * PX;
const H = (GRID_H + SKY_ROWS) * PX;

export function canvasSize(): { w: number; h: number } {
  return { w: W, h: H };
}

/** Map a pointer event on the canvas to a grid column, or -1. */
export function eventToColumn(canvas: HTMLCanvasElement, ev: MouseEvent): number {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * GRID_W);
  return x >= 0 && x < GRID_W ? x : -1;
}

export function render(
  ctx: CanvasRenderingContext2D,
  dep: Deposit,
  holes: DrillHole[],
  cls: Uint8Array | null,
  view: GroundView,
  hoverCol: number,
): void {
  // Sky.
  ctx.fillStyle = '#1a2233';
  ctx.fillRect(0, 0, W, SKY_ROWS * PX);

  // Unknown ground — depth-shaded fog with a subtle dither.
  for (let y = 0; y < GRID_H; y++) {
    const t = y / GRID_H;
    ctx.fillStyle = fogColor(t);
    ctx.fillRect(0, (y + SKY_ROWS) * PX, W, PX);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let y = 0; y < GRID_H; y++) {
    for (let x = (y % 2); x < GRID_W; x += 2) {
      ctx.fillRect(x * PX, (y + SKY_ROWS) * PX, PX, PX);
    }
  }

  // Surface line.
  ctx.fillStyle = '#4a5d3a';
  ctx.fillRect(0, SKY_ROWS * PX - 2, W, 2);

  // Confidence overlay: classified columns tinted behind the reveals.
  if (view.showConfidence && cls) {
    for (let x = 0; x < GRID_W; x++) {
      // Column class = the class of any classified cell in it (uniform per column).
      let c: number = Cls.None;
      for (let y = 0; y < GRID_H; y++) {
        const v = cls[y * GRID_W + x];
        if (v > c) c = v;
      }
      if (c === Cls.None) continue;
      ctx.fillStyle =
        c === Cls.Measured
          ? 'rgba(74, 222, 128, 0.16)'
          : c === Cls.Indicated
            ? 'rgba(250, 204, 21, 0.14)'
            : 'rgba(251, 146, 60, 0.12)';
      ctx.fillRect(x * PX, SKY_ROWS * PX, PX, GRID_H * PX);
    }
  }

  // Drill holes: revealed truth down each column.
  for (const hole of holes) {
    const x = hole.x;
    const revealed = Math.min(hole.depth, GRID_H);
    for (let y = 0; y < revealed; y++) {
      const g = dep.grade[y * GRID_W + x];
      ctx.fillStyle = y < dep.overburden ? '#3d3428' : gradeColor(g, y / GRID_H);
      ctx.fillRect(x * PX, (y + SKY_ROWS) * PX, PX, PX);
    }
    // Hole trace + collar tick.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x * PX + PX / 2 - 1, SKY_ROWS * PX, 1, revealed * PX);
    drawRig(ctx, x, hole.depth < GRID_H);
  }

  // Hover ghost — where the next hole would go.
  if (hoverCol >= 0) {
    ctx.fillStyle = 'rgba(212, 160, 24, 0.25)';
    ctx.fillRect(hoverCol * PX, SKY_ROWS * PX, PX, GRID_H * PX);
    ctx.fillStyle = 'rgba(212, 160, 24, 0.9)';
    ctx.fillRect(hoverCol * PX, SKY_ROWS * PX - 6, PX, 4);
  }
}

/** Tiny programmatic drill rig at the collar; mast lit while drilling. */
function drawRig(ctx: CanvasRenderingContext2D, x: number, active: boolean): void {
  const cx = x * PX;
  const groundY = SKY_ROWS * PX;
  ctx.fillStyle = active ? '#e8c559' : '#8a8f98';
  ctx.fillRect(cx + PX / 2 - 1, groundY - 12, 2, 12); // mast
  ctx.fillRect(cx, groundY - 4, PX, 3); // skid
}

function fogColor(t: number): string {
  // Dark slate deepening with depth.
  const r = Math.round(38 - 14 * t);
  const g = Math.round(41 - 15 * t);
  const b = Math.round(48 - 14 * t);
  return `rgb(${r},${g},${b})`;
}

/** Grade → colour ramp: barren rock browns → olive → gold → near-white bonanza. */
function gradeColor(g: number, depthT: number): string {
  if (g < CUTOFF) {
    // Waste rock, banded slightly by depth for texture.
    const base = 78 - Math.round(18 * depthT);
    return `rgb(${base + 12},${base},${base - 10})`;
  }
  if (g < 1) return '#6b6b2e';
  if (g < 2) return '#8f7818';
  if (g < 3.5) return '#b8860b';
  if (g < 6) return '#d4a018';
  if (g < 9) return '#f0c040';
  return '#fff0a0';
}
