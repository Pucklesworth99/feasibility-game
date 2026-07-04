/**
 * Economics + the go/no-go verdict.
 *
 * Deliberately simple under the hood for the prototype, but honest in shape:
 * lenders gate on classification mix, the mine runs on the TRUTH inside the
 * classified envelope, and the gap between estimate and reality is where the
 * player's drilling decisions come home to roost — which feeds the debrief.
 */

import { CELL_TONNES, CUTOFF, Deposit, GRID_H, GRID_W } from './deposit';
import { Cls, Estimate } from './estimate';

// Prototype price deck & cost model (tune freely — data-driven later).
export const GOLD_PRICE = 3000; // US$/oz
const RECOVERY = 0.92;
const MINING_LOSS = 0.95; // dilution / ore loss on the truth field
const OPEX_PER_T = 55;
const CAPEX_FIXED = 140e6;
const CAPEX_PER_T = 22; // scales with tonnage
const DISCOUNT_FACTOR = 0.78; // stand-in for time-discounting the cashflows

// Financing gate.
const MIN_BANKABLE_SHARE = 0.6; // ≥60 % of ounces Measured+Indicated
const MIN_OUNCES = 150_000;

export interface Verdict {
  funded: boolean;
  reasons: string[];
  estNPV: number;
}

export interface Outcome {
  estOz: number;
  actualOz: number;
  actualTonnes: number;
  actualGrade: number;
  actualNPV: number;
  missedOz: number; // ounces left undiscovered outside the envelope
  surpriseFactor: number; // actual/est ounces inside envelope
  debrief: string[];
}

function npvOf(tonnes: number, oz: number): number {
  const revenue = oz * RECOVERY * GOLD_PRICE;
  const opex = tonnes * OPEX_PER_T;
  const capex = CAPEX_FIXED + tonnes * CAPEX_PER_T;
  return (revenue - opex) * DISCOUNT_FACTOR - capex;
}

export function assessFinancing(est: Estimate): Verdict {
  const reasons: string[] = [];
  const estNPV = npvOf(est.totalTonnes, est.totalOz);

  if (est.totalOz === 0) {
    reasons.push(
      'No defined Mineral Resource. Without drilling data this is an Exploration Target — lenders can\'t book it.',
    );
    return { funded: false, reasons, estNPV: 0 };
  }
  if (est.totalOz < MIN_OUNCES) {
    reasons.push(
      `Resource too small: ${fmtOz(est.totalOz)} defined, lenders want ≥ ${fmtOz(MIN_OUNCES)}. Keep drilling — or accept this one isn't a mine.`,
    );
  }
  if (est.bankableShare < MIN_BANKABLE_SHARE) {
    reasons.push(
      `Only ${Math.round(est.bankableShare * 100)}% of ounces are Measured+Indicated (need ≥ ${MIN_BANKABLE_SHARE * 100}%). Too much Inferred — banks don't lend against extrapolation.`,
    );
  }
  if (estNPV <= 0) {
    reasons.push(
      `Projected NPV is negative (${fmtMoney(estNPV)}). The orebody you've defined doesn't pay for its own mine.`,
    );
  }

  return { funded: reasons.length === 0, reasons, estNPV };
}

export function simulateOutcome(
  dep: Deposit,
  est: Estimate,
  explorationSpent: number,
): Outcome {
  // The mine plan follows the ESTIMATE, but the ground delivers the TRUTH.
  let actualOz = 0;
  let actualTonnes = 0;
  for (let i = 0; i < est.cls.length; i++) {
    if (est.cls[i] !== Cls.None) {
      const g = dep.grade[i];
      actualTonnes += CELL_TONNES;
      if (g >= CUTOFF) actualOz += (g * CELL_TONNES) / 31.1035;
    }
  }
  actualOz *= MINING_LOSS;

  const actualNPV = npvOf(actualTonnes, actualOz) - explorationSpent;
  const missedOz = Math.max(0, dep.totalOz - actualOz / MINING_LOSS);
  const surpriseFactor = est.totalOz > 0 ? actualOz / est.totalOz : 0;

  return {
    estOz: est.totalOz,
    actualOz,
    actualTonnes,
    actualGrade: actualTonnes > 0 ? (actualOz * 31.1035) / actualTonnes : 0,
    actualNPV,
    missedOz,
    surpriseFactor,
    debrief: [], // filled by buildDebrief
  };
}

/** Rule-based consultant's debrief — reads the whole run, writes the review. */
export function buildDebrief(
  dep: Deposit,
  est: Estimate,
  outcome: Outcome,
  holes: number[],
  explorationSpent: number,
): string[] {
  const lines: string[] = [];

  // Estimation accuracy.
  const err = outcome.surpriseFactor;
  if (est.totalOz > 0) {
    if (err >= 0.9 && err <= 1.1) {
      lines.push(
        `Your resource estimate landed within ${Math.round(Math.abs(1 - err) * 100)}% of what the ground delivered. That's tight estimation — your drill spacing matched this orebody's continuity.`,
      );
    } else if (err < 0.9) {
      lines.push(
        `The mine reconciled ${Math.round((1 - err) * 100)}% BELOW your estimate. Your spacing was too wide for this deposit's grade continuity — the interpolation flattered the gaps between holes.`,
      );
    } else {
      lines.push(
        `The ground over-delivered by ${Math.round((err - 1) * 100)}%. Lucky — but an estimate that wrong in the other direction sinks projects. Tighter infill would have caught it.`,
      );
    }
  }

  // Barren holes.
  const wasteHoles = holes.filter((h) => {
    let oreCells = 0;
    for (let y = 0; y < GRID_H; y++) {
      if (dep.grade[y * GRID_W + h] >= CUTOFF) oreCells++;
    }
    return oreCells < 3;
  }).length;
  if (holes.length > 0 && wasteHoles / holes.length > 0.35) {
    lines.push(
      `${wasteHoles} of ${holes.length} holes hit effectively nothing. That's exploration budget spent confirming barren ground — targeting work up front (geophysics, mapping) pays for itself.`,
    );
  }

  // Missed mineralization.
  if (outcome.missedOz > 50_000) {
    lines.push(
      `You left ~${fmtOz(outcome.missedOz)} in the ground undiscovered. There was more to this system than your drilling defined — step-out holes on the fringes would have found it.`,
    );
  } else if (outcome.missedOz < 20_000 && dep.totalOz > 100_000) {
    lines.push(
      'You defined nearly everything the system held. Thorough coverage — nothing material left behind.',
    );
  }

  // Spend discipline.
  if (explorationSpent > 0 && outcome.actualNPV > 0) {
    const ratio = outcome.actualNPV / explorationSpent;
    if (ratio > 80) {
      lines.push(
        `Every exploration dollar returned ~$${Math.round(ratio)} of project value. That's the whole point of staged feasibility spending — you de-risked exactly as much as the decision required.`,
      );
    }
  }

  if (lines.length === 0) {
    lines.push('A clean, unremarkable campaign. In this business, unremarkable is a compliment.');
  }

  return lines;
}

export function fmtMoney(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmtOz(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}Moz`;
  return `${Math.round(v / 1000)}koz`;
}

export function fmtTonnes(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}Mt`;
  return `${Math.round(v / 1000)}kt`;
}
