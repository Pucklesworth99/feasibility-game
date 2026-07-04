/**
 * GATE 1 — the Core Tray, naked (GAME-DESIGN-v4 §9).
 * Map + cash + ounces + tap-to-drill. Nothing else. If this loop isn't fun
 * on its own, nothing else gets built until it is.
 */

import './style.css';
import { generateWorld, idx, inMap, MAP, randomSeedName, Terrain, World } from './core/world';
import { applyProgram, Knowledge, newKnowledge, Tool } from './core/survey';
import { canvasSize, pick, render, tileScreen } from './ui/isomap';
import { floatText, flyNuggets, gradeStamp, showTray, Segment } from './ui/tray';
import { fmtMoney, fmtOz } from './core/econ';
import { isMuted, sDing, shake, sRattle, sSlam, sSting, sThud, sTick, toggleMute } from './ui/juice';

const START_CASH = 5_000_000;
const HOLE_COST = 250_000;
const RIG_REACH = 200; // metres — matches the RC assay model underneath
const SEGMENTS = 6;

interface Drilling {
  x: number;
  y: number;
  phase: 'slam' | 'drill';
  t0: number;
}

interface G1 {
  world: World;
  k: Knowledge;
  cash: number;
  oz: number;
  holes: number;
  drilling: Drilling | null;
  hover: { x: number; y: number } | null;
  fingerDone: boolean;
}

let S!: G1;
let animTick = 0;

// Continuous knowledge heat — recomputed after every hole. Hits paint warm
// blobs whose shape suggests the trend; misses paint cold. Every tap teaches.
const heatWarm = new Float32Array(MAP * MAP);
const heatCold = new Float32Array(MAP * MAP);

function recomputeHeat(): void {
  heatWarm.fill(0);
  heatCold.fill(0);
  if (S.k.holes.length === 0) return;
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      let sw = 0;
      let swv = 0;
      for (const h of S.k.holes) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d > 4.5) continue;
        const w = 1 / Math.pow(d + 0.5, 2);
        sw += w;
        swv += w * S.k.est[idx(h.x, h.y)];
      }
      if (sw < 0.045) continue;
      const v = swv / sw;
      const i = idx(x, y);
      if (v > 250) heatWarm[i] = Math.min(1, v / 4500);
      else heatCold[i] = Math.min(0.5, sw * 0.4);
    }
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('map');
const ctx = canvas.getContext('2d')!;
{
  const { w, h } = canvasSize();
  canvas.width = w;
  canvas.height = h;
}

const BARRY_QUIPS = [
  '"She felt good though, ay." — Barry',
  '"Rod bounce. Definitely rod bounce." — Barry',
  '"The gold\'s just shy, boss." — Barry',
  '"My cousin drilled here in \'09. Same." — Barry',
];

// ---------- Run lifecycle ----------

function newRun(seed: string): void {
  S = {
    world: generateWorld(seed),
    k: newKnowledge(),
    cash: START_CASH,
    oz: 0,
    holes: 0,
    drilling: null,
    hover: null,
    fingerDone: false,
  };
  heatWarm.fill(0);
  heatCold.fill(0);
  const u = new URL(location.href);
  u.searchParams.set('seed', seed);
  history.replaceState(null, '', u.toString());
  $('seed-name').textContent = seed;
  $('broke').classList.add('hidden');
  placeFinger();
  hud();
  draw();
  (window as unknown as { __G1: G1 }).__G1 = S;
}

/** Point the finger at the juiciest visible clue (old workings, else outcrop). */
function placeFinger(): void {
  const finger = $('finger');
  let target: { x: number; y: number } | null = null;
  for (let y = 0; y < MAP && !target; y++) {
    for (let x = 0; x < MAP; x++) {
      if (S.world.tiles[idx(x, y)].terrain === Terrain.Workings) {
        target = { x, y };
        break;
      }
    }
  }
  if (!target) {
    for (let y = 0; y < MAP && !target; y++) {
      for (let x = 0; x < MAP; x++) {
        if (S.world.tiles[idx(x, y)].terrain === Terrain.Outcrop) {
          target = { x, y };
          break;
        }
      }
    }
  }
  if (!target) target = { x: MAP >> 1, y: MAP >> 1 };
  const p = pagePos(target.x, target.y);
  finger.style.left = `${p.x - 14}px`;
  finger.style.top = `${p.y + 6}px`;
  finger.classList.remove('hidden');
  S.fingerDone = false;
}

// ---------- Coordinates ----------

function pagePos(x: number, y: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const t = S.world.tiles[idx(x, y)];
  const { sx, sy } = tileScreen(x, y, t.elev);
  return {
    x: rect.left + (sx / canvas.width) * rect.width,
    y: rect.top + ((sy + 10) / canvas.height) * rect.height,
  };
}

// ---------- The verb ----------

function tap(x: number, y: number): void {
  if (S.drilling) return;
  const tile = S.world.tiles[idx(x, y)];
  if (tile.terrain === Terrain.Heritage) {
    const p = pagePos(x, y);
    floatText('Sacred ground. Not for sale.', p.x, p.y, 'quip');
    return;
  }
  if (S.k.known[idx(x, y)]) {
    const p = pagePos(x, y);
    floatText('Already drilled that one, boss.', p.x, p.y, 'quip');
    return;
  }
  if (S.cash < HOLE_COST) {
    showBroke();
    return;
  }

  if (!S.fingerDone) {
    S.fingerDone = true;
    $('finger').classList.add('hidden');
  }

  S.cash -= HOLE_COST;
  S.holes++;
  S.drilling = { x, y, phase: 'slam', t0: performance.now() };
  sSlam();
  hud();
  window.setTimeout(() => {
    if (S.drilling) {
      S.drilling.phase = 'drill';
      sRattle();
    }
  }, 150);
  window.setTimeout(() => resolve(x, y), 820);
}

function resolve(x: number, y: number): void {
  S.drilling = null;
  const tile = S.world.tiles[idx(x, y)];
  const hit = tile.oz > 0 && tile.depth <= RIG_REACH;

  let near = false;
  if (!hit) {
    for (let dy = -1; dy <= 1 && !near; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!inMap(x + dx, y + dy)) continue;
        const n = S.world.tiles[idx(x + dx, y + dy)];
        if (n.oz > 0 && n.depth <= RIG_REACH) {
          near = true;
          break;
        }
      }
    }
  }

  // Build the six-segment core: gold lands at its true depth slice.
  const segs: Segment[] = [];
  for (let i = 0; i < SEGMENTS; i++) segs.push(((x + y + i) % 3 === 0 ? 'rock2' : 'rock') as Segment);
  if (hit) {
    const gi = Math.min(SEGMENTS - 1, Math.floor(tile.depth / (RIG_REACH / SEGMENTS)));
    segs[gi] = 'gold';
    if (tile.oz > 3200 && gi < SEGMENTS - 1) segs[gi + 1] = 'gold';
  } else if (near) {
    segs[SEGMENTS - 1] = 'fleck';
  }

  const p = pagePos(x, y);
  showTray(segs, {
    onTick: sTick,
    onGold: () => sSting(tile.grade),
    onDone: () => {
      if (hit) {
        applyProgram(S.world, S.k, Tool.RC, x, y);
        const est = S.k.est[idx(x, y)];
        S.oz += est;
        gradeStamp(`${tile.grade.toFixed(1)} g/t!`, tile.grade);
        flyNuggets(p.x, p.y, $('oz-counter'), Math.min(16, 5 + Math.round(est / 500)));
        if (tile.grade > 4.5) {
          shake();
          sDing();
        }
      } else {
        // Mark the ground as tested either way (soiled fog of knowledge).
        applyProgram(S.world, S.k, Tool.RC, x, y);
        S.oz += S.k.est[idx(x, y)]; // zero on true misses; honest on edge cases
        if (near) {
          floatText('traces…', p.x, p.y - 8, 'gold-text');
        } else {
          sThud();
          floatText(`−${fmtMoney(HOLE_COST)}`, p.x, p.y - 4, 'bad-text');
          if (Math.random() < 0.3) {
            window.setTimeout(
              () => floatText(BARRY_QUIPS[Math.floor(Math.random() * BARRY_QUIPS.length)], p.x, p.y + 26, 'quip'),
              420,
            );
          }
        }
      }
      recomputeHeat();
      hud();
      draw();
      if (S.cash < HOLE_COST) window.setTimeout(showBroke, 1400);
    },
  });
  draw();
}

// ---------- Broke / reset ----------

function showBroke(): void {
  $('broke-oz').textContent = S.oz > 0 ? `${fmtOzLive(S.oz)} defined in ${S.holes} holes.` : `${S.holes} holes. Nothing. It happens.`;
  $('broke').classList.remove('hidden');
}

// ---------- HUD & drawing ----------

function fmtOzLive(oz: number): string {
  if (oz <= 0) return '0 oz';
  if (oz < 9500) return `${Math.round(oz).toLocaleString()} oz`;
  return fmtOz(oz);
}

function hud(): void {
  $('cash-val').textContent = fmtMoney(S.cash);
  $<HTMLElement>('cash-fill').style.width = `${Math.max(0, (S.cash / START_CASH) * 100)}%`;
  $('oz-counter').textContent = fmtOzLive(S.oz);
}

function draw(): void {
  render(ctx, S.world, S.k, false, S.drilling ? null : S.hover, 0, [], [], null, animTick, {
    warm: heatWarm,
    cold: heatCold,
  });
  if (S.drilling) {
    const d = S.drilling;
    const t = S.world.tiles[idx(d.x, d.y)];
    const { sx, sy } = tileScreen(d.x, d.y, t.elev);
    const el = performance.now() - d.t0;
    let oy = 0;
    let jx = 0;
    if (d.phase === 'slam') {
      oy = -Math.max(0, 26 - el * 0.22);
    } else {
      jx = Math.round(Math.sin(el / 14) * 1.6);
    }
    // The rig, oversized and outlined.
    ctx.fillStyle = '#221812';
    ctx.fillRect(sx - 3 + jx, sy - 24 + oy, 8, 28);
    ctx.fillStyle = '#e8c559';
    ctx.fillRect(sx - 2 + jx, sy - 23 + oy, 6, 26);
    ctx.fillStyle = '#221812';
    ctx.fillRect(sx - 9 + jx, sy + 3 + oy, 19, 5);
    if (d.phase === 'drill') {
      ctx.fillStyle = 'rgba(214, 190, 160, 0.8)';
      ctx.beginPath();
      ctx.arc(sx + 9 + jx, sy - 2 - (el % 300) / 40, 3.5, 0, Math.PI * 2);
      ctx.arc(sx - 8 - jx, sy + 1 - (el % 220) / 50, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- Events ----------

canvas.addEventListener('click', (ev) => {
  const p = pick(canvas, ev, S.world);
  if (p) tap(p.x, p.y);
});

canvas.addEventListener('mousemove', (ev) => {
  const p = pick(canvas, ev, S.world);
  if (p?.x !== S.hover?.x || p?.y !== S.hover?.y) {
    S.hover = p;
    if (!S.drilling) draw();
  }
});

canvas.addEventListener('mouseleave', () => {
  S.hover = null;
  draw();
});

$('btn-fresh').addEventListener('click', () => newRun(randomSeedName(Math.random())));
$('seed-chip').addEventListener('click', () => {
  navigator.clipboard.writeText(location.href).then(() => {
    floatText('Challenge link copied.', window.innerWidth / 2, 90, 'gold-text');
  });
});

{
  const muteBtn = $('btn-mute');
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    muteBtn.textContent = toggleMute() ? '🔇' : '🔊';
  });
}

// Ambient redraw (glints, drill animation) — interval-driven, rAF-proof.
window.setInterval(() => {
  animTick += 5;
  if (!document.hidden && S !== undefined) draw();
}, 80);

// ---------- Boot: straight into the ground, zero reading ----------

const urlSeed = (new URLSearchParams(location.search).get('seed') || '').trim().toUpperCase();
newRun(urlSeed || randomSeedName(Math.random()));
