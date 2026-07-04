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
