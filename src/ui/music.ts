/**
 * MUSIC — procedural outback-lofi, zero assets, pure WebAudio.
 *
 * Design (stolen shamelessly from the greats):
 *  • Balatro: never too loud, hypnotic, and the groove THICKENS + speeds up as
 *    the run rages — the crescendo is baked into the audio.
 *  • Vertical layering: a drone bed, a bassline, a pentatonic pluck melody and a
 *    soft kit, each faded in/out by game intensity — no stops, no seams.
 *  • A minor pentatonic (A C D E G) so any note against any note is consonant —
 *    essential for procedural melody that never sours.
 *
 * Scheduling uses the standard lookahead pattern (setInterval wakes ~every 25ms,
 * schedules notes up to 120ms ahead on the sample-accurate audio clock).
 */

import { audioContext, isMuted, masterBus, onMuteChange } from './juice';

// A minor pentatonic across a couple of octaves (Hz).
const SCALE = [
  110.0, 130.81, 146.83, 164.81, 196.0, // A2 C3 D3 E3 G3
  220.0, 261.63, 293.66, 329.63, 392.0, // A3 C4 D4 E4 G4
  440.0, 523.25, 587.33, 659.25, 783.99, // A4 C5 D5 E5 G5
];

const STEPS = 16;

interface Layer {
  gain: GainNode;
  target: number; // where the gain is heading (vertical layering)
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let layers: Record<string, Layer> = {};
let windSrc: AudioBufferSourceNode | null = null;
let timer = 0;
let step = 0;
let nextNoteTime = 0;
let intensity = 0; // 0..1 — how alive the mine is
let started = false;

// Deterministic-ish melodic phrases (indices into SCALE) — pentatonic, so any
// sequence lands. Sparse ones for exploring, busier ones as things heat up.
const PHRASES = [
  [10, -1, 12, -1, 11, -1, 8, -1, 10, -1, -1, 8, 6, -1, 8, -1],
  [12, -1, 11, 10, -1, 8, -1, 10, 11, -1, 12, -1, 14, -1, 12, -1],
  [8, -1, 10, -1, 6, -1, 8, -1, 5, -1, 8, -1, 10, -1, 11, -1],
];
let phrase = PHRASES[0];

function bpm(): number {
  return 82 + intensity * 22; // laid-back → driving as the mine rages
}

function stepDur(): number {
  return 60 / bpm() / 2; // eighth notes
}

function mkLayer(g: number): Layer {
  const gain = ctx!.createGain();
  gain.gain.value = 0;
  gain.connect(master!);
  return { gain, target: g };
}

/** Boot the engine on the first user gesture (context is already live by then). */
export function startMusic(): void {
  if (started) return;
  started = true;
  ctx = audioContext();
  master = ctx.createGain();
  master.gain.value = isMuted() ? 0 : 0.5;
  master.connect(masterBus());
  onMuteChange((m) => {
    if (master) master.gain.linearRampToValueAtTime(m ? 0 : 0.5, ctx!.currentTime + 0.15);
  });

  layers = {
    pad: mkLayer(0.10),
    bass: mkLayer(0.16),
    mel: mkLayer(0.09),
    perc: mkLayer(0.12),
  };

  startWind();
  nextNoteTime = ctx.currentTime + 0.1;
  timer = window.setInterval(scheduler, 25);
}

/** 0 = title/early explore … 1 = the mine in full roar. */
export function setMusicIntensity(x: number): void {
  intensity = Math.max(0, Math.min(1, x));
}

/** A short triumphant lift for the montage, then settle. */
export function musicSwell(): void {
  setMusicIntensity(1);
  window.setTimeout(() => setMusicIntensity(0.4), 4000);
}

/** Stop everything (unused today; keeps the scheduler handle honest). */
export function stopMusic(): void {
  window.clearInterval(timer);
  windSrc?.stop();
  started = false;
}

function startWind(): void {
  if (!ctx) return;
  // Brown-ish noise through a low bandpass = a dry outback wind bed.
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 4;
  }
  windSrc = ctx.createBufferSource();
  windSrc.buffer = buf;
  windSrc.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; // a soft hush, not a bandpass whistle
  f.frequency.value = 240;
  f.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.value = 0.05; // barely-there breath under the music
  windSrc.connect(f).connect(g).connect(master!);
  windSrc.start();
}

function scheduler(): void {
  if (!ctx) return;
  // Ease every layer toward its intensity-driven target (vertical layering).
  const t = ctx.currentTime;
  layers.pad.gain.gain.setTargetAtTime(0.10, t, 0.4); // pad always breathes
  layers.bass.gain.gain.setTargetAtTime(intensity > 0.25 ? 0.16 : 0, t, 0.5);
  layers.mel.gain.gain.setTargetAtTime(intensity > 0.12 ? 0.06 + intensity * 0.05 : 0.02, t, 0.5);
  layers.perc.gain.gain.setTargetAtTime(intensity > 0.55 ? 0.10 : 0, t, 0.5);

  while (nextNoteTime < t + 0.12) {
    playStep(step, nextNoteTime);
    nextNoteTime += stepDur();
    step = (step + 1) % STEPS;
    if (step === 0 && Math.random() < 0.5) {
      // Pick a new phrase per loop, weighted busier as intensity climbs.
      const pool = intensity > 0.5 ? PHRASES : PHRASES.slice(0, 2);
      phrase = pool[Math.floor(Math.random() * pool.length)];
    }
  }
}

function playStep(s: number, at: number): void {
  if (!ctx) return;
  // PAD — a slow evolving drone on the root + fifth, retriggered each bar.
  if (s === 0) {
    voice(SCALE[0], at, 3.6, 'sine', layers.pad.gain, 0.5, 1.2);
    voice(SCALE[3], at, 3.6, 'sine', layers.pad.gain, 0.5, 1.2); // E, the fifth
  }
  // BASS — root/anchor notes walking the beat.
  if (s % 4 === 0) {
    const n = s === 8 ? SCALE[2] : SCALE[0]; // A … D … A …
    voice(n, at, 0.42, 'triangle', layers.bass.gain, 0.008, 0.14);
  }
  // MELODY — the pentatonic pluck; phrase decides the note.
  const idx = phrase[s];
  if (idx >= 0) {
    voice(SCALE[idx], at, 0.28, 'square', layers.mel.gain, 0.004, 0.1);
  }
  // PERC — soft noise hat on offbeats, a body kick on the one.
  if (s % 2 === 1) hat(at, 0.02);
  if (s % 8 === 0) kick(at);
}

function voice(
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType,
  dest: GainNode,
  attack: number,
  release: number,
): void {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.9, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + release);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + dur + release + 0.05);
}

function hat(at: number, gain: number): void {
  const len = ctx!.sampleRate * 0.04;
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  const f = ctx!.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx!.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(layers.perc.gain);
  src.start(at);
}

function kick(at: number): void {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.frequency.setValueAtTime(120, at);
  o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  g.gain.setValueAtTime(0.5, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  o.connect(g).connect(layers.perc.gain);
  o.start(at);
  o.stop(at + 0.2);
}
