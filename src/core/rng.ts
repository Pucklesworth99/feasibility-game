/**
 * Deterministic RNG core. Everything in the game world derives from a seed
 * string through here — same seed, same world, on every device, forever.
 * No Math.random() anywhere in core/.
 */

/** xmur3 string hash → 32-bit state generator. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG — fast, small, good enough distribution for game gen. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next01: () => number;

  constructor(seed: string) {
    const h = xmur3(seed);
    this.next01 = mulberry32(h());
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.next01();
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next01();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next01() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Approximate gaussian (mean 0, sd 1) via sum of uniforms. */
  gauss(): number {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.next01();
    return (s - 3) / Math.sqrt(0.5);
  }
}

/**
 * Smooth 2D value noise in [0, 1]: random lattice + bilinear interpolation
 * with smoothstep. `freq` is lattice cells per grid unit (smaller = smoother).
 */
export class ValueNoise2D {
  private lattice: Float32Array;
  private lw: number;
  private lh: number;

  constructor(rng: Rng, gridW: number, gridH: number, private freq: number) {
    this.lw = Math.ceil(gridW * freq) + 2;
    this.lh = Math.ceil(gridH * freq) + 2;
    this.lattice = new Float32Array(this.lw * this.lh);
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng.next();
  }

  at(x: number, y: number): number {
    const fx = x * this.freq;
    const fy = y * this.freq;
    // Clamp to the lattice so out-of-range samples stay finite.
    const x0 = Math.max(0, Math.min(this.lw - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(this.lh - 2, Math.floor(fy)));
    const tx = smooth(Math.max(0, Math.min(1, fx - x0)));
    const ty = smooth(Math.max(0, Math.min(1, fy - y0)));
    const l = this.lattice;
    const w = this.lw;
    const a = l[y0 * w + x0];
    const b = l[y0 * w + x0 + 1];
    const c = l[(y0 + 1) * w + x0];
    const d = l[(y0 + 1) * w + x0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
