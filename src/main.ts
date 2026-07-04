/**
 * Feasibility — app wiring. Quarterly turn loop (D-017): plan field programs
 * on the map, Run Quarter, read the Quarterly Report, decide what to tell the
 * market. Deterministic world + replayable actions = save games and challenge
 * links with zero backend.
 */

import './style.css';
import { Rng } from './core/rng';
import { generateWorld, idx, MAP, randomSeedName, Terrain, World } from './core/world';
import { BUILDINGS, canPlace, estimatedPit, occupiedBy, Placed, sitingPenalties, truePit } from './core/build';
import { isMuted, pulseIfChanged, sClick, sDing, shake, sKaching, sThud, toggleMute } from './ui/juice';
import {
  applyProgram,
  Knowledge,
  newKnowledge,
  ProgramResult,
  resourceTotals,
  terrainAccess,
  Tool,
  TOOLS,
} from './core/survey';
import {
  announce,
  DIFFICULTIES,
  Difficulty,
  Market,
  marketCap,
  newMarket,
  pushNews,
  raise,
  sentimentWord,
  tickDays,
} from './core/market';
import { drawEvent, EventChoice, QuarterEvent } from './core/events';
import {
  ConsultantTier,
  CONSULTANTS,
  describe,
  generateTruth,
  projectNPV,
  ProjectTruth,
  runStudy,
  STUDIES,
  StudyDef,
  StudyKey,
  StudyResult,
  tierOf,
} from './core/feasibility';
import { FIRM } from './core/branding';
import { fmtMoney, fmtOz } from './core/econ';
import { canvasSize, pick, render, tileScreen } from './ui/isomap';

const SAVE_KEY = 'feasibility-v3';
const FEAS_MI_OZ = 100_000; // confident (M+I) ounces to justify a study
const FEAS_CASH = 1_000_000;
const BASE_SLOTS = 4;
const EVENT_CHANCE = 0.55;

interface Action {
  tool: Tool;
  x: number;
  y: number;
}

interface Planned extends Action {
  cost: number;
}

interface QueuedStudy {
  key: StudyKey;
  tier: ConsultantTier['key'];
  cost: number;
}

interface Game {
  world: World;
  k: Knowledge;
  market: Market;
  hover: { x: number; y: number } | null;
  actions: Action[]; // completed programs (replayable)
  plan: Planned[]; // queued for this quarter
  bestGradeInHand: number;
  tenements: number;
  slotPenalty: number; // rigs lost this coming quarter (event fallout)
  showFindings: boolean;
  phase: 'explore' | 'feas';
  studies: Partial<Record<StudyKey, StudyResult>>;
  studiesQueued: QueuedStudy[];
  dfs: { published: boolean; estNPV: number; built?: boolean };
  buildMode: boolean;
  buildings: Placed[];
}

let G!: Game; // definite-assignment: set by startGame/tryRestore before any interaction
let mktRng: Rng;

// Radial menu state.
let pendingTile: { x: number; y: number } | null = null;
let previewTool: Tool | null = null;

// Ambient animation clock (rAF loop lives at the bottom of the file).
let animTick = 0;

// ---------- DOM ----------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const mapCanvas = $<HTMLCanvasElement>('map');
const mapCtx = mapCanvas.getContext('2d')!;
const sparkCanvas = $<HTMLCanvasElement>('spark');
const sparkCtx = sparkCanvas.getContext('2d')!;
const radial = $('radial');
{
  const { w, h } = canvasSize();
  mapCanvas.width = w;
  mapCanvas.height = h;
}

// ---------- Helpers ----------

function maxSlots(): number {
  return Math.max(1, BASE_SLOTS - G.slotPenalty);
}

function plannedCost(): number {
  return G.plan.reduce((s, p) => s + p.cost, 0) + G.studiesQueued.reduce((s, q) => s + q.cost, 0);
}

function availableCash(): number {
  return G.market.cash - plannedCost();
}

function quarterLabel(): string {
  const q = Math.floor(G.market.day / 91);
  return `Q${(q % 4) + 1} '${String(26 + Math.floor(q / 4)).padStart(2, '0')}`;
}

let toastTimer = 0;
function toast(msg: string): void {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 3200);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------- Save / restore (deterministic replay) ----------

interface SaveBlob {
  seed: string;
  diffKey: Difficulty['key'];
  actions: Action[];
  plan?: Planned[];
  market: Omit<Market, 'diff'> & { diffKey: Difficulty['key'] };
  bestGradeInHand: number;
  tenements: number;
  slotPenalty?: number;
  phase?: Game['phase'];
  studies?: Game['studies'];
  studiesQueued?: QueuedStudy[];
  dfs?: Game['dfs'];
  buildMode?: boolean;
  buildings?: Placed[];
}

function saveGame(): void {
  const { diff, ...mkt } = G.market;
  const blob: SaveBlob = {
    seed: G.world.seed,
    diffKey: diff.key,
    actions: G.actions,
    plan: G.plan,
    market: { ...mkt, diffKey: diff.key, news: G.market.news.slice(0, 40) },
    bestGradeInHand: G.bestGradeInHand,
    tenements: G.tenements,
    slotPenalty: G.slotPenalty,
    phase: G.phase,
    studies: G.studies,
    studiesQueued: G.studiesQueued,
    dfs: G.dfs,
    buildMode: G.buildMode,
    buildings: G.buildings,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    /* storage full or blocked — the game just won't persist */
  }
}

function tryRestore(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const blob = JSON.parse(raw) as SaveBlob;
    const diff = DIFFICULTIES.find((d) => d.key === blob.diffKey);
    if (!diff || !blob.seed) return false;
    if (blob.actions.some((a) => a.x >= MAP || a.y >= MAP)) return false; // stale grid size

    const world = generateWorld(blob.seed);
    const k = newKnowledge();
    for (const a of blob.actions) applyProgram(world, k, a.tool, a.x, a.y);
    const { diffKey: _dk, ...mktFields } = blob.market;
    const market: Market = { ...mktFields, diff };

    G = {
      world,
      k,
      market,
      hover: null,
      actions: blob.actions,
      plan: blob.plan ?? [],
      bestGradeInHand: blob.bestGradeInHand ?? 0,
      tenements: blob.tenements ?? 0,
      slotPenalty: blob.slotPenalty ?? 0,
      showFindings: true,
      phase: blob.phase ?? 'explore',
      studies: blob.studies ?? {},
      studiesQueued: blob.studiesQueued ?? [],
      dfs: blob.dfs ?? { published: false, estNPV: 0 },
      buildMode: blob.buildMode ?? false,
      buildings: blob.buildings ?? [],
    };
    mktRng = new Rng(`${blob.seed}:mkt:${diff.key}:${blob.actions.length}`);
    $('start-overlay').classList.add('hidden');
    updateAll();
    return true;
  } catch {
    return false;
  }
}

// ---------- Game lifecycle ----------

function startGame(seed: string, diff: Difficulty, carry?: { market: Market; tenements: number }): void {
  const world = generateWorld(seed);
  const market = carry ? carry.market : newMarket(diff);
  mktRng = new Rng(`${seed}:mkt:${diff.key}`);

  if (carry) {
    pushNews(market, `${world.companyName} acquires the ${seed} tenement package. The register hopes.`, 'company');
  } else {
    pushNews(market, `${world.companyName} lists on the exchange at ${(market.price * 100).toFixed(1)}c. Champagne, then silence.`, 'company');
    pushNews(market, `IPO proceeds: ${fmtMoney(market.cash)}. Difficulty: ${diff.label}.`, 'market');
  }

  G = {
    world,
    k: newKnowledge(),
    market,
    hover: null,
    actions: [],
    plan: [],
    bestGradeInHand: 0,
    tenements: carry ? carry.tenements : 0,
    slotPenalty: 0,
    showFindings: true,
    phase: 'explore',
    studies: {},
    studiesQueued: [],
    dfs: { published: false, estNPV: 0 },
    buildMode: false,
    buildings: [],
  };
  closeRadial();

  const u = new URL(location.href);
  u.searchParams.set('seed', seed);
  u.searchParams.set('mode', diff.key);
  history.replaceState(null, '', u.toString());

  $('start-overlay').classList.add('hidden');
  $('overlay').classList.add('hidden');
  updateAll();
  saveGame();
}

// ---------- Radial tile menu: PLAN a program (D-016/D-017) ----------

function radialPos(x: number, y: number): { cx: number; cy: number; wrapW: number; wrapH: number } {
  const rect = mapCanvas.getBoundingClientRect();
  const wrap = $('map-wrap').getBoundingClientRect();
  const t = G.world.tiles[idx(x, y)];
  const s = tileScreen(x, y, t.elev);
  return {
    cx: (s.sx / mapCanvas.width) * rect.width + (rect.left - wrap.left),
    cy: ((s.sy + 10) / mapCanvas.height) * rect.height + (rect.top - wrap.top),
    wrapW: wrap.width,
    wrapH: wrap.height,
  };
}

const RADIAL_OFFSETS = [
  [0, -72],
  [72, 0],
  [0, 72],
  [-72, 0],
];

function openRadial(x: number, y: number): void {
  if (G.buildMode) {
    openBuildRadial(x, y);
    return;
  }
  const tile = G.world.tiles[idx(x, y)];
  const access = terrainAccess(tile.terrain);
  if (!access.allowed) {
    toast(access.note!);
    return;
  }
  if (G.plan.length >= maxSlots()) {
    toast(`All ${maxSlots()} rigs are booked this quarter. Run the quarter, or cancel a flagged program.`);
    return;
  }
  pendingTile = { x, y };
  previewTool = null;
  const { cx, cy, wrapW, wrapH } = radialPos(x, y);

  radial.querySelectorAll<HTMLButtonElement>('.rad-btn').forEach((b, i) => {
    const spec = TOOLS[i];
    const cost = spec.cost * access.costMult;
    const done =
      G.actions.some((a) => a.x === x && a.y === y && a.tool === spec.tool) ||
      G.plan.some((a) => a.x === x && a.y === y && a.tool === spec.tool);
    const afford = availableCash() >= cost;
    b.style.display = '';
    b.disabled = done || !afford;
    b.title = done
      ? 'Already done (or planned) here.'
      : !afford
        ? `Need ${fmtMoney(cost)} free — raise capital.`
        : spec.desc;
    b.querySelector<HTMLElement>('.rn')!.textContent = spec.short;
    b.querySelector<HTMLElement>('.rc')!.textContent = done ? 'done' : fmtMoney(cost);
    b.style.left = `${Math.min(Math.max(cx + RADIAL_OFFSETS[i][0], 34), wrapW - 34)}px`;
    b.style.top = `${Math.min(Math.max(cy + RADIAL_OFFSETS[i][1], 30), wrapH - 30)}px`;
    b.onmouseenter = () => {
      previewTool = spec.tool;
      drawMap();
    };
    b.onclick = (e) => {
      e.stopPropagation();
      const target = pendingTile;
      closeRadial();
      if (target) {
        sClick();
        G.plan.push({ tool: spec.tool, x: target.x, y: target.y, cost });
        toast(`${spec.name} planned. It happens when you run the quarter.`);
        updateAll();
        saveGame();
      }
    };
  });

  radial.classList.remove('hidden');
  drawMap();
}

function openBuildRadial(x: number, y: number): void {
  const tile = G.world.tiles[idx(x, y)];
  if (tile.terrain === Terrain.Heritage || tile.terrain === Terrain.Creek) {
    toast(tile.terrain === Terrain.Heritage ? 'Heritage area — nothing gets built here.' : "That's the creek. No.");
    return;
  }
  const estPit = estimatedPit(G.k);
  pendingTile = { x, y };
  previewTool = null;
  const { cx, cy, wrapW, wrapH } = radialPos(x, y);

  radial.querySelectorAll<HTMLButtonElement>('.rad-btn').forEach((b, i) => {
    if (i >= BUILDINGS.length) {
      b.style.display = 'none';
      return;
    }
    b.style.display = '';
    const def = BUILDINGS[i];
    const placed = G.buildings.some((p) => p.key === def.key);
    const fit = canPlace(G.world, estPit, G.buildings, def, x, y);
    b.disabled = placed || !fit.ok;
    b.title = placed
      ? `${def.name} already sited — tap it on the map to pick it up.`
      : fit.ok
        ? def.desc
        : fit.reason!;
    b.querySelector<HTMLElement>('.rn')!.textContent = def.short;
    b.querySelector<HTMLElement>('.rc')!.textContent = placed ? 'placed' : fit.ok ? `site ${def.w}×${def.h}` : "can't";
    b.style.left = `${Math.min(Math.max(cx + RADIAL_OFFSETS[i][0], 34), wrapW - 34)}px`;
    b.style.top = `${Math.min(Math.max(cy + RADIAL_OFFSETS[i][1], 30), wrapH - 30)}px`;
    b.onmouseenter = () => {};
    b.onclick = (e) => {
      e.stopPropagation();
      const target = pendingTile;
      closeRadial();
      if (target) {
        sClick();
        G.buildings.push({ key: def.key, x: target.x, y: target.y });
        toast(
          G.buildings.length >= BUILDINGS.length
            ? 'All sited. Pour first gold when you\'re ready.'
            : `${def.name} sited.`,
        );
        updateAll();
        saveGame();
      }
    };
  });

  radial.classList.remove('hidden');
  drawMap();
}

function closeRadial(): void {
  pendingTile = null;
  previewTool = null;
  radial.classList.add('hidden');
}

// ---------- Run the quarter ----------

function programLine(name: string, r: ProgramResult): { text: string; kind: string } {
  if (r.tool === Tool.Soil || r.tool === Tool.Aircore) {
    return r.bestGrade > 0.3
      ? { text: `${name}: a coherent gold anomaly is emerging.`, kind: 'good' }
      : { text: `${name}: the ground out there is quiet.`, kind: '' };
  }
  if (r.hitOz > 400) {
    return { text: `${name}: hit mineralization — around ${r.bestGrade.toFixed(1)} g/t gold.`, kind: 'good' };
  }
  if (r.blindBelow) {
    return { text: `${name}: still in cover at the bottom of the hole. Anything here is deeper — a core drill question.`, kind: '' };
  }
  return { text: `${name}: nothing. Money, straight down the hole.`, kind: 'bad' };
}

function runQuarter(): void {
  closeRadial();
  const label = quarterLabel();
  const lines: Array<{ text: string; kind: string }> = [];

  if (G.plan.length === 0) {
    lines.push({ text: 'No field programs this quarter. The tenement sat there. So did the share price.', kind: 'bad' });
    G.market.sentiment -= 0.02;
  }

  let bigHit = false;
  for (const p of G.plan) {
    if (G.market.cash < p.cost) {
      lines.push({ text: `${TOOLS[p.tool].name} deferred — the bank account said no.`, kind: 'bad' });
      continue;
    }
    G.market.cash -= p.cost;
    G.market.spentExploration += p.cost;
    const result = applyProgram(G.world, G.k, p.tool, p.x, p.y);
    G.actions.push({ tool: p.tool, x: p.x, y: p.y });
    G.bestGradeInHand = Math.max(G.bestGradeInHand, result.bestGrade);
    if (result.hitOz > 400 && result.bestGrade > 4.5) bigHit = true;
    lines.push(programLine(TOOLS[p.tool].name, result));
  }
  if (bigHit) shake(); // the whole site felt that intercept
  G.plan = [];
  G.slotPenalty = 0; // consumed; events below may set it again

  // Studies resolve alongside the field programs.
  const truth = generateTruth(G.world.seed);
  for (const q of G.studiesQueued) {
    const def = STUDIES.find((s) => s.key === q.key)!;
    const firm = tierOf(q.tier).firm;
    if (G.market.cash < q.cost) {
      lines.push({ text: `${def.name} study deferred — the bank account said no.`, kind: 'bad' });
      continue;
    }
    G.market.cash -= q.cost;
    const res = runStudy(truth, q.key, q.tier, mktRng);
    if (!res.done) {
      lines.push({
        text: `${def.name} study (${firm}) BOUNCED — the bank's independent engineer wants it redone. The money is gone.`,
        kind: 'bad',
      });
    } else {
      G.studies[q.key] = res;
      lines.push({ text: `${def.name} study (${firm}): ${describe(q.key, res.estimate)}.`, kind: 'good' });
    }
  }
  G.studiesQueued = [];

  tickDays(G.market, 91, mktRng);
  const event = drawEvent(mktRng, EVENT_CHANCE);
  showQuarterReport(label, lines, event);
  updateAll();
  saveGame();
}

function applyChoice(c: EventChoice): void {
  if (c.cash) G.market.cash += c.cash;
  if (c.sentiment) G.market.sentiment += c.sentiment;
  if (c.hypeDebt) G.market.hypeDebt += c.hypeDebt;
  if (c.slotPenalty) G.slotPenalty = c.slotPenalty;
  pushNews(G.market, c.outcome, c.cash && c.cash > 0 ? 'good' : 'company');
  updateAll();
  saveGame();
}

function pendingDeltas(): { m: number; i: number; f: number; total: number } {
  const t = resourceTotals(G.k);
  const a = G.market.announced;
  return {
    m: t.measured - a.measured,
    i: t.indicated - a.indicated,
    f: t.inferred - a.inferred,
    total: t.measured + t.indicated + t.inferred - a.measured - a.indicated - a.inferred,
  };
}

function showQuarterReport(
  label: string,
  lines: Array<{ text: string; kind: string }>,
  event: QuarterEvent | null,
): void {
  const p = pendingDeltas();
  const material = Math.abs(p.total) >= 2000;

  const disclosureHtml = material
    ? `
      <div class="disclose">
        <div class="dt">The Quarterly Report — what do you tell the market?</div>
        <p class="sub">New gold defined this quarter: <strong>${fmtOz(Math.max(0, p.total))}</strong>${p.total < 0 ? ' (a downgrade — ouch)' : ''}</p>
        <div class="modal-actions">
          <button class="btn" id="q-straight" title="Sober wording. The market trusts you a little more each time.">Report it straight</button>
          <button class="btn btn-promo" id="q-loud" ${p.total < 0 ? 'disabled' : ''} title="ALL CAPS. 'Bonanza'. 'District-scale'. Pumps the price now — hype is a debt the market always collects.">REPORT IT LOUD</button>
          <button class="btn btn-ghost" id="q-quiet" title="Lodge the bare minimum. Legal, but the market hates a quiet company.">Say as little as possible</button>
        </div>
      </div>`
    : `
      <div class="disclose">
        <div class="dt">The Quarterly Report</div>
        <p class="sub">Nothing material to report. The lawyers approve. The shareholders sigh.</p>
        <div class="modal-actions">
          <button class="btn btn-primary" id="q-lodge">Lodge it</button>
        </div>
      </div>`;

  $('modal-content').innerHTML = `
    <h2>${label} Quarterly Report</h2>
    <div class="sub">${escapeHtml(G.world.companyName)} — ${escapeHtml(G.world.seed)} project</div>
    <div class="qlines">
      ${lines.map((l) => `<p class="ql ${l.kind}">${escapeHtml(l.text)}</p>`).join('')}
    </div>
    ${event ? `
      <div class="event-card" id="event-card">
        <div class="dt">${escapeHtml(event.title)}</div>
        <p>${escapeHtml(event.text)}</p>
        <div class="modal-actions">
          ${event.choices.map((c, i) => `<button class="btn" data-ec="${i}">${escapeHtml(c.label)}</button>`).join('')}
        </div>
      </div>` : ''}
    ${disclosureHtml}`;
  $('overlay').classList.remove('hidden');
  if (lines.some((l) => l.kind === 'good')) sDing();
  else if (lines.some((l) => l.kind === 'bad')) sThud();

  if (event) {
    $('event-card')
      .querySelectorAll<HTMLButtonElement>('[data-ec]')
      .forEach((b) => {
        b.onclick = () => {
          const choice = event.choices[Number(b.dataset.ec)];
          applyChoice(choice);
          $('event-card').innerHTML = `<div class="dt">${escapeHtml(event.title)}</div><p class="ql">${escapeHtml(choice.outcome)}</p>`;
        };
      });
  }

  const closeReport = (): void => {
    $('overlay').classList.add('hidden');
    updateAll();
    saveGame();
  };

  const disclose = (mode: 'straight' | 'loud' | 'quiet'): void => {
    const before = G.market.price;
    if (mode === 'quiet') {
      G.market.sentiment -= p.total > 10_000 ? 0.05 : 0.02;
      pushNews(G.market, 'Quarterly lodged. Activities: drilling. Results: pending. The register mutters.', 'company');
    } else {
      announce(
        G.market,
        {
          deltaMeasured: p.m,
          deltaIndicated: p.i,
          deltaInferred: p.f,
          bestGrade: G.bestGradeInHand,
          promotional: mode === 'loud',
          projectName: G.world.seed,
        },
        mktRng,
      );
      G.bestGradeInHand = 0;
    }
    tickDays(G.market, 4, mktRng);
    closeReport();
    const after = G.market.price;
    const dir = after >= before ? '▲' : '▼';
    if (after >= before) sKaching();
    else sThud();
    toast(`The market reacts: ${(before * 100).toFixed(1)}c ${dir} ${(after * 100).toFixed(1)}c`);
  };

  if (material) {
    $('q-straight').onclick = () => disclose('straight');
    ($('q-loud') as HTMLButtonElement).onclick = () => disclose('loud');
    $('q-quiet').onclick = () => disclose('quiet');
  } else {
    $('q-lodge').onclick = closeReport;
  }
}

// ---------- Corporate actions ----------

function doRaise(amount: number): void {
  raise(G.market, amount, mktRng);
  tickDays(G.market, 3, mktRng);
  updateAll();
  saveGame();
}

function feasibilityReady(): { ok: boolean; text: string } {
  const t = resourceTotals(G.k);
  const mi = t.measured + t.indicated;
  const okOz = mi >= FEAS_MI_OZ;
  const okCash = G.market.cash >= FEAS_CASH;
  const text = `${okOz ? '✓' : '✗'} ${fmtOz(mi)}/${fmtOz(FEAS_MI_OZ)} confident ounces (Indicated+Measured) · ${okCash ? '✓' : '✗'} ${fmtMoney(G.market.cash)}/${fmtMoney(FEAS_CASH)} cash`;
  return { ok: okOz && okCash, text };
}

// ---------- Feasibility phase (D-018) ----------

function enterFeasibility(): void {
  G.phase = 'feas';
  G.market.sentiment += 0.04;
  pushNews(
    G.market,
    `${G.world.companyName} kicks off the ${G.world.seed} Feasibility Study. Five studies stand between the gold and a bank cheque.`,
    'company',
  );
  $('modal-content').innerHTML = `
    <h2 class="funded">The Feasibility Study begins.</h2>
    <div class="sub">${escapeHtml(G.world.companyName)} — ${escapeHtml(G.world.seed)} project</div>
    <p class="ql">Five studies stand between your gold and a mine: metallurgy, ground, water, approvals, mining. Click a study chip above the map, pick a consultant, and run the quarter. Two studies a quarter, tops — and you can keep drilling with the rigs meanwhile.</p>
    <p class="ql">Choose consultants carefully. Cheap reports read fine — right up until construction, when the ground marks them.</p>
    <div class="modal-actions"><button class="btn btn-primary" id="feas-go">Let's build a mine</button></div>`;
  $('overlay').classList.remove('hidden');
  $('feas-go').onclick = () => $('overlay').classList.add('hidden');
  updateAll();
  saveGame();
}

function renderStudies(): void {
  const strip = $('studies');
  strip.classList.toggle('hidden', G.phase !== 'feas');
  if (G.phase !== 'feas') return;
  strip.innerHTML = STUDIES.map((s) => {
    const r = G.studies[s.key];
    const q = G.studiesQueued.find((x) => x.key === s.key);
    const state = r?.done ? 'done' : q ? 'queued' : 'todo';
    const tip = r?.done
      ? `${describe(s.key, r.estimate)} (${tierOf(r.tier).firm})`
      : q
        ? `${tierOf(q.tier).firm} booked — happens when you run the quarter. Click to cancel.`
        : `${s.desc} Click to commission.`;
    const mark = r?.done ? '✓' : q ? '⟳' : '+';
    return `<button class="study-chip ${state}" data-study="${s.key}" title="${escapeHtml(tip)}"><b>${s.short}</b><span>${mark}</span></button>`;
  }).join('');
  strip.querySelectorAll<HTMLButtonElement>('.study-chip').forEach((b) => {
    b.onclick = () => onStudyChip(b.dataset.study as StudyKey);
  });
}

function onStudyChip(key: StudyKey): void {
  const def = STUDIES.find((s) => s.key === key)!;
  const r = G.studies[key];
  if (r?.done) {
    toast(`${def.name}: ${describe(key, r.estimate)} — per ${tierOf(r.tier).firm}.`);
    return;
  }
  const qi = G.studiesQueued.findIndex((x) => x.key === key);
  if (qi >= 0) {
    G.studiesQueued.splice(qi, 1);
    toast(`${def.name} study cancelled.`);
    updateAll();
    saveGame();
    return;
  }
  if (G.studiesQueued.length >= 2) {
    toast('Two studies a quarter is all management can handle.');
    return;
  }
  showConsultantPicker(def);
}

function showConsultantPicker(def: StudyDef): void {
  $('modal-content').innerHTML = `
    <h2>${escapeHtml(def.name)} study — pick your consultant</h2>
    <div class="sub">${escapeHtml(def.desc)}</div>
    <div class="diff-cards">
      ${CONSULTANTS.map(
        (c) => `
        <button class="diff-card ${c.key === 'good' ? 'tier-good' : ''}" data-tier="${c.key}" ${availableCash() < c.cost ? 'disabled' : ''}>
          <span class="diff-label">${escapeHtml(c.firm)} — ${fmtMoney(c.cost)}${c.key === 'good' ? ' ★' : ''}</span>
          <span class="diff-blurb">${escapeHtml(c.blurb)}</span>
        </button>`,
      ).join('')}
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" id="pick-cancel">Not this quarter</button></div>`;
  $('overlay').classList.remove('hidden');
  document.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((b) => {
    b.onclick = () => {
      const tier = tierOf(b.dataset.tier as ConsultantTier['key']);
      G.studiesQueued.push({ key: def.key, tier: tier.key, cost: tier.cost });
      $('overlay').classList.add('hidden');
      toast(`${tier.firm} booked for the ${def.name} study. It happens when you run the quarter.`);
      updateAll();
      saveGame();
    };
  });
  $('pick-cancel').onclick = () => $('overlay').classList.add('hidden');
}

function enterBuildMode(): void {
  G.buildMode = true;
  pushNews(G.market, `${G.world.companyName} approves construction at ${G.world.seed}. Now — where does everything go?`, 'company');
  $('modal-content').innerHTML = `
    <h2 class="funded">Site your mine.</h2>
    <div class="sub">The white dashed line is the pit YOU expect — drawn from YOUR drilling.</div>
    <p class="ql">Tap the map to place the Process Plant, the Tailings Dam and the Camp. The pit outline comes from what you know — but the orebody has its own opinion, and pushbacks eat ground. Build too close and you'll be moving concrete later, at your expense.</p>
    <p class="ql">And keep the tailings away from the creek. Please.</p>
    <div class="modal-actions"><button class="btn btn-primary" id="build-go">Get siting</button></div>`;
  $('overlay').classList.remove('hidden');
  $('build-go').onclick = () => $('overlay').classList.add('hidden');
  updateAll();
  saveGame();
}

function estimateParams(): ProjectTruth {
  const g = (k: StudyKey, dflt: number): number => {
    const r = G.studies[k];
    return r?.done ? r.estimate : dflt;
  };
  return { met: g('met', 0.92), geo: g('geo', 1), water: g('water', 1), permit: g('permit', 0), mining: g('mining', 1) };
}

function showPublishModal(): void {
  const t = resourceTotals(G.k);
  const est = projectNPV(t.measured + t.indicated, t.inferred, estimateParams(), G.market.goldPrice);
  const studyLines = STUDIES.map((s) => {
    const r = G.studies[s.key]!;
    return `<p class="ql">${escapeHtml(s.name)} (${escapeHtml(tierOf(r.tier).firm)}): ${escapeHtml(describe(s.key, r.estimate))}.</p>`;
  }).join('');

  $('modal-content').innerHTML = `
    <h2>Publish the Feasibility Study</h2>
    <div class="sub">${escapeHtml(G.world.companyName)} — the biggest announcement a junior ever makes</div>
    <div class="kpis">
      <div class="kpi"><div class="k">Project value (your studies say)</div><div class="v ${est > 0 ? 'gold' : 'bad'}">${fmtMoney(est)}</div></div>
      <div class="kpi"><div class="k">Gold resource</div><div class="v gold">${fmtOz(t.total)}</div></div>
    </div>
    <div class="qlines">${studyLines}</div>
    <div class="modal-actions">
      ${
        est > 0
          ? `<button class="btn" id="pub-straight">Publish it straight</button>
             <button class="btn btn-promo" id="pub-loud">PUBLISH IT LOUD</button>`
          : `<button class="btn" id="pub-straight">Publish it anyway (ouch)</button>`
      }
      <button class="btn btn-ghost" id="pub-wait">Not yet</button>
    </div>`;
  $('overlay').classList.remove('hidden');

  const publish = (loud: boolean): void => {
    const before = G.market.price;
    G.dfs = { published: true, estNPV: est };
    G.market.dfsBoost = 1.8;
    if (est > 0) {
      let bump = 0.12 + Math.min(0.3, est / 600e6);
      if (loud) {
        bump *= 1.6;
        G.market.hypeDebt += bump * 0.5;
        pushNews(G.market, `"${G.world.seed} FEASIBILITY CONFIRMS COMPANY-MAKING ECONOMICS" — ${fmtMoney(est)} project value. The market inhales.`, 'announcement');
      } else {
        pushNews(G.market, `Feasibility Study published: ${G.world.seed} project value ${fmtMoney(est)}. Sober fonts, big number.`, 'announcement');
      }
      G.market.sentiment += bump;
    } else {
      G.market.sentiment -= 0.2;
      pushNews(G.market, `Feasibility Study published: ${G.world.seed} is marginal. Honesty is noted; the share price is not grateful.`, 'bad');
    }
    tickDays(G.market, 4, mktRng);
    $('overlay').classList.add('hidden');
    updateAll();
    saveGame();
    if (G.market.price >= before) sKaching();
    else sThud();
    shake();
    toast(`The market reacts: ${(before * 100).toFixed(1)}c ${G.market.price >= before ? '▲' : '▼'} ${(G.market.price * 100).toFixed(1)}c`);
  };

  $('pub-straight').onclick = () => publish(false);
  const loudBtn = document.getElementById('pub-loud');
  if (loudBtn) (loudBtn as HTMLButtonElement).onclick = () => publish(true);
  $('pub-wait').onclick = () => $('overlay').classList.add('hidden');
}

function showBuildModal(): void {
  const t = resourceTotals(G.k);
  const truth = generateTruth(G.world.seed);
  const penalties = sitingPenalties(G.world, G.buildings);
  const penaltyCost = penalties.reduce((s, p) => s + p.cost, 0);
  const actual = projectNPV(t.measured + t.indicated, t.inferred, truth, G.market.goldPrice) - penaltyCost;
  const est = G.dfs.estNPV;
  const ratio = est > 0 ? actual / est : actual > 0 ? 1.2 : 1;
  G.buildMode = false;

  // The market marks the studies against reality.
  const before = G.market.price;
  if (ratio >= 0.9) {
    G.market.sentiment += 0.14 + Math.min(0.1, (ratio - 1) * 0.3);
    G.market.hypeDebt *= 0.4;
    pushNews(G.market, `${G.world.seed} pours first gold ON the study numbers. The market discovers respect.`, 'good');
  } else {
    const hit = (1 - ratio) * 0.9 + G.market.hypeDebt;
    G.market.sentiment -= hit;
    G.market.hypeDebt = 0;
    pushNews(G.market, `${G.world.seed} construction blows out — the studies flattered the ground. The market remembers every adjective.`, 'bad');
  }
  if (actual > 0) G.market.cash += actual * 0.3;
  G.dfs.built = true;
  tickDays(G.market, 8, mktRng);

  // Per-study reconciliation — name and shame (or praise).
  const recon: string[] = [];
  for (const s of STUDIES) {
    const r = G.studies[s.key]!;
    const tv = truth[s.key];
    const miss = s.key === 'permit' ? Math.abs(r.estimate - tv) >= 1.5 : Math.abs(r.estimate - tv) / tv > 0.1;
    if (miss) {
      recon.push(
        `${s.name} (${tierOf(r.tier).firm}): the report said "${describe(s.key, r.estimate)}" — the ground said "${describe(s.key, tv)}".`,
      );
    }
  }
  if (recon.length === 0) {
    recon.push('Every study held up under construction. Boring, in the best possible way — that is what paying for quality buys.');
  }
  if (G.studies.met && tierOf(G.studies.met.tier).key === 'cheap' && Math.abs(G.studies.met.estimate - truth.met) / truth.met > 0.1) {
    recon.push("Barry's met test work was, in hindsight, a guess with a letterhead.");
  }
  for (const p of penalties) recon.push(p.line);
  if (penalties.length === 0 && G.buildings.length > 0) {
    recon.push('Nothing you built stands where the pit wants to grow, and the creek runs clean. Textbook siting.');
  }

  const good = ratio >= 0.9;
  if (good) {
    sKaching();
  } else {
    sThud();
  }
  shake();
  const shareUrl = new URL(location.href);
  shareUrl.searchParams.set('seed', G.world.seed);
  shareUrl.searchParams.set('mode', G.market.diff.key);

  $('modal-content').innerHTML = `
    <h2 class="${good ? 'funded' : 'rejected'}">${good ? 'The mine works.' : 'The ground marks the homework.'}</h2>
    <div class="sub">${escapeHtml(G.world.companyName)} — ${escapeHtml(G.world.seed)} built and reconciled</div>
    <div class="kpis">
      <div class="kpi"><div class="k">Study said</div><div class="v">${fmtMoney(est)}</div></div>
      <div class="kpi"><div class="k">Ground delivered</div><div class="v ${actual >= est ? 'good' : 'bad'}">${fmtMoney(actual)}</div></div>
      <div class="kpi"><div class="k">Share price</div><div class="v ${G.market.price >= before ? 'good' : 'bad'}">${(before * 100).toFixed(1)}c → ${(G.market.price * 100).toFixed(1)}c</div></div>
      <div class="kpi"><div class="k">Market cap</div><div class="v gold">${fmtMoney(marketCap(G.market))}</div></div>
    </div>
    <div class="debrief">
      <div class="dt">Construction reconciliation</div>
      ${recon.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}
    </div>
    <div class="biz-card">
      <div class="bc-name">${escapeHtml(FIRM.gameName.toUpperCase())}</div>
      <div class="bc-tag">${escapeHtml(FIRM.tagline)}</div>
      <div class="bc-note">This bit is real. This game was built by a mining engineer who does feasibility for a living — <a href="${FIRM.url}" target="_blank" rel="noopener">${escapeHtml(FIRM.realName)}</a>. Talk to us before Barry does your met test work.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="btn-next-ten">New tenement — same company</button>
      <button class="btn" id="btn-copy-result">Copy result</button>
    </div>`;
  $('overlay').classList.remove('hidden');
  updateAll();
  saveGame();

  $('btn-next-ten').onclick = () => {
    G.tenements++;
    startGame(randomSeedName(Math.random()), G.market.diff, {
      market: G.market,
      tenements: G.tenements,
    });
  };
  $('btn-copy-result').onclick = () => {
    const text =
      `${G.world.companyName}: built the ${G.world.seed} gold mine — study said ${fmtMoney(est)}, ground delivered ${fmtMoney(actual)}. ` +
      `Market cap ${fmtMoney(marketCap(G.market))}. Same tenement, your call: ${shareUrl.toString()}`;
    navigator.clipboard.writeText(text).then(() => toast('Result copied — paste it anywhere.'));
  };
}

// ---------- HUD ----------

function updateAll(): void {
  (window as unknown as { __G: Game }).__G = G; // debug/playtest handle
  drawMap();
  drawSpark();
  const m = G.market;
  const t = resourceTotals(G.k);
  const p = pendingDeltas();

  $('co-name').textContent = G.world.companyName;
  $('co-ticker').textContent = G.world.ticker;
  $('stat-day').textContent = quarterLabel();
  $('stat-gold').textContent = `$${Math.round(m.goldPrice).toLocaleString()}`;
  $('stat-cash').textContent = fmtMoney(m.cash);
  $('stat-sent').textContent = sentimentWord(m.sentiment);
  const prev = m.history.length > 8 ? m.history[m.history.length - 8] : m.history[0];
  const chg = prev > 0 ? ((m.price - prev) / prev) * 100 : 0;
  $('stat-price').innerHTML =
    `${(m.price * 100).toFixed(1)}c <span class="${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(0)}%</span>`;
  $('stat-mcap').textContent = fmtMoney(marketCap(m));

  $('plan-chip').textContent =
    G.plan.length > 0
      ? `${G.plan.length}/${maxSlots()} rigs · ${fmtMoney(plannedCost())}`
      : `0/${maxSlots()} rigs`;
  $('plan-chip').classList.toggle('attn', G.plan.length > 0);

  if (t.total > 0) {
    $('res-oz').textContent = fmtOz(t.total);
    $<HTMLElement>('seg-m').style.width = `${(t.measured / t.total) * 100}%`;
    $<HTMLElement>('seg-i').style.width = `${(t.indicated / t.total) * 100}%`;
    $<HTMLElement>('seg-f').style.width = `${(t.inferred / t.total) * 100}%`;
    const share = Math.round(t.bankableShare * 100);
    $('res-mi').textContent = `${share}% confident`;
    $('res-pill').title =
      `Gold resource: ${fmtOz(t.total)} — ${fmtOz(t.measured)} Measured, ${fmtOz(t.indicated)} Indicated, ${fmtOz(t.inferred)} Inferred. ` +
      `Told the market about: ${fmtOz(m.announced.measured + m.announced.indicated + m.announced.inferred)}${p.total >= 2000 ? ` — ${fmtOz(p.total)} still in hand.` : '.'}`;
  } else {
    $('res-oz').textContent = '—';
    $('res-mi').textContent = '';
    $<HTMLElement>('seg-m').style.width = '0';
    $<HTMLElement>('seg-i').style.width = '0';
    $<HTMLElement>('seg-f').style.width = '0';
  }

  const feasBtn = $('btn-feas') as HTMLButtonElement;
  if (G.phase === 'explore') {
    const feas = feasibilityReady();
    feasBtn.textContent = 'Feasibility';
    feasBtn.disabled = !feas.ok;
    feasBtn.title = feas.text;
  } else if (!G.dfs.published) {
    const done = STUDIES.filter((s) => G.studies[s.key]?.done).length;
    feasBtn.textContent = `Publish Study (${done}/5)`;
    feasBtn.disabled = done < 5;
    feasBtn.title =
      done < 5
        ? 'The bank wants all five studies before you publish. Click the chips above the map.'
        : 'Publish the Feasibility Study — the biggest announcement a junior ever makes.';
  } else if (!G.dfs.built) {
    if (!G.buildMode) {
      feasBtn.textContent = 'Build the Mine ▶';
      feasBtn.disabled = false;
      feasBtn.title = 'Final investment decision. First: decide where everything goes.';
    } else if (G.buildings.length < BUILDINGS.length) {
      feasBtn.textContent = `Site your mine (${G.buildings.length}/3)`;
      feasBtn.disabled = true;
      feasBtn.title = 'Tap the map to place the Plant, Tailings Dam and Camp. Mind the pit outline.';
    } else {
      feasBtn.textContent = 'Pour First Gold ▶';
      feasBtn.disabled = false;
      feasBtn.title = 'Construction runs on the truth, not the report.';
    }
  } else {
    feasBtn.textContent = 'Mine built ✓';
    feasBtn.disabled = true;
    feasBtn.title = 'Done. Take the company to a new tenement.';
  }
  renderStudies();

  $('btn-findings').classList.toggle('findings-on', G.showFindings);

  $('ticker').innerHTML = m.news
    .slice(0, 8)
    .map((n) => `<span class="tk ${n.kind}"><b>${escapeHtml(quarterOf(n.day))}</b> ${escapeHtml(n.text)}</span>`)
    .join('<span class="tk-sep">•••</span>');

  if (G.buildMode) {
    $('tile-hint').textContent = `Site your mine: ${G.buildings.length}/3 placed. Tap the map.`;
  }
  pulseIfChanged('stat-price');
  pulseIfChanged('stat-mcap');
  pulseIfChanged('stat-cash');
  pulseIfChanged('res-oz');
}

function quarterOf(day: number): string {
  const q = Math.floor(day / 91);
  return `Q${(q % 4) + 1}'${String(26 + Math.floor(q / 4)).padStart(2, '0')}`;
}

function drawMap(): void {
  const hover = pendingTile ?? G.hover;
  const radius = pendingTile && previewTool !== null ? TOOLS[previewTool].radius : 0;
  // In build mode you see the pit you PREDICT; once built, the pit that WAS.
  const pit = G.buildMode
    ? { mask: estimatedPit(G.k), dug: false }
    : G.dfs.built
      ? { mask: truePit(G.world), dug: true }
      : null;
  render(mapCtx, G.world, G.k, G.showFindings, hover, radius, G.plan, G.buildings, pit, animTick);
}

function drawSpark(): void {
  const h = G.market.history;
  const w = sparkCanvas.width;
  const hh = sparkCanvas.height;
  sparkCtx.clearRect(0, 0, w, hh);
  if (h.length < 2) return;
  const win = h.slice(-200);
  const min = Math.min(...win);
  const max = Math.max(...win);
  const span = max - min || 1e-9;
  sparkCtx.beginPath();
  win.forEach((v, i) => {
    const x = (i / (win.length - 1)) * (w - 2) + 1;
    const y = hh - 3 - ((v - min) / span) * (hh - 8);
    if (i === 0) sparkCtx.moveTo(x, y);
    else sparkCtx.lineTo(x, y);
  });
  sparkCtx.strokeStyle = '#f0c040';
  sparkCtx.lineWidth = 1.5;
  sparkCtx.stroke();
  sparkCtx.lineTo(w - 1, hh);
  sparkCtx.lineTo(1, hh);
  sparkCtx.closePath();
  sparkCtx.fillStyle = 'rgba(212, 160, 24, 0.12)';
  sparkCtx.fill();
}

// ---------- Start modal ----------

function showStart(): void {
  const holder = $('diff-cards');
  holder.innerHTML = DIFFICULTIES.map(
    (d) => `
    <button class="diff-card" data-diff="${d.key}">
      <span class="diff-label">${d.label}</span>
      <span class="diff-blurb">${d.blurb}</span>
    </button>`,
  ).join('');
  holder.querySelectorAll<HTMLButtonElement>('.diff-card').forEach((b) => {
    b.onclick = () => {
      const diff = DIFFICULTIES.find((d) => d.key === b.dataset.diff)!;
      const input = ($('seed-input') as HTMLInputElement).value.trim().toUpperCase();
      startGame(input || urlSeed() || randomSeedName(Math.random()), diff);
    };
  });
  const us = urlSeed();
  if (us) ($('seed-input') as HTMLInputElement).value = us;
}

function urlSeed(): string {
  return (new URLSearchParams(location.search).get('seed') || '').trim().toUpperCase();
}

// ---------- Events ----------

mapCanvas.addEventListener('click', (ev) => {
  const wasOpen = pendingTile !== null;
  const prevTile = pendingTile;
  if (wasOpen) closeRadial();
  const p = pick(mapCanvas, ev, G.world);
  if (!p) {
    drawMap();
    return;
  }
  // In build mode, tapping anywhere on a placed building picks it up again.
  if (G.buildMode) {
    const hit = occupiedBy(G.buildings, p.x, p.y);
    if (hit) {
      G.buildings.splice(G.buildings.indexOf(hit), 1);
      toast(`${BUILDINGS.find((d) => d.key === hit.key)!.name} picked up — site it somewhere better.`);
      updateAll();
      saveGame();
      return;
    }
  }
  // Tap a flagged (planned) tile → cancel that program.
  const plannedIdx = G.plan.findIndex((a) => a.x === p.x && a.y === p.y);
  if (plannedIdx >= 0) {
    const cancelled = G.plan.splice(plannedIdx, 1)[0];
    toast(`${TOOLS[cancelled.tool].name} cancelled — rig freed up.`);
    updateAll();
    saveGame();
    return;
  }
  if (wasOpen && prevTile && prevTile.x === p.x && prevTile.y === p.y) {
    drawMap();
    return; // toggle off
  }
  openRadial(p.x, p.y);
});

mapCanvas.addEventListener('mousemove', (ev) => {
  if (pendingTile) return; // menu open — freeze hover
  const p = pick(mapCanvas, ev, G.world);
  const changed = p?.x !== G.hover?.x || p?.y !== G.hover?.y;
  G.hover = p;
  if (changed) {
    drawMap();
    if (p) {
      const t = G.world.tiles[idx(p.x, p.y)];
      const acc = terrainAccess(t.terrain);
      $('tile-hint').textContent = G.buildMode
        ? 'Tap to site a building here.'
        : (acc.note ?? 'Tap to plan a program here.');
    }
  }
});

mapCanvas.addEventListener('mouseleave', () => {
  if (pendingTile) return;
  G.hover = null;
  drawMap();
  $('tile-hint').textContent = 'Tap a tile — plan a program.';
});

document.addEventListener('click', (ev) => {
  if (!pendingTile) return;
  const target = ev.target as HTMLElement;
  if (target === mapCanvas || radial.contains(target)) return;
  closeRadial();
  drawMap();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && pendingTile) {
    closeRadial();
    drawMap();
  }
});

$('btn-findings').addEventListener('click', () => {
  G.showFindings = !G.showFindings;
  updateAll();
});

{
  const muteBtn = $('btn-mute');
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    muteBtn.textContent = toggleMute() ? '🔇' : '🔊';
  });
}

$('btn-raise2').addEventListener('click', () => doRaise(2_000_000));
$('btn-raise5').addEventListener('click', () => doRaise(5_000_000));
$('btn-run').addEventListener('click', runQuarter);
$('btn-feas').addEventListener('click', () => {
  if (G.phase === 'explore') enterFeasibility();
  else if (!G.dfs.published) showPublishModal();
  else if (!G.dfs.built) {
    if (!G.buildMode) enterBuildMode();
    else if (G.buildings.length >= BUILDINGS.length) showBuildModal();
  }
});
$('btn-challenge').addEventListener('click', () => {
  const u = new URL(location.href);
  u.searchParams.set('seed', G.world.seed);
  u.searchParams.set('mode', G.market.diff.key);
  navigator.clipboard.writeText(u.toString()).then(() => toast('Challenge link copied — same tenement, same market, their decisions.'));
});

// ---------- Boot ----------

if (!tryRestore()) showStart();

// Ambient animation: smoke, rigs, glints — ~11 fps via interval (rAF stalls
// in throttled/background contexts; browsers clamp intervals there anyway,
// which is exactly the behaviour we want for ambience).
window.setInterval(() => {
  animTick += 5;
  if (!document.hidden && G !== undefined) drawMap();
}, 90);
