/**
 * The feasibility phase — five studies, three tiers of consultant, and a
 * project truth that doesn't care what the report said. Study estimates feed
 * the published NPV; construction runs on the truth; the gap is the lesson
 * (and the punchline — see branding.ts).
 */

import { Rng } from './rng';
import { FIRM } from './branding';

export type StudyKey = 'met' | 'geo' | 'water' | 'permit' | 'mining';

export interface StudyDef {
  key: StudyKey;
  name: string;
  short: string;
  desc: string;
}

export const STUDIES: StudyDef[] = [
  {
    key: 'met',
    name: 'Metallurgy',
    short: 'MET',
    desc: 'How much of the gold actually comes out of the rock. The number everything else leans on.',
  },
  {
    key: 'geo',
    name: 'Ground Conditions',
    short: 'GEO',
    desc: 'Will the pit walls stand up, or will you be mining the same rock twice? (Real term: geotechnical study.)',
  },
  {
    key: 'water',
    name: 'Water',
    short: 'WATER',
    desc: 'Too little and the plant stops. Too much and the pit is a swimming pool. Both cost money.',
  },
  {
    key: 'permit',
    name: 'Approvals',
    short: 'PERMIT',
    desc: 'Environment, heritage, licences. How long the paperwork takes before you can turn a sod.',
  },
  {
    key: 'mining',
    name: 'Mining Plan',
    short: 'MINING',
    desc: 'The plan for actually digging it: fleet, schedule, cost per tonne. Where optimism goes to be audited.',
  },
];

export interface ConsultantTier {
  key: 'cheap' | 'standard' | 'good';
  firm: string;
  cost: number;
  errScale: number; // relative error on the estimate
  reworkChance: number; // study bounced by the bank's independent engineer
  blurb: string;
}

export const CONSULTANTS: ConsultantTier[] = [
  {
    key: 'cheap',
    firm: "Barry's Technical Services",
    cost: 150_000,
    errScale: 0.18,
    reworkChance: 0.35,
    blurb: 'A bloke from the pub with a spreadsheet. Cheap, fast, and his numbers are a vibe. The bank may laugh.',
  },
  {
    key: 'standard',
    firm: 'Standard Consulting Group',
    cost: 400_000,
    errScale: 0.07,
    reworkChance: 0.1,
    blurb: 'Perfectly fine. Competent, forgettable, mid. Their reports weigh 400 pages and say "it depends".',
  },
  {
    key: 'good',
    firm: FIRM.gameName,
    cost: 800_000,
    errScale: 0.02,
    reworkChance: 0.02,
    blurb: 'Dear — and worth it. Numbers that hold, fatal flaws caught early, and the bank nods when they see the letterhead.',
  },
];

export function tierOf(key: ConsultantTier['key']): ConsultantTier {
  return CONSULTANTS.find((c) => c.key === key)!;
}

/** The project's hidden truth — what construction will actually find. */
export interface ProjectTruth {
  met: number; // recovery fraction
  geo: number; // cost factor
  water: number; // cost factor
  permit: number; // quarters of approval delay
  mining: number; // cost factor
}

export function generateTruth(seed: string): ProjectTruth {
  const rng = new Rng(seed + ':truth');
  return {
    met: rng.range(0.72, 0.95),
    geo: rng.range(0.92, 1.3),
    water: rng.range(0.92, 1.35),
    permit: rng.int(0, 3),
    mining: rng.range(0.92, 1.28),
  };
}

export interface StudyResult {
  study: StudyKey;
  tier: ConsultantTier['key'];
  estimate: number;
  done: boolean; // false = bounced, must re-commission
}

export function runStudy(
  truth: ProjectTruth,
  key: StudyKey,
  tier: ConsultantTier['key'],
  rng: Rng,
): StudyResult {
  const t = tierOf(tier);
  if (rng.next() < t.reworkChance) {
    return { study: key, tier, estimate: 0, done: false };
  }
  const trueVal = truth[key];
  let est = trueVal * (1 + rng.gauss() * t.errScale);
  if (key === 'met') est = Math.min(0.97, Math.max(0.5, est));
  if (key === 'permit') est = Math.max(0, Math.round(trueVal + rng.gauss() * t.errScale * 5));
  return { study: key, tier, estimate: est, done: true };
}

/** Plain-English reading of a study estimate. */
export function describe(key: StudyKey, v: number): string {
  switch (key) {
    case 'met':
      return `${Math.round(v * 100)}% of the gold recoverable`;
    case 'permit':
      return v <= 0 ? 'approvals: no delays expected' : `approvals: ~${Math.round(v)} quarter${v >= 2 ? 's' : ''} of delay`;
    case 'geo':
    case 'water':
    case 'mining': {
      const label = key === 'geo' ? 'ground conditions' : key === 'water' ? 'water situation' : 'mining costs';
      if (v < 1.02) return `${label}: better than feared`;
      if (v < 1.15) return `${label}: manageable`;
      return `${label}: expensive`;
    }
  }
}

/**
 * Project NPV from resource + parameter set (estimates OR truth).
 * mi/inf in ounces. Inferred counts half — nobody banks extrapolation.
 */
export function projectNPV(
  mi: number,
  inf: number,
  p: ProjectTruth,
  goldPrice: number,
): number {
  const oz = (mi + 0.5 * inf) * 0.93; // mining recovery of the resource
  const revenue = oz * goldPrice * p.met;
  const opex = oz * 1150 * p.geo * p.water * p.mining;
  const capex = 6.0e7 + oz * 260;
  const npv = (revenue - opex) * 0.8 - capex;
  return npv / (1 + 0.09 * p.permit);
}
