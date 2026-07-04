/**
 * FEASIBILITY v4 — "A Tiny Mine That Runs" (GAME-DESIGN-v4, Gates 2–5).
 * One run = one tenement's life: STRIKE → RESOURCE → FUNDED → BUILT →
 * POURING → the montage, the business card, the shop. Tap is the only verb:
 * tap ground = drill (or place, in build phase); tap gold = bank it.
 */

import './style.css';
import { generateWorld, idx, inMap, MAP, randomSeedName, Terrain, World } from './core/world';
import { applyProgram, Knowledge, newKnowledge, resourceTotals, terrainAccess, Tool } from './core/survey';
import { Rng } from './core/rng';
import {
  announce,
  DIFFICULTIES,
  Market,
  marketCap,
  newMarket,
  pushNews,
  raise,
  tickDays,
} from './core/market';
import { BUILDINGS, BuildingDef, canPlace, estimatedPit, Placed, sitingPenalties, truePit } from './core/build';
import { CONSULTANTS, ConsultantTier, generateTruth, ProjectTruth, tierOf } from './core/feasibility';
import { drawEvent, QuarterEvent } from './core/events';
import { FIRM } from './core/branding';
import { fmtMoney, fmtOz } from './core/econ';
import { canvasSize, pick, render, TH, tileScreen, TW } from './ui/isomap';
import { floatText, flyNuggets, gradeStamp, showTray, Segment } from './ui/tray';
import {
  isMuted, pulseIfChanged, sClick, sDing, sDrillStart, sDrillStop, sFanfare, shake, sKaching, sPour, sSlam, sSting, sThud, sTick, toggleMute,
} from './ui/juice';

// ---------- Tuning ----------

const HOLE_COST = 250_000;
const BASE_CASH = 5_000_000;
const RIG_REACH = 200;
const SEGMENTS = 6;
const RESOURCE_OZ = 100_000; // announced ounces the Banker wants
const FUND_AMOUNT = 8_000_000;
const RAISE_AMOUNT = 2_500_000;
const RAISE_STAKE_COST = 8; // percentage points of your company per raise
const OZ_PRICE_MARGIN = 220; // $ margin per recovered oz at the pour (game-scaled)
const POUR_EVERY_MS = 5000;
const DIG_EVERY_MS = 2200;

// ---------- Meta (persists across runs) ----------

interface Meta {
  credits: number;
  bestValue: number;
  rigTurbo: boolean;
  extraTruck: boolean;
  richUncle: boolean;
  diamondRig: boolean;
}

const META_DEFAULTS: Meta = { credits: 0, bestValue: 0, rigTurbo: false, extraTruck: false, richUncle: false, diamondRig: false };

function loadMeta(): Meta {
  // v2: score semantics changed (company value → your stake's worth), so
  // legacy bestValue records are ~10× inflated — migrate upgrades, reset PBs.
  try {
    const v2 = localStorage.getItem('feas-meta-v2');
    if (v2) return { ...META_DEFAULTS, ...JSON.parse(v2) };
    const legacy = JSON.parse(localStorage.getItem('feas-meta') || 'null');
    if (legacy) return { ...META_DEFAULTS, ...legacy, bestValue: 0 };
    return { ...META_DEFAULTS };
  } catch {
    return { ...META_DEFAULTS };
  }
}

const META_KEY = 'feas-meta-v2';

const META = loadMeta();
function saveMeta(): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(META));
  } catch { /* fine */ }
}

// ---------- State ----------

type Phase = 'explore' | 'place' | 'ops' | 'done';

interface Ops {
  pool: number; // ounces left to mine
  sterilizedOz: number; // ore the highway (etc.) is sitting on — unmineable
  poolStart: number;
  digOrder: number[]; // tile indices, richest-first
  dug: Uint8Array;
  digCursor: number;
  minedOz: number;
  bankedCash: number;
  lastDig: number;
  lastPour: number;
  pourReady: boolean;
}

interface S4 {
  world: World;
  k: Knowledge;
  market: Market;
  phase: Phase;
  placeIdx: number; // which building we're placing
  buildings: Placed[];
  foundOz: number;
  bestGradeInHand: number;
  holesHit: number;
  holes: number;
  stake: number; // your %, eaten by raises
  funded: boolean;
  consultant: ConsultantTier | null;
  drilling: { x: number; y: number; phase: 'slam' | 'drill'; t0: number } | null;
  hover: { x: number; y: number } | null;
  ops: Ops | null;
  truth: ProjectTruth; // computed once per run — construction runs on this
  acquired: boolean; // sold via takeover — the acquirer bought the book, ledger settled
  fingerDone: boolean;
  fingerTarget: { x: number; y: number };
  streak: number; // consecutive hits — the pitch rises with you
  dusterRun: number; // consecutive pure misses — the Geo intervenes at 2
  over: boolean;
  flags: { taughtAnnounce: boolean; taughtBank: boolean; takeover: boolean; rain: boolean };
}

let S!: S4;
let mktRng!: Rng;
let animTick = 0;
let prevMsDone = -1; // milestone fanfare tracker
const EMPTY_PIT = new Uint8Array(MAP * MAP); // placement relaxation (softlock guard)

// Aeromag reveal: the purple smoke sweeps onto the map at run start.
const smokeShown = new Float32Array(MAP * MAP);
let aeroStart = 0;
const AERO_MS = 2400;

// Near-miss direction hint: a pulsing chevron pointing at the neighbour ore.
let hint: { sx: number; sy: number; dx: number; dy: number; until: number } | null = null;

// The creek floods during the rain event. WA: bone dry, then biblical.
let floodUntil = 0;

// Idle detection: flies gather, the Geo gets impatient.
let lastTapAt = performance.now();
let idleQuipDone = false;
const heatWarm = new Float32Array(MAP * MAP);
const heatCold = new Float32Array(MAP * MAP);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('map');
const ctx = canvas.getContext('2d')!;
{
  // Crisp vector at native resolution: backing store at devicePixelRatio,
  // all draw code stays in logical px via the base transform.
  const { w, h } = canvasSize();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Rig reach in metres — the Diamond Rig upgrade unlocks the deep lenses. */
function rigReach(): number {
  return META.diamondRig ? 280 : RIG_REACH;
}

function rigTool(): Tool {
  return META.diamondRig ? Tool.Diamond : Tool.RC;
}

// Run-generation counter: every deferred callback checks it so a finished
// run can never lecture, pay, or drill into the next one.
let runGen = 0;

const BARRY_QUIPS = [
  '"She felt good though, ay." — Barry',
  '"Rod bounce. Definitely rod bounce." — Barry',
  '"The gold\'s just shy, boss." — Barry',
  '"My cousin drilled here in \'09. Same." — Barry',
];

// ---------- Run lifecycle ----------

function newRun(seed: string): void {
  const diff = DIFFICULTIES[0]; // boom market baseline; tenement choice comes later
  const market = newMarket(diff);
  market.cash = BASE_CASH + (META.richUncle ? 1_500_000 : 0);
  mktRng = new Rng(`${seed}:mkt`);
  runGen++;
  const world = generateWorld(seed);
  S = {
    world,
    k: newKnowledge(),
    truth: generateTruth(seed),
    market,
    phase: 'explore',
    placeIdx: 0,
    buildings: [],
    foundOz: 0,
    bestGradeInHand: 0,
    holesHit: 0,
    holes: 0,
    stake: 100,
    funded: false,
    consultant: null,
    drilling: null,
    hover: null,
    ops: null,
    acquired: false,
    fingerDone: false,
    fingerTarget: { x: MAP >> 1, y: MAP >> 1 },
    streak: 0,
    dusterRun: 0,
    over: false,
    flags: { taughtAnnounce: false, taughtBank: false, takeover: false, rain: false },
  };
  prevMsDone = -1;
  heatWarm.fill(0);
  heatCold.fill(0);
  smokeShown.fill(0);
  aeroStart = performance.now();
  hint = null;
  floodUntil = 0;
  window.setTimeout(() => banner('📡 AEROMAG SURVEY IN — drill into the purple smoke.'), 700);
  pushNews(market, `${S.world.companyName} lists at ${(market.price * 100).toFixed(1)}c. Champagne, then silence.`, 'company');
  const u = new URL(location.href);
  u.searchParams.set('seed', seed);
  history.replaceState(null, '', u.toString());
  $('seed-name').textContent = seed;
  $('overlay').classList.add('hidden');
  $('announce-pop').classList.add('hidden');
  $('newsflash').classList.add('hidden');
  document.querySelectorAll('.pour').forEach((e) => e.remove());
  placeFinger();
  hud();
  draw();
  (window as unknown as { __G2: S4 }).__G2 = S;
}

function placeFinger(): void {
  // The finger IS the tutorial — it must point at real, shallow gold so the
  // first tap always pays (FUN-AUDIT north star: first gold < 15 s).
  const finger = $('finger');
  let target: { x: number; y: number } | null = null;
  let bestScore = -1;
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const t = S.world.tiles[idx(x, y)];
      if (t.oz <= 0 || t.depth > rigReach() || t.terrain === Terrain.Heritage) continue;
      const clue = t.terrain === Terrain.Workings ? 40000 : t.terrain === Terrain.Outcrop ? 20000 : 0;
      const score = t.oz + clue - t.depth * 50;
      if (score > bestScore) {
        bestScore = score;
        target = { x, y };
      }
    }
  }
  if (!target) target = { x: MAP >> 1, y: MAP >> 1 };
  S.fingerTarget = target;
  const p = pagePos(target.x, target.y);
  finger.style.left = `${p.x - 14}px`;
  finger.style.top = `${p.y + 6}px`;
  finger.classList.remove('hidden');
}

function pagePos(x: number, y: number): { x: number; y: number } {
  // LOGICAL canvas dims — canvas.width is ×dpr and lies to the DOM.
  const rect = canvas.getBoundingClientRect();
  const { w: LW, h: LH } = canvasSize();
  const t = S.world.tiles[idx(x, y)];
  const { sx, sy } = tileScreen(x, y, t.elev);
  return {
    x: rect.left + (sx / LW) * rect.width,
    y: rect.top + ((sy + 10) / LH) * rect.height,
  };
}

// ---------- Cast ----------

function say(who: string, text: string): void {
  document.querySelector('.speech')?.remove();
  const el = document.createElement('div');
  el.className = 'speech';
  el.innerHTML = `<b>${who}</b> ${text}`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}

// ---------- Heat ----------

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
      if (v > 700) heatWarm[i] = Math.min(1, v / 25000);
      else heatCold[i] = Math.min(0.5, sw * 0.4);
    }
  }
}

// ---------- The verb: tap ----------

function onTap(x: number, y: number): void {
  if (S.over) return;
  lastTapAt = performance.now();
  idleQuipDone = false;
  if (S.phase === 'place') {
    tryPlace(x, y);
    return;
  }
  drillAt(x, y);
}

function drillAt(x: number, y: number): void {
  if (S.drilling) return;
  const tile = S.world.tiles[idx(x, y)];
  const p = pagePos(x, y);
  const access = terrainAccess(tile.terrain);
  if (!access.allowed) {
    floatText(access.note!, p.x, p.y, 'quip');
    return;
  }
  if (S.ops?.dug[idx(x, y)]) {
    floatText("That's a pit now, boss.", p.x, p.y, 'quip');
    return;
  }
  if (S.k.known[idx(x, y)]) {
    floatText('Already drilled that one, boss.', p.x, p.y, 'quip');
    return;
  }
  const cost = HOLE_COST * access.costMult;
  if (S.market.cash < cost) {
    say('💰 The Broker', 'Mate, you\'re skint. Tap RAISE — dilution builds character.');
    $('btn-raise').classList.add('attn');
    return;
  }
  if (access.costMult !== 1 && access.note) floatText(access.note, p.x, p.y - 20, 'quip');
  S.market.cash -= cost;
  S.market.spentExploration += cost;
  S.holes++;
  S.drilling = { x, y, phase: 'slam', t0: performance.now() };
  sSlam();
  hud();
  const gen = runGen;
  const drillMs = META.rigTurbo ? 480 : 800;
  window.setTimeout(() => {
    if (gen !== runGen) return;
    if (S.drilling) {
      S.drilling.phase = 'drill';
      sDrillStart();
    }
  }, 140);
  window.setTimeout(() => {
    if (gen !== runGen) return;
    resolveHole(x, y);
  }, drillMs);
}

function resolveHole(x: number, y: number): void {
  S.drilling = null;
  sDrillStop();
  tickDays(S.market, 7, mktRng);
  const reach = rigReach();
  const tile = S.world.tiles[idx(x, y)];
  const hit = tile.oz > 0 && tile.depth <= reach;
  // Ore below the rig's reach is NOT a duster — the tray says so honestly.
  const blind = !hit && tile.oz > 0 && tile.depth > reach;
  const bonanza = hit && (tile.grade >= 9 || tile.oz > 60_000);

  let near = false;
  if (!hit && !blind) {
    for (let dy = -1; dy <= 1 && !near; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!inMap(x + dx, y + dy)) continue;
        const n = S.world.tiles[idx(x + dx, y + dy)];
        if (n.oz > 0 && n.depth <= reach) {
          near = true;
          break;
        }
      }
    }
  }

  const segs: Segment[] = [];
  for (let i = 0; i < SEGMENTS; i++) segs.push(((x + y + i) % 3 === 0 ? 'rock2' : 'rock') as Segment);
  if (hit) {
    const gi = Math.min(SEGMENTS - 1, Math.floor(tile.depth / (reach / SEGMENTS)));
    segs[gi] = 'gold';
    if ((bonanza || tile.oz > 12_000) && gi < SEGMENTS - 1) segs[gi + 1] = 'gold';
    if (bonanza && gi > 0) segs[gi - 1] = 'gold';
  } else if (blind) {
    segs[SEGMENTS - 1] = 'deep';
  } else if (near) {
    segs[SEGMENTS - 1] = 'fleck';
  }

  const p = pagePos(x, y);
  showTray(segs, {
    onTick: sTick,
    onGold: () => sSting(tile.grade),
    onDone: () => {
      applyProgram(S.world, S.k, rigTool(), x, y);
      const est = S.k.est[idx(x, y)];
      // The finger only leaves once it's done its job: a hit, or its tile drilled.
      if (!S.fingerDone && (hit || (x === S.fingerTarget.x && y === S.fingerTarget.y))) {
        S.fingerDone = true;
        $('finger').classList.add('hidden');
      }
      if (hit) {
        S.foundOz += est;
        S.holesHit++;
        S.streak++;
        S.dusterRun = 0;
        // Brownfields while she runs: a mid-ops discovery feeds the pit LIVE.
        if (S.ops && !S.ops.dug[idx(x, y)] && !S.ops.digOrder.includes(idx(x, y))) {
          S.ops.digOrder.push(idx(x, y));
          S.ops.pool += tile.oz;
          S.ops.poolStart += tile.oz;
          banner(`+${fmtOz(tile.oz)} added to the mine plan. The excavator changes course.`);
        }
        S.bestGradeInHand = Math.max(S.bestGradeInHand, tile.grade);
        if (!S.flags.taughtAnnounce && S.foundOz > 2000) {
          S.flags.taughtAnnounce = true;
          window.setTimeout(
            () => say('🧭 The Geo', 'Beauty. Now tap 📢 ANNOUNCE — the market only pays for ounces it knows about.'),
            1700,
          );
        }
        const streakTag = S.streak >= 2 ? `  ×${S.streak}` : '';
        if (bonanza) {
          gradeStamp(`BONANZA! ${tile.grade.toFixed(0)} g/t${streakTag}`, tile.grade);
          flyNuggets(p.x, p.y, $('stat-oz'), 24);
          shake();
          sDing(); // the sting already sang — kaching is for money, not rock
        } else {
          gradeStamp(`${tile.grade.toFixed(1)} g/t!${streakTag}`, tile.grade + S.streak);
          flyNuggets(p.x, p.y, $('stat-oz'), Math.min(16, 5 + Math.round(est / 2000)));
          if (tile.grade > 4.5 || S.streak >= 3) {
            shake();
            sDing();
          }
        }
      } else if (near) {
        // Point at the neighbour that caused the traces — actionable, not cryptic.
        let bn: { dx: number; dy: number; oz: number } | null = null;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!inMap(x + dx, y + dy)) continue;
            const n = S.world.tiles[idx(x + dx, y + dy)];
            if (n.oz > 0 && n.depth <= reach && (!bn || n.oz > bn.oz)) bn = { dx, dy, oz: n.oz };
          }
        }
        if (bn) {
          const t2 = S.world.tiles[idx(x, y)];
          const s = tileScreen(x, y, t2.elev);
          hint = { sx: s.sx, sy: s.sy, dx: bn.dx, dy: bn.dy, until: performance.now() + 6500 };
        }
        floatText('traces…', p.x, p.y - 8, 'gold-text');
      } else if (blind) {
        // Honest smoke, short rig: tell the player the truth.
        S.streak = 0;
        floatText('something deeper… (needs a bigger rig)', p.x, p.y - 8, 'gold-text');
      } else {
        S.streak = 0;
        S.dusterRun++;
        sThud();
        floatText(`−${fmtMoney(HOLE_COST)}`, p.x, p.y - 4, 'bad-text');
        if (S.dusterRun === 2) {
          window.setTimeout(() => say('🧭 The Geo', 'Boss. The PURPLE smoke. Drill where the smoke is.'), 700);
        } else if (Math.random() < 0.3) {
          window.setTimeout(() => floatText(BARRY_QUIPS[Math.floor(Math.random() * BARRY_QUIPS.length)], p.x, p.y + 26, 'quip'), 420);
        }
      }
      recomputeHeat();
      maybeEvent();
      hud();
      draw();
    },
  });
  draw();
}

// ---------- Announce / Raise ----------

function announcedSum(): number {
  const a = S.market.announced;
  return a.measured + a.indicated + a.inferred;
}

function unannouncedOz(): number {
  return Math.max(0, resourceTotals(S.k).total - announcedSum());
}

function doAnnounce(loud: boolean): void {
  // Real JORC classes route to the market: your drill spacing IS the filing.
  const t = resourceTotals(S.k);
  const a = S.market.announced;
  const dm = Math.max(0, t.measured - a.measured);
  const di = Math.max(0, t.indicated - a.indicated);
  const df = Math.max(0, t.inferred - a.inferred);
  const delta = dm + di + df;
  if (delta < 2000) return;
  const before = S.market.price;
  announce(
    S.market,
    { deltaMeasured: dm, deltaIndicated: di, deltaInferred: df, bestGrade: S.bestGradeInHand, promotional: loud, projectName: S.world.seed },
    mktRng,
  );
  S.bestGradeInHand = 0;
  tickDays(S.market, 3, mktRng);
  $('announce-pop').classList.add('hidden');
  const after = S.market.price;
  if (after >= before) sDing();
  else sThud();
  if (loud) shake();
  banner(loud ? `"BONANZA GOLD AT ${S.world.seed}!" — the market inhales` : `${S.world.seed}: +${fmtOz(delta)} announced. Sober fonts, big number.`);
  if (S.market.sentiment > 0.3) window.setTimeout(() => say('📈 The Broker', 'Mate. MATE. Raise now.'), 1200);
  if (!S.flags.taughtBank && !S.funded && announcedSum() >= RESOURCE_OZ) {
    S.flags.taughtBank = true;
    window.setTimeout(() => say('🏦 The Banker', "Now THAT's a resource. My door is open — tap FUND IT."), 2400);
  }
  hud();
}

function doRaise(): void {
  if (S.stake <= 12) {
    say('📈 The Broker', "There's nothing left to sell, mate. That's everyone else's company now.");
    return;
  }
  S.stake -= RAISE_STAKE_COST;
  raise(S.market, RAISE_AMOUNT, mktRng);
  tickDays(S.market, 3, mktRng);
  $('btn-raise').classList.remove('attn');
  sDing(); // money noise is earned, not borrowed — kaching stays with real wins
  banner(`Placement: +${fmtMoney(RAISE_AMOUNT)}. Your stake: ${S.stake}%. The register groans.`);
  hud();
}

function banner(text: string): void {
  const el = document.createElement('div');
  el.className = 'headline';
  el.textContent = text;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 3600);
}

// ---------- The Banker ----------

function tryFund(): void {
  const a = S.market.announced;
  const announced = a.measured + a.indicated + a.inferred;
  if (announced < RESOURCE_OZ) {
    const short = RESOURCE_OZ - announced;
    say('🏦 The Banker', unannouncedOz() > 2000
      ? `I can only lend against what you've TOLD the market. Announce your ounces.`
      : `Come back with ${fmtOz(short)} more announced. The gold, not the vibes.`);
    sThud();
    return;
  }
  // Banks don't lend against extrapolation — Indicated+Measured must carry it.
  if ((a.measured + a.indicated) / announced < 0.4) {
    say('🏦 The Banker', 'Too much Inferred, mate. CLUSTER your holes — two rigs within a stone\'s throw makes it Indicated. Then we talk.');
    sThud();
    return;
  }
  S.funded = true;
  S.market.cash += FUND_AMOUNT;
  S.market.sentiment += 0.1;
  pushNews(S.market, `${S.world.companyName} secures ${fmtMoney(FUND_AMOUNT)} project financing.`, 'good');
  sKaching();
  shake();
  showConsultantModal();
  hud();
}

function showConsultantModal(): void {
  $('modal-content').innerHTML = `
    <h2 class="funded">🏦 APPROVED. ${fmtMoney(FUND_AMOUNT)}.</h2>
    <div class="sub">One condition: a feasibility study. Pick your consultants.</div>
    <div class="diff-cards">
      ${CONSULTANTS.map((c) => `
        <button class="diff-card ${c.key === 'good' ? 'tier-good' : ''}" data-tier="${c.key}">
          <span class="diff-label">${c.key === 'cheap' ? '🍺 ' : c.key === 'good' ? '⭐ ' : ''}${escapeHtml(c.firm)} — ${fmtMoney(c.cost)}</span>
          <span class="diff-blurb">${escapeHtml(c.blurb)}</span>
        </button>`).join('')}
    </div>`;
  $('overlay').classList.remove('hidden');
  document.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((b) => {
    b.onclick = () => {
      const tier = tierOf(b.dataset.tier as ConsultantTier['key']);
      if (S.market.cash < tier.cost) {
        floatText('Not enough cash for that one.', window.innerWidth / 2, 200, 'bad-text');
        return;
      }
      S.consultant = tier;
      S.market.cash -= tier.cost;
      sClick();
      $('overlay').classList.add('hidden');
      startPlacement();
    };
  });
}

// ---------- Build phase: sequential placement, ghost preview ----------

function startPlacement(): void {
  S.phase = 'place';
  S.placeIdx = 0;
  promptPlacement();
  hud();
  draw();
}

function currentBuilding(): BuildingDef {
  return BUILDINGS[S.placeIdx];
}

function promptPlacement(): void {
  const def = currentBuilding();
  banner(`Place the ${def.name.toUpperCase()} — mind the dashed pit line.`);
  say(def.key === 'tsf' ? '📋 The Regulator' : '⛑ Site Manager',
    def.key === 'tsf' ? 'Keep that thing AWAY from my creek.' : `${def.name}: ${def.w}×${def.h} pad. Tap the ground.`);
}

function anyAnchorFits(def: BuildingDef, estPit: Uint8Array): boolean {
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      if (canPlace(S.world, estPit, S.buildings, def, x, y).ok) return true;
    }
  }
  return false;
}

function commitPlacement(def: BuildingDef, x: number, y: number): void {
  const p = pagePos(x, y);
  S.buildings.push({ key: def.key, x, y });
  sSlam();
  shake();
  floatText(`${def.name} ✓`, p.x, p.y - 10, 'gold-text');
  S.placeIdx++;
  if (S.placeIdx >= BUILDINGS.length) startOps();
  else promptPlacement();
  hud();
  draw();
}

function tryPlace(x: number, y: number): void {
  const def = currentBuilding();
  const estPit = estimatedPit(S.k);
  const fit = canPlace(S.world, estPit, S.buildings, def, x, y);
  if (fit.ok) {
    commitPlacement(def, x, y);
    return;
  }
  // Softlock guard: if NO anchor on the map satisfies the pit-line rule,
  // waive it rather than trap the player on a tight tenement.
  if (!anyAnchorFits(def, estPit) && canPlace(S.world, EMPTY_PIT, S.buildings, def, x, y).ok) {
    banner('Tight ground — the pit-line restriction is waived for this pad.');
    commitPlacement(def, x, y);
    return;
  }
  const p = pagePos(x, y);
  floatText(fit.reason!, p.x, p.y, 'quip');
  sThud();
}

// ---------- OPERATE: the living diorama ----------

function startOps(): void {
  S.phase = 'ops';
  const pit = truePit(S.world);
  const order: number[] = [];
  let sterilizedOz = 0;
  for (let i = 0; i < pit.length; i++) {
    if (!pit[i]) continue;
    // The mine can only dig what you DISCOVERED. Undrilled ore stays hidden —
    // find it mid-ops and it joins the plan live. (The critic was right.)
    if (!S.k.known[i] && S.k.cls[i] === 0) continue;
    const terr = S.world.tiles[i].terrain;
    if (terr === Terrain.Highway || terr === Terrain.Windmill) {
      sterilizedOz += S.world.tiles[i].oz; // the pit stops at the bitumen
      continue;
    }
    order.push(i);
  }
  order.sort((a, b) => S.world.tiles[b].oz - S.world.tiles[a].oz);
  let pool = 0;
  for (const i of order) pool += S.world.tiles[i].oz;

  S.ops = {
    pool,
    sterilizedOz,
    poolStart: pool,
    digOrder: order,
    dug: new Uint8Array(MAP * MAP),
    digCursor: 0,
    minedOz: 0,
    bankedCash: 0,
    lastDig: performance.now(),
    lastPour: performance.now() + 1500,
    pourReady: false,
  };
  if (S.ops.digOrder.length > 0) {
    S.ops.dug[S.ops.digOrder[0]] = 1;
    S.ops.digCursor = 1;
  }

  // Siting truths come due the moment earthworks start.
  const penalties = sitingPenalties(S.world, S.buildings);
  const gen = runGen;
  let delay = 1500;
  for (const pen of penalties) {
    S.market.cash -= pen.cost;
    window.setTimeout(() => {
      if (gen !== runGen) return;
      say('📋 The Regulator', pen.line);
      shake();
      sThud();
    }, delay);
    delay += 4200;
  }

  banner('⛏ FIRST BLAST. The mine is ALIVE — keep drilling while she runs.');
  sDing();
  shake();
  hud();
}

function opsTick(now: number): void {
  const o = S.ops;
  if (!o || S.phase !== 'ops' || S.over) return;

  // The pit eats another tile.
  if (now - o.lastDig > DIG_EVERY_MS && o.digCursor < o.digOrder.length) {
    o.dug[o.digOrder[o.digCursor]] = 1;
    o.digCursor++;
    o.lastDig = now;
  }

  // Gold pours.
  const pourInterval = META.extraTruck ? POUR_EVERY_MS * 0.8 : POUR_EVERY_MS;
  if (now - o.lastPour > pourInterval && o.pool > 500 && !o.pourReady) {
    spawnPour();
    o.lastPour = now;
  }

  // Mid-ops drama: one takeover whisper, one weather event, per run.
  if (!S.flags.rain && o.pool < o.poolStart * 0.8) {
    S.flags.rain = true;
    if (mktRng.next() < 0.8) showRain();
  }
  if (!S.flags.takeover && o.pool < o.poolStart * 0.55) {
    S.flags.takeover = true;
    if (mktRng.next() < 0.7) showTakeover();
  }

  if (o.pool <= 500 && !S.over) endRun();
}

function showRain(): void {
  const o = S.ops!;
  const news = $('newsflash');
  news.innerHTML = `
    <div class="nf-title">📰 UNSEASONAL RAIN</div>
    <p>The pit is now a swimming pool with opinions. The ducks are thrilled. Production is not.</p>
    <div class="nf-actions">
      <button class="btn" id="rain-pump">Hire pumps — $400k</button>
      <button class="btn btn-ghost" id="rain-wait">Wait it out</button>
    </div>`;
  news.classList.remove('hidden');
  floodUntil = performance.now() + 12000; // the creek runs either way
  const gen = runGen;
  $('rain-pump').onclick = () => {
    if (gen !== runGen) {
      news.classList.add('hidden');
      return;
    }
    S.market.cash -= 400_000;
    floodUntil = performance.now() + 3500;
    news.classList.add('hidden');
    banner('Pumps roaring. The ducks file a complaint.');
    sClick();
    hud();
  };
  $('rain-wait').onclick = () => {
    if (gen !== runGen) {
      news.classList.add('hidden');
      return;
    }
    o.lastPour += 9000;
    news.classList.add('hidden');
    banner('Pours paused while the creek runs. The ducks are having a lovely time.');
    sClick();
  };
}

function showTakeover(): void {
  const offer = marketCap(S.market) * 0.4;
  const news = $('newsflash');
  news.innerHTML = `
    <div class="nf-title">📰 TAKEOVER OFFER</div>
    <p>A mid-tier slides a term sheet across the table: <b>${fmtMoney(offer)}</b> cash, right now, for the lot. Their geologist won't stop smiling.</p>
    <div class="nf-actions">
      <button class="btn btn-promo" id="tk-take">Take the money</button>
      <button class="btn btn-ghost" id="tk-no">We're worth more</button>
    </div>`;
  news.classList.remove('hidden');
  const gen = runGen;
  $('tk-take').onclick = () => {
    news.classList.add('hidden');
    if (gen !== runGen) return;
    S.acquired = true; // the ledger settles with the sale
    S.market.cash += offer;
    tickDays(S.market, 6, mktRng); // the price re-anchors — the offer COUNTS
    banner('SOLD. The premium banks. The geologist is still smiling — try not to think about it.');
    sKaching();
    endRun();
  };
  $('tk-no').onclick = () => {
    news.classList.add('hidden');
    if (gen !== runGen) return;
    S.market.sentiment += 0.12;
    banner('Board rejects the takeover. The register dreams bigger.');
    sClick();
    hud();
  };
}

function spawnPour(): void {
  const o = S.ops!;
  o.pourReady = true;
  const batch = Math.min(o.pool, o.poolStart * 0.07);
  o.pool -= batch;
  const value = batch * OZ_PRICE_MARGIN * S.truth.met;
  o.minedOz += batch;

  const plant = S.buildings.find((b) => b.key === 'plant')!;
  const p = pagePos(plant.x, plant.y);
  const el = document.createElement('button');
  el.className = 'pour';
  el.innerHTML = '<span class="pour-bar"></span>';
  el.title = 'GOLD POUR — tap to bank it!';
  el.style.left = `${p.x + 10}px`;
  el.style.top = `${p.y - 34}px`;
  document.body.appendChild(el);
  sDing();

  const gen = runGen;
  const bank = (): void => {
    if (gen !== runGen || !el.isConnected) {
      el.remove();
      return;
    }
    el.remove();
    o.pourReady = false;
    o.bankedCash += value;
    S.market.cash += value;
    sPour(); // the pour gets its own sound — nothing else is allowed to use it
    flyNuggets(p.x, p.y - 30, $('stat-cash'), 8);
    floatText(`+${fmtMoney(value)}`, p.x, p.y - 40, 'gold-text');
    hud();
  };
  el.onclick = bank;
  window.setTimeout(bank, 8000); // banks itself — tapping just feels better
}

// ---------- The end: montage, business card, shop ----------

function endRun(): void {
  S.over = true;
  $('newsflash').classList.add('hidden');
  document.querySelectorAll('.pour').forEach((e) => e.remove());
  const o = S.ops!;
  const truth = S.truth;

  // THE LEDGER: what you told the market vs what you poured. Hype debt and
  // the downgrade branch finally get collected — LOUD has a price now.
  // Clawback is PRO-RATA across all classes (Indicated hides nothing), and
  // a takeover settles the book: the acquirer's diligence bought the ounces.
  const aSum = announcedSum();
  const shortfall = aSum - o.minedOz;
  if (!S.acquired && shortfall > 10_000) {
    const f = Math.min(1, shortfall / Math.max(1, aSum));
    const a0 = S.market.announced;
    announce(
      S.market,
      {
        deltaMeasured: -a0.measured * f,
        deltaIndicated: -a0.indicated * f,
        deltaInferred: -a0.inferred * f,
        bestGrade: 0,
        promotional: false,
        projectName: S.world.seed,
      },
      mktRng,
    );
    tickDays(S.market, 5, mktRng);
  }

  const est = S.consultant ? Math.min(0.97, truth.met * (1 + 0.15 * (S.consultant.key === 'cheap' ? 1 : S.consultant.key === 'standard' ? 0.3 : 0.05))) : 0.92;
  const finalValue = marketCap(S.market);
  // THE SCORE is your stake's worth — dilution prices itself, raise-spam dies.
  const yourCut = finalValue * (S.stake / 100);
  const rank =
    o.minedOz < 150_000 ? 'EXPLORATION TARGET' : o.minedOz < 350_000 ? 'INFERRED' : o.minedOz < 700_000 ? 'INDICATED' : 'MEASURED LEGEND';
  const isRecord = META.bestValue > 0 && yourCut > META.bestValue;
  const credits = Math.max(1, Math.min(10, Math.floor(yourCut / 15_000_000)));
  META.credits += credits;
  META.bestValue = Math.max(META.bestValue, yourCut);
  saveMeta();

  const consultLine = S.consultant
    ? S.consultant.key === 'cheap' && est - truth.met > 0.08
      ? `Barry's study said ${Math.round(est * 100)}% recovery. The plant said ${Math.round(truth.met * 100)}%. A guess with a letterhead.`
      : S.consultant.key === 'good'
        ? `${FIRM.gameName} said ${Math.round(truth.met * 100 + 1)}% recovery. The plant said ${Math.round(truth.met * 100)}%. Boring — in the best possible way.`
        : `The study held up. Nobody writes songs about competence, but the bank hums along.`
    : '';
  const ledgerLine = S.acquired
    ? 'The acquirer bought the book — ounces, adjectives and all. Their problem now.'
    : shortfall > 10_000
      ? `You announced ${fmtOz(aSum)}. You poured ${fmtOz(o.minedOz)}. The market did the subtraction — with interest on every adjective.`
      : '';

  const shareUrl = new URL(location.href);
  shareUrl.searchParams.set('seed', S.world.seed);

  $('modal-content').innerHTML = `
    <h2 class="funded">MINED OUT. ${rank}.${isRecord ? ' 🏆 NEW RECORD' : ''}</h2>
    <div class="sub">${escapeHtml(S.world.companyName)} — the ${escapeHtml(S.world.seed)} story, start to finish</div>
    <div class="kpis">
      <div class="kpi"><div class="k">YOUR SCORE — stake ${S.stake}% of ${fmtMoney(finalValue)}</div><div class="v gold">${fmtMoney(yourCut)}</div></div>
      <div class="kpi"><div class="k">Gold poured</div><div class="v gold">${fmtOz(o.minedOz)}</div></div>
      <div class="kpi"><div class="k">Gold found</div><div class="v">${fmtOz(S.foundOz)}</div></div>
      <div class="kpi"><div class="k">Holes / hits</div><div class="v">${S.holes} / ${S.holesHit}</div></div>
    </div>
    <div class="debrief">
      <div class="dt">The reconciliation</div>
      <p>${escapeHtml(consultLine)}</p>
      ${ledgerLine ? `<p>${escapeHtml(ledgerLine)}</p>` : ''}
      ${o.sterilizedOz > 15_000 ? `<p>${fmtOz(o.sterilizedOz)} sterilised under the highway. Main Roads sends its regards.</p>` : ''}
    </div>
    <div class="biz-card">
      <div class="bc-name">${escapeHtml(FIRM.gameName.toUpperCase())}</div>
      <div class="bc-tag">${escapeHtml(FIRM.tagline)}</div>
      <div class="bc-note">This bit is real. Built by a mining engineer who does feasibility for a living — <a href="${FIRM.url}" target="_blank" rel="noopener">${escapeHtml(FIRM.realName)}</a>. Talk to us before Barry does your met test work.</div>
    </div>
    <div class="shop">
      <div class="dt">THE SHED — ${META.credits} ★</div>
      ${shopItem('rigTurbo', '⚡ Turbo Rig', 3, 'Drills near-instantly. Tap tap tap.')}
      ${shopItem('diamondRig', '💎 Diamond Rig', 4, 'Reaches 280m — the deep lenses the RC rig lies about.')}
      ${shopItem('extraTruck', '🚚 Third Truck', 3, 'More hauling, faster pours.')}
      ${shopItem('richUncle', '💼 A Richer Uncle', 2, '+$1.5M starting cash, forever.')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="btn-again">NEW TENEMENT ▶</button>
      <button class="btn" id="btn-card">📸 Share card</button>
      <button class="btn" id="btn-share">Copy result</button>
    </div>`;
  $('overlay').classList.remove('hidden');
  sFanfare(!S.acquired && shortfall > 10_000);
  shake();

  document.querySelectorAll<HTMLButtonElement>('[data-shop]').forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.shop as 'rigTurbo' | 'diamondRig' | 'extraTruck' | 'richUncle';
      const cost = Number(b.dataset.cost);
      if (META[key] || META.credits < cost) return;
      META.credits -= cost;
      META[key] = true;
      saveMeta();
      sClick();
      b.classList.add('owned');
      b.disabled = true;
      b.querySelector('.shop-cost')!.textContent = 'OWNED';
      $('modal-content').querySelector('.shop .dt')!.textContent = `THE SHED — ${META.credits} ★`;
    };
  });
  $('btn-again').onclick = () => newRun(randomSeedName(Math.random()));
  $('btn-card').onclick = () => downloadShareCard(rank, finalValue, o.minedOz);
  $('btn-share').onclick = () => {
    const text = `${S.world.companyName}: poured ${fmtOz(o.minedOz)}, my stake worth ${fmtMoney(yourCut)} — rank ${rank}. Beat me on the same ground: ${shareUrl.toString()}`;
    navigator.clipboard.writeText(text).then(() => banner('Result copied — go start an argument.'));
  };
}

/** PNG share card: dark, gold, a live snapshot of THEIR map. LinkedIn bait. */
function downloadShareCard(rank: string, finalValue: number, minedOz: number): void {
  const card = document.createElement('canvas');
  card.width = 900;
  card.height = 470;
  const c = card.getContext('2d')!;
  c.fillStyle = '#101216';
  c.fillRect(0, 0, 900, 470);
  c.globalAlpha = 0.92;
  c.drawImage(canvas, 430, 42, 440, 236);
  c.globalAlpha = 1;
  c.strokeStyle = '#2a2f3a';
  c.lineWidth = 2;
  c.strokeRect(430, 42, 440, 236);
  c.fillStyle = '#d4a018';
  c.font = '800 34px system-ui, sans-serif';
  c.fillText('FEASIBILITY', 40, 74);
  c.fillStyle = '#8a8f98';
  c.font = '600 15px system-ui, sans-serif';
  c.fillText(`${S.world.companyName} — ${S.world.seed}`, 40, 102);
  c.fillStyle = '#f0c040';
  c.font = '900 42px system-ui, sans-serif';
  c.fillText(rank, 40, 168);
  c.fillStyle = '#e7e4da';
  c.font = '700 21px system-ui, sans-serif';
  c.fillText(`Found ${fmtOz(S.foundOz)} · Poured ${fmtOz(minedOz)}`, 40, 216);
  c.fillText(`Company value ${fmtMoney(finalValue)} · My stake ${S.stake}%`, 40, 250);
  c.fillStyle = '#8a8f98';
  c.font = '600 14px system-ui, sans-serif';
  c.fillText('Same ground, your taps:', 40, 330);
  c.fillStyle = '#f0c040';
  c.font = '700 15px ui-monospace, monospace';
  c.fillText(`${location.origin}${location.pathname}?seed=${S.world.seed}`, 40, 354);
  c.fillStyle = '#8a8f98';
  c.font = '600 14px system-ui, sans-serif';
  c.fillText(`${FIRM.tagline} Built by a mining engineer.`, 40, 434);
  const a = document.createElement('a');
  a.download = `feasibility-${S.world.seed}.png`;
  a.href = card.toDataURL('image/png');
  a.click();
  banner('Share card saved — go start an argument on LinkedIn.');
}

function shopItem(key: string, name: string, cost: number, desc: string): string {
  const owned = META[key as keyof Meta] === true;
  return `
    <button class="shop-item ${owned ? 'owned' : ''}" data-shop="${key}" data-cost="${cost}" ${owned || META.credits < cost ? 'disabled' : ''}>
      <span class="shop-name">${name}</span>
      <span class="shop-desc">${desc}</span>
      <span class="shop-cost">${owned ? 'OWNED' : `${cost} ★`}</span>
    </button>`;
}

// ---------- Events (breaking news) ----------

function maybeEvent(): void {
  if (S.holes % 5 !== 0 || S.holes === 0) return;
  const ev: QuarterEvent | null = drawEvent(mktRng, 0.5);
  if (!ev) return;
  const news = $('newsflash');
  news.innerHTML = `
    <div class="nf-title">📰 ${escapeHtml(ev.title)}</div>
    <p>${escapeHtml(ev.text)}</p>
    <div class="nf-actions">
      ${ev.choices.map((c, i) => `<button class="btn" data-ev="${i}">${escapeHtml(c.label)}</button>`).join('')}
    </div>`;
  news.classList.remove('hidden');
  const gen = runGen;
  news.querySelectorAll<HTMLButtonElement>('[data-ev]').forEach((b) => {
    b.onclick = () => {
      if (gen !== runGen) {
        news.classList.add('hidden');
        return;
      }
      const c = ev.choices[Number(b.dataset.ev)];
      if (c.cash) S.market.cash += c.cash;
      if (c.sentiment) S.market.sentiment += c.sentiment;
      if (c.hypeDebt) S.market.hypeDebt += c.hypeDebt;
      news.classList.add('hidden');
      banner(c.outcome);
      sClick();
      hud();
    };
  });
}

// ---------- HUD ----------

function milestones(): Array<{ label: string; done: boolean }> {
  const announced = S.market.announced.measured + S.market.announced.indicated + S.market.announced.inferred;
  return [
    { label: 'STRIKE', done: S.holesHit > 0 },
    { label: 'RESOURCE', done: announced >= RESOURCE_OZ },
    { label: 'FUNDED', done: S.funded },
    { label: 'BUILT', done: S.buildings.length >= BUILDINGS.length },
    { label: 'POURING', done: S.phase === 'ops' || S.over },
    { label: 'LEGEND', done: S.over },
  ];
}

function hud(): void {
  const m = S.market;
  $('stat-cash').textContent = fmtMoney(m.cash);
  $('stat-oz').textContent = S.foundOz > 0 ? fmtOz(S.foundOz) : '0 oz';
  const prev = m.history.length > 8 ? m.history[m.history.length - 8] : m.history[0];
  const chg = prev > 0 ? ((m.price - prev) / prev) * 100 : 0;
  $('stat-price').innerHTML = `${(m.price * 100).toFixed(1)}c <span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'}</span>`;
  $('stat-value').textContent = fmtMoney(marketCap(m));
  $('stat-stake').textContent = `${S.stake}%`;

  const un = unannouncedOz();
  const annBtn = $('btn-announce') as HTMLButtonElement;
  annBtn.disabled = un < 2000;
  annBtn.classList.toggle('attn', un >= 2000);
  $('announce-badge').textContent = un >= 2000 ? fmtOz(un) : '';

  const fundBtn = $('btn-fund') as HTMLButtonElement;
  fundBtn.classList.toggle('hidden', S.funded || S.phase !== 'explore');
  const announced = m.announced.measured + m.announced.indicated + m.announced.inferred;
  fundBtn.classList.toggle('attn', announced >= RESOURCE_OZ && !S.funded);

  // Milestone track (+ a little fanfare when one flips).
  const ms = milestones();
  const doneCount = ms.filter((x) => x.done).length;
  if (prevMsDone >= 0 && doneCount > prevMsDone) sDing();
  prevMsDone = doneCount;
  const active = ms.findIndex((x) => !x.done);
  $('milestones').innerHTML = ms
    .map((x, i) => `<span class="ms ${x.done ? 'done' : ''} ${i === active ? 'active' : ''}">${x.label}</span>`)
    .join('<span class="ms-link"></span>');

  pulseIfChanged('stat-cash');
  pulseIfChanged('stat-oz');
  pulseIfChanged('stat-value');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------- Drawing ----------

function draw(): void {
  const pit = S.ops ? { mask: S.ops.dug, dug: true } : S.phase === 'place' ? { mask: estimatedPit(S.k), dug: false } : null;
  render(
    ctx, S.world, S.k, false,
    S.drilling || S.phase === 'place' ? null : S.hover,
    0, [], S.buildings, pit, animTick,
    { warm: heatWarm, cold: heatCold, smoke: smokeShown },
    performance.now() < floodUntil,
  );

  // Aeromag scanline sweeping the survey onto the map (logical px — the ctx
  // transform handles dpr; canvas.height would sweep twice the screen).
  const aeroT = performance.now() - aeroStart;
  if (aeroT < AERO_MS + 200) {
    const { w: LW, h: LH } = canvasSize();
    const ly = (aeroT / AERO_MS) * LH;
    ctx.fillStyle = 'rgba(196, 162, 248, 0.75)';
    ctx.fillRect(0, ly, LW, 2.5);
    ctx.fillStyle = 'rgba(196, 162, 248, 0.18)';
    ctx.fillRect(0, ly - 14, LW, 14);
  }

  // Near-miss chevron: pulses toward the neighbour that whispered.
  if (hint && performance.now() < hint.until) {
    const dirX = ((hint.dx - hint.dy) * TW) / 2;
    const dirY = ((hint.dx + hint.dy) * TH) / 2;
    const len = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    const pulse = 20 + Math.sin(animTick / 5) * 5;
    const hx = hint.sx + ux * pulse;
    const hy = hint.sy + 8 + uy * pulse;
    ctx.fillStyle = 'rgba(240, 192, 64, 0.95)';
    ctx.beginPath();
    ctx.moveTo(hx + ux * 10, hy + uy * 10);
    ctx.lineTo(hx - uy * 6, hy + ux * 6);
    ctx.lineTo(hx + uy * 6, hy - ux * 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#221812';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Placement ghost.
  if (S.phase === 'place' && S.hover) {
    const def = currentBuilding();
    const estPit = estimatedPit(S.k);
    const ok = canPlace(S.world, estPit, S.buildings, def, S.hover.x, S.hover.y).ok;
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const x = S.hover.x + dx;
        const y = S.hover.y + dy;
        if (!inMap(x, y)) continue;
        const t = S.world.tiles[idx(x, y)];
        const { sx, sy } = tileScreen(x, y, t.elev);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + TW / 2, sy + TH / 2);
        ctx.lineTo(sx, sy + TH);
        ctx.lineTo(sx - TW / 2, sy + TH / 2);
        ctx.closePath();
        ctx.fillStyle = ok ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.35)';
        ctx.fill();
        ctx.strokeStyle = ok ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // The rig — a proper little truck-mounted RC rig, kitsch and proud.
  if (S.drilling) {
    const d = S.drilling;
    const t = S.world.tiles[idx(d.x, d.y)];
    const { sx, sy } = tileScreen(d.x, d.y, t.elev);
    const el = performance.now() - d.t0;
    const jx = d.phase === 'drill' ? Math.round(Math.sin(el / 12) * 1.4) : 0;
    const O = '#221812';

    // Truck: chassis, cab, wheels, exhaust.
    ctx.fillStyle = O;
    ctx.fillRect(sx - 16 + jx, sy - 3, 26, 8);
    ctx.fillStyle = '#e8c559';
    ctx.fillRect(sx - 15 + jx, sy - 2, 24, 6);
    ctx.fillStyle = '#c8ccd2';
    ctx.fillRect(sx - 15 + jx, sy - 7, 7, 6); // cab
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(sx - 14 + jx, sy - 6, 3, 3); // windscreen
    ctx.fillStyle = '#111';
    for (const wx of [-12, -4, 4]) {
      ctx.beginPath();
      ctx.arc(sx + wx + jx, sy + 6, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mast: raises during the slam, braced when up.
    const mastH = d.phase === 'slam' ? Math.min(30, el * 0.25) : 30;
    ctx.fillStyle = O;
    ctx.fillRect(sx + 3 + jx, sy - mastH - 2, 7, mastH + 4);
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(sx + 4 + jx, sy - mastH - 1, 5, mastH + 2);
    ctx.strokeStyle = O;
    ctx.lineWidth = 1;
    for (let by = 6; by < mastH; by += 7) {
      ctx.beginPath();
      ctx.moveTo(sx + 4 + jx, sy - by);
      ctx.lineTo(sx + 9 + jx, sy - by - 5);
      ctx.stroke();
    }
    if (d.phase === 'drill') {
      // Rotation head travels down the mast; rods spin below it.
      const hy = sy - 26 + ((el % 660) / 660) * 20;
      ctx.fillStyle = O;
      ctx.fillRect(sx + 1 + jx, hy - 1, 11, 6);
      ctx.fillStyle = '#c94f3f';
      ctx.fillRect(sx + 2 + jx, hy, 9, 4);
      ctx.fillStyle = '#8a8f98';
      ctx.fillRect(sx + 5 + jx, hy + 4, 3, sy - hy - 2);
      // Collar dust ring + exhaust chuffs.
      ctx.fillStyle = 'rgba(214, 190, 160, 0.85)';
      ctx.beginPath();
      ctx.arc(sx + 6 + jx + Math.sin(el / 60) * 3, sy + 1, 3 + (el % 240) / 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 120, 118, 0.5)';
      ctx.beginPath();
      ctx.arc(sx - 17 + jx, sy - 9 - (el % 500) / 45, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // The driller: hi-vis, hard hat, professionally unbothered.
    const armUp = Math.floor(el / 520) % 2 === 0;
    ctx.fillStyle = O;
    ctx.fillRect(sx - 23, sy - 9, 5, 10);
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(sx - 22, sy - 8, 3, 5); // hi-vis
    ctx.fillStyle = '#2a2f3a';
    ctx.fillRect(sx - 22, sy - 3, 3, 4); // pants
    ctx.fillStyle = '#f2ede2';
    ctx.fillRect(sx - 22, sy - 11, 3, 3); // head + hat
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 23, sy - 12, 5, 2);
    if (armUp) {
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(sx - 25, sy - 8, 2, 3); // pointing at the hole, obviously
    }
  }

  drawStation();
  drawCritters();
  drawIdleFlies();

  // Haul trucks — the hypnosis. Pit ↔ plant, loaded one way.
  if (S.phase === 'ops' && S.ops && S.buildings.length) {
    const o = S.ops;
    const plant = S.buildings.find((b) => b.key === 'plant')!;
    const pitTile = o.digOrder[Math.max(0, Math.min(o.digCursor - 1, o.digOrder.length - 1))];
    const pt = { x: pitTile % MAP, y: Math.floor(pitTile / MAP) };
    const a = tileScreen(pt.x, pt.y, S.world.tiles[idx(pt.x, pt.y)].elev);
    const b = tileScreen(plant.x + 1, plant.y + 1, S.world.tiles[idx(plant.x, plant.y)].elev);
    const trucks = META.extraTruck ? 3 : 2;
    for (let i = 0; i < trucks; i++) {
      const period = 5200 + i * 400;
      const ph = ((performance.now() + i * 2100) % period) / period; // 0..1
      const leg = ph < 0.5 ? ph * 2 : (1 - ph) * 2; // there and back
      const loaded = ph < 0.5;
      const tx = a.sx + (b.sx - a.sx) * leg;
      const ty = a.sy + (b.sy - a.sy) * leg - 4;
      ctx.fillStyle = '#221812';
      ctx.fillRect(tx - 8, ty - 6, 17, 9);
      ctx.fillStyle = '#e8c559';
      ctx.fillRect(tx - 7, ty - 5, 15, 7);
      ctx.fillStyle = '#221812';
      ctx.fillRect(tx + 4, ty - 9, 5, 4); // cab
      if (loaded) {
        ctx.fillStyle = '#8a6b48';
        ctx.fillRect(tx - 5, ty - 8, 8, 3);
      }
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(tx - 4, ty + 3, 2, 0, Math.PI * 2);
      ctx.arc(tx + 3, ty + 3, 2, 0, Math.PI * 2);
      ctx.fill();
      // dust
      if (((animTick | 0) + i * 7) % 3 === 0) {
        ctx.fillStyle = 'rgba(214,190,160,0.5)';
        ctx.beginPath();
        ctx.arc(tx - 10 * (loaded ? 1 : -1), ty + 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------- Station life: cattle by the windmill, flies when you idle ----------

function drawStation(): void {
  const O = '#221812';
  const wm = tileScreen(1, 10, S.world.tiles[idx(1, 10)].elev);
  const cow = (ox: number, oy: number, ph: number, patch: boolean): void => {
    const cx = wm.sx + ox;
    const cy = wm.sy + oy;
    const grazing = Math.floor((animTick + ph) / 30) % 3 !== 0;
    ctx.fillStyle = O;
    ctx.fillRect(cx - 6, cy - 7, 13, 8);
    ctx.fillStyle = '#8a6b4f';
    ctx.fillRect(cx - 5, cy - 6, 11, 6);
    if (patch) {
      ctx.fillStyle = '#e8e2d4';
      ctx.fillRect(cx - 2, cy - 6, 4, 4);
    }
    ctx.fillStyle = O; // head — down grazing, up chewing
    ctx.fillRect(cx + 6, grazing ? cy - 3 : cy - 9, 4, 4);
    ctx.fillRect(cx - 6, cy + 1, 2, 3); // legs
    ctx.fillRect(cx + 3, cy + 1, 2, 3);
    if ((animTick + ph) % 45 < 5) {
      ctx.strokeStyle = O; // tail flick
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 5);
      ctx.lineTo(cx - 10, cy - 8);
      ctx.stroke();
    }
  };
  cow(-20, 20, 0, true);
  cow(18, 14, 17, false);
}

function drawIdleFlies(): void {
  if (S.over || S.phase !== 'explore') return;
  const idle = performance.now() - lastTapAt;
  if (idle < 20000) return;
  const anchor = S.fingerDone ? { x: MAP >> 1, y: MAP >> 1 } : S.fingerTarget;
  const t = S.world.tiles[idx(anchor.x, anchor.y)];
  const { sx, sy } = tileScreen(anchor.x, anchor.y, t.elev);
  ctx.fillStyle = '#15130f';
  for (let i = 0; i < 3; i++) {
    const a = animTick / 4 + i * 2.1;
    ctx.fillRect(sx + Math.cos(a) * (9 + i * 3), sy - 6 + Math.sin(a * 1.4) * 6, 2, 2);
  }
  if (!idleQuipDone) {
    idleQuipDone = true;
    say('🧭 The Geo', 'You gonna drill or what? The flies are forming a committee.');
  }
}

// ---------- Ambient critters: roos, willy-willies, galahs ----------

interface Critter {
  kind: 'roo' | 'willy' | 'galahs' | 'emus' | 'roadtrain';
  x: number; // canvas px — except the road train, which counts highway tiles
  y: number;
  born: number;
}

let critters: Critter[] = [];
let nextRoadTrain = performance.now() + 12000;

function maybeSpawnCritter(): void {
  // The road train keeps its own schedule. Like all road trains.
  const now = performance.now();
  if (now > nextRoadTrain) {
    critters.push({ kind: 'roadtrain', x: -3.5, y: 0, born: now });
    nextRoadTrain = now + 30000 + Math.random() * 25000;
  }
  if (critters.length >= 3 || Math.random() > 0.008) return;
  const kinds: Critter['kind'][] = ['roo', 'roo', 'emus', 'willy', 'galahs'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const { w } = canvasSize();
  critters.push({
    kind,
    x: kind === 'galahs' ? -30 : w + 20,
    y: kind === 'galahs' ? 24 + Math.random() * 60 : 240 + Math.random() * 300,
    born: now,
  });
}

function drawCritters(): void {
  const now = performance.now();
  const { w } = canvasSize();
  const O = '#221812';
  critters = critters.filter((c) => c.x > -60 && c.x < w + 60 && now - c.born < 40000);
  for (const c of critters) {
    const age = now - c.born;
    if (c.kind === 'roo') {
      c.x -= 0.058 * frameDt;
      const hop = Math.abs(Math.sin(age / 260)) * 15;
      const y = c.y - hop;
      const airborne = hop > 4;
      ctx.fillStyle = O;
      ctx.fillRect(c.x - 7, y - 9, 12, 8); // body outline
      ctx.fillStyle = '#a97d54';
      ctx.fillRect(c.x - 6, y - 8, 10, 6); // body
      ctx.fillRect(c.x + 3, y - 13, 4, 6); // head up
      ctx.fillStyle = O;
      ctx.fillRect(c.x + 4, y - 16, 2, 3); // ears
      ctx.fillRect(c.x + 7, y - 15, 1, 2);
      ctx.fillStyle = '#8a6540';
      ctx.fillRect(c.x - 12, y - 6, 6, 3); // tail
      ctx.fillStyle = O;
      if (airborne) {
        ctx.fillRect(c.x - 4, y - 2, 3, 4); // legs tucked
        ctx.fillRect(c.x + 1, y - 2, 3, 4);
      } else {
        ctx.fillRect(c.x - 5, y - 2, 3, 6);
        ctx.fillRect(c.x + 2, y - 2, 3, 6);
        ctx.fillStyle = 'rgba(214,190,160,0.6)'; // landing dust
        ctx.beginPath();
        ctx.arc(c.x + 6, c.y + 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (c.kind === 'roadtrain') {
      // Prime mover + three trailers, thundering down the highway (row 3).
      c.x += 0.0021 * frameDt;
      if (c.x > MAP + 4.5) {
        c.born = 0; // culled next frame
        continue;
      }
      const unit = (t: number, isCab: boolean): void => {
        const p = tileScreen(t, 3, 0.58);
        const ux = p.sx;
        const uy = p.sy;
        ctx.fillStyle = O;
        ctx.fillRect(ux - 11, uy - 6, 24, 11);
        ctx.fillStyle = isCab ? '#c94f3f' : '#c8ccd2';
        ctx.fillRect(ux - 10, uy - 5, 22, 9);
        if (isCab) {
          ctx.fillStyle = '#3a3f47';
          ctx.fillRect(ux + 5, uy - 4, 5, 4); // windscreen
          ctx.fillStyle = O;
          ctx.fillRect(ux + 1, uy - 11, 2, 6); // exhaust stack
          ctx.fillStyle = 'rgba(120,120,118,0.5)';
          ctx.beginPath();
          ctx.arc(ux + 2, uy - 15 - (age % 400) / 60, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#111';
        for (const wx of [-7, 0, 7]) {
          ctx.beginPath();
          ctx.arc(ux + wx, uy + 5, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      for (let u = 3; u >= 1; u--) unit(c.x - u * 1.05, false);
      unit(c.x, true);
      // Dust plume off the back.
      const dp = tileScreen(c.x - 4.4, 3, 0.58);
      ctx.fillStyle = 'rgba(214,190,160,0.45)';
      ctx.beginPath();
      ctx.arc(dp.sx, dp.sy + 4, 4 + (age % 300) / 90, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.kind === 'emus') {
      // A file of emus: small bodies, periscope necks, ridiculous legs.
      c.x -= 0.03 * frameDt;
      for (let i = 0; i < 3; i++) {
        const bx = c.x + i * 17;
        const by = c.y + (i % 2) * 3;
        const step = Math.floor((age / 110 + i) % 2) === 0;
        ctx.fillStyle = O;
        ctx.fillRect(bx - 5, by - 15, 11, 8); // body outline
        ctx.fillStyle = '#7a6a58';
        ctx.fillRect(bx - 4, by - 14, 9, 6);
        ctx.fillStyle = O; // neck + head, always suspicious
        ctx.fillRect(bx - 4, by - 24, 2, 10);
        ctx.fillRect(bx - 6, by - 25, 4, 3);
        ctx.strokeStyle = O; // the legs
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (step) {
          ctx.moveTo(bx - 2, by - 8);
          ctx.lineTo(bx - 5, by);
          ctx.moveTo(bx + 2, by - 8);
          ctx.lineTo(bx + 4, by - 1);
        } else {
          ctx.moveTo(bx - 2, by - 8);
          ctx.lineTo(bx - 1, by);
          ctx.moveTo(bx + 2, by - 8);
          ctx.lineTo(bx + 6, by - 2);
        }
        ctx.stroke();
      }
    } else if (c.kind === 'willy') {
      c.x -= 0.014 * frameDt;
      const sway = Math.sin(age / 300) * 6;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = `rgba(206, 178, 144, ${0.32 - i * 0.05})`;
        ctx.beginPath();
        ctx.arc(
          c.x + sway * (i / 3) + Math.sin(age / 90 + i * 2) * (2 + i * 1.5),
          c.y - i * 9,
          2.5 + i * 2.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      c.x += 0.113 * frameDt;
      const flap = Math.floor(age / 110) % 2 === 0;
      for (let i = 0; i < 3; i++) {
        const bx = c.x - i * 14;
        const by = c.y + (i % 2) * 7;
        ctx.strokeStyle = '#e8a0b4'; // galah pink
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (flap) {
          ctx.moveTo(bx - 4, by - 3);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + 4, by - 3);
        } else {
          ctx.moveTo(bx - 4, by + 2);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + 4, by + 2);
        }
        ctx.stroke();
      }
    }
  }
}

// ---------- Events ----------

canvas.addEventListener('click', (ev) => {
  const p = pick(canvas, ev, S.world);
  if (p) onTap(p.x, p.y);
});
canvas.addEventListener('mousemove', (ev) => {
  S.hover = pick(canvas, ev, S.world); // rAF paints it — no input-driven draws
});
canvas.addEventListener('mouseleave', () => {
  S.hover = null;
});

$('btn-announce').addEventListener('click', () => {
  if (unannouncedOz() < 2000) return;
  sClick();
  $('announce-pop').classList.toggle('hidden');
});
$('btn-straight').addEventListener('click', () => doAnnounce(false));
$('btn-loud').addEventListener('click', () => doAnnounce(true));
$('btn-raise').addEventListener('click', doRaise);
$('btn-fund').addEventListener('click', tryFund);
$('btn-fresh').addEventListener('click', () => newRun(randomSeedName(Math.random())));
$('btn-daily').addEventListener('click', () => {
  const d = new Date();
  newRun(`DAILY-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('announce-pop').classList.add('hidden');
});
window.addEventListener('resize', () => {
  if (S !== undefined && !S.fingerDone) placeFinger();
});
$('seed-chip').addEventListener('click', () => {
  navigator.clipboard.writeText(location.href).then(() => banner('Challenge link copied — same ground, their taps.'));
});
{
  const muteBtn = $('btn-mute');
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    muteBtn.textContent = toggleMute() ? '🔇' : '🔊';
  });
}

// Main loop: ambience + operations. Interval-driven (rAF stalls when hidden).
// SIMULATION: 12.5 Hz interval — cheap, and it keeps ticking in hidden tabs.
let simTick = 0;
window.setInterval(() => {
  if (S === undefined) return;
  simTick++;
  if (!document.hidden) maybeSpawnCritter();
  const now = performance.now();
  // Aeromag reveal: smoke arrives in diagonal bands behind the scanline.
  const aeroT = now - aeroStart;
  if (aeroT < AERO_MS + 300) {
    const band = (aeroT / AERO_MS) * (2 * MAP);
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (x + y <= band) smokeShown[idx(x, y)] = S.world.aeromag[idx(x, y)];
      }
    }
  }
  if (S.phase === 'ops') {
    opsTick(now);
    if (simTick % 12 === 0) tickDays(S.market, 1, mktRng); // ~1 market day/sec
    if (simTick % 3 === 0) hud();
  }
}, 80);

// RENDER: requestAnimationFrame at display rate, dt-true — the rig rattles
// instead of swaying, the windmill spins instead of strobing. (The Mojang
// reviewer was right: a game you never watch at full rate is a flipbook.)
let frameDt = 16;
let lastFrameT = performance.now();
(function frame(now: number): void {
  frameDt = Math.min(50, now - lastFrameT);
  lastFrameT = now;
  animTick = now / 16;
  if (S !== undefined && !document.hidden) draw();
  requestAnimationFrame(frame);
})(performance.now());

// ---------- Boot: straight into the dirt ----------

const urlSeed = (new URLSearchParams(location.search).get('seed') || '').trim().toUpperCase();
newRun(urlSeed || randomSeedName(Math.random()));
