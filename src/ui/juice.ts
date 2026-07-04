/**
 * Juice — tiny synthesized sounds (WebAudio, zero assets), screen shake and
 * stat pulses. All sounds fire on user gestures, so autoplay policy is happy.
 */

let actx: AudioContext | null = null;
let bus: GainNode | null = null;
let muted = localStorage.getItem('feasibility-muted') === '1';

/** Master bus → compressor → out. Tap-spam stacks politely instead of clipping. */
function ac(): AudioContext {
  if (!actx) {
    actx = new AudioContext();
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.connect(actx.destination);
    bus = actx.createGain();
    bus.gain.value = 0.9;
    bus.connect(comp);
  }
  return actx;
}

function out(): AudioNode {
  ac();
  return bus!;
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem('feasibility-muted', muted ? '1' : '0');
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.07): void {
  if (muted || !Number.isFinite(freq)) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + at);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
    o.connect(g).connect(out());
    o.start(c.currentTime + at);
    o.stop(c.currentTime + at + dur + 0.05);
  } catch {
    /* no audio available — fine */
  }
}

/** Discovery chime — something glinted in the assays. */
export function sDing(): void {
  tone(660, 0, 0.14, 'sine');
  tone(990, 0.1, 0.22, 'sine');
}

/** Money noise — the market smiles. */
export function sKaching(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.055, 0.13, 'triangle', 0.06));
}

/** Bad news — money down the hole. */
export function sThud(): void {
  tone(150, 0, 0.22, 'sawtooth', 0.05);
  tone(95, 0.08, 0.3, 'sawtooth', 0.05);
}

/** UI tick. */
export function sClick(): void {
  tone(880, 0, 0.045, 'square', 0.025);
}

/** Filtered noise burst — the workhorse of drill sounds. */
function noiseBurst(dur: number, gain: number, freq: number): void {
  if (muted) return;
  try {
    const c = ac();
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f).connect(g).connect(out());
    src.start();
  } catch {
    /* no audio — fine */
  }
}

// Looped drill noise: starts with the rods, stops when the core comes up —
// no more rigs drilling in silence for the last 250ms of every hole.
let drill: { src: AudioBufferSourceNode; g: GainNode } | null = null;

export function sDrillStart(): void {
  if (muted || drill) return;
  try {
    const c = ac();
    const len = Math.floor(c.sampleRate * 0.4);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.sin(i / 90));
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 310;
    f.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.06);
    src.connect(f).connect(g).connect(out());
    src.start();
    drill = { src, g };
  } catch {
    /* fine */
  }
}

export function sDrillStop(): void {
  if (!drill) return;
  try {
    const c = ac();
    drill.g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
    drill.src.stop(c.currentTime + 0.12);
  } catch {
    /* fine */
  }
  drill = null;
}

/** THE pour — reserved for gold coming out of the plant. Nothing else. */
export function sPour(): void {
  tone(92, 0, 0.22, 'square', 0.07);
  [660, 830, 990, 1320, 1660].forEach((f, i) => tone(f, 0.05 + i * 0.05, 0.14, 'triangle', 0.055));
  tone(1980, 0.34, 0.4, 'sine', 0.045);
}

/** Rig slams onto the pad. */
export function sSlam(): void {
  tone(85, 0, 0.13, 'square', 0.09);
  noiseBurst(0.09, 0.05, 180);
}

/** Run-end resolve chord. Major for triumph; minor when the market did the
 *  subtraction — the montage shouldn't sound proud of a ledger crash. */
export function sFanfare(minor = false): void {
  const notes = minor ? [392, 466, 587, 698] : [392, 523, 659, 784];
  tone(196, 0, 0.6, 'sine', 0.05);
  notes.forEach((f, i) => tone(f, i * 0.09, i === 3 ? 0.55 : 0.32, 'triangle', i === 3 ? 0.065 : 0.055));
}

/** Core-tray segment flip. */
export function sTick(): void {
  tone(1150, 0, 0.03, 'square', 0.02);
}

/** Gold sting — pitch and length scale with grade. */
export function sSting(grade: number): void {
  const base = 480 + Math.min(8, grade) * 70;
  [1, 1.26, 1.5].forEach((m, i) => tone(base * m, i * 0.07, 0.16, 'triangle', 0.07));
  if (grade > 4.5) tone(base * 2, 0.24, 0.3, 'sine', 0.06);
}

/** Shake the whole app for a beat. */
export function shake(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.remove('shake');
  void app.offsetWidth; // restart the animation
  app.classList.add('shake');
  window.setTimeout(() => app.classList.remove('shake'), 500);
}

const prevText = new Map<string, string>();

/** Pulse an element when its text changed since last check. */
export function pulseIfChanged(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const now = el.textContent ?? '';
  const before = prevText.get(id);
  prevText.set(id, now);
  if (before !== undefined && before !== now) {
    el.classList.remove('pulse');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('pulse');
  }
}
