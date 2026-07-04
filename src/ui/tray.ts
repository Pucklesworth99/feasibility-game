/**
 * The Core Tray — the hero moment (GAME-DESIGN-v4 §3, Gate 1).
 * A tray of six core segments slides up and flips left to right like a slot
 * reel. DOM + CSS so the animation is cheap and crisp; the map stays canvas.
 * Also home to the grade stamp, floating texts and the nugget particles.
 */

export type Segment = 'rock' | 'rock2' | 'gold' | 'fleck';

const FLIP_MS = 95;

let trayEl: HTMLElement | null = null;
let hideTimer = 0;

function tray(): HTMLElement {
  if (!trayEl) {
    trayEl = document.createElement('div');
    trayEl.id = 'tray';
    trayEl.className = 'tray hidden';
    document.body.appendChild(trayEl);
  }
  return trayEl;
}

export interface TrayCallbacks {
  onTick: () => void;
  onGold: () => void;
  onDone: () => void;
}

/** Slide the tray up and flip the segments. Calls onDone after the reveal. */
export function showTray(segs: Segment[], cb: TrayCallbacks): void {
  const el = tray();
  window.clearTimeout(hideTimer);
  el.innerHTML =
    `<div class="tray-label">CORE</div>` +
    segs.map(() => `<div class="core-seg"></div>`).join('');
  el.classList.remove('hidden', 'tray-gold');

  const segEls = [...el.querySelectorAll<HTMLElement>('.core-seg')];
  let sawGold = false;
  segs.forEach((s, i) => {
    window.setTimeout(() => {
      const seg = segEls[i];
      seg.classList.add(`seg-${s}`, 'revealed');
      cb.onTick();
      if (s === 'gold') {
        sawGold = true;
        el.classList.add('tray-gold');
        cb.onGold();
      }
      if (i === segs.length - 1) {
        window.setTimeout(cb.onDone, 140);
        hideTimer = window.setTimeout(() => el.classList.add('hidden'), sawGold ? 1600 : 1000);
      }
    }, 160 + i * FLIP_MS);
  });
}

/** Big grade stamp that slams into the middle of the screen. */
export function gradeStamp(text: string, grade: number): void {
  const el = document.createElement('div');
  el.className = 'stamp';
  el.textContent = text;
  el.style.fontSize = `${Math.min(76, 34 + grade * 6)}px`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1300);
}

/** Small text that floats up and fades from a page position. */
export function floatText(text: string, x: number, y: number, cls = ''): void {
  const el = document.createElement('div');
  el.className = `float-text ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1500);
}

/** Gold nuggets arc from a page position into a target element. */
export function flyNuggets(fromX: number, fromY: number, target: HTMLElement, count: number): void {
  const rect = target.getBoundingClientRect();
  const toX = rect.left + rect.width / 2;
  const toY = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const n = document.createElement('div');
    n.className = 'nugget';
    n.style.left = `${fromX}px`;
    n.style.top = `${fromY}px`;
    document.body.appendChild(n);
    const dx = toX - fromX + (Math.random() - 0.5) * 30;
    const dy = toY - fromY;
    const arcX = dx * (0.3 + Math.random() * 0.25);
    const arcLift = -60 - Math.random() * 70;
    n.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${arcX}px, ${arcLift}px) scale(1.15)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0.9 },
      ],
      { duration: 520 + Math.random() * 260, delay: i * 34, easing: 'cubic-bezier(.3,.7,.5,1)', fill: 'forwards' },
    ).onfinish = () => {
      n.remove();
      target.classList.remove('pulse');
      void target.offsetWidth;
      target.classList.add('pulse');
    };
  }
}
