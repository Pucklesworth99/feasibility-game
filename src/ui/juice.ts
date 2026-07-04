/**
 * Juice — tiny synthesized sounds (WebAudio, zero assets), screen shake and
 * stat pulses. All sounds fire on user gestures, so autoplay policy is happy.
 */

let actx: AudioContext | null = null;
let muted = localStorage.getItem('feasibility-muted') === '1';

function ac(): AudioContext {
  actx = actx ?? new AudioContext();
  return actx;
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
  if (muted) return;
  try {
    const c = ac();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime + at);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
    o.connect(g).connect(c.destination);
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
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  } catch {
    /* no audio — fine */
  }
}

/** Rig slams onto the pad. */
export function sSlam(): void {
  tone(85, 0, 0.13, 'square', 0.09);
  noiseBurst(0.09, 0.05, 180);
}

/** The rods turning — rattly, industrial. */
export function sRattle(): void {
  noiseBurst(0.55, 0.045, 300);
  for (let i = 0; i < 6; i++) tone(140 + (i % 2) * 40, i * 0.09, 0.05, 'sawtooth', 0.02);
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
