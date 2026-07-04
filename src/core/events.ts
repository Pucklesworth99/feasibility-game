/**
 * Quarterly event cards — Reigns-style two-way dilemmas drawn at quarter end.
 * Chance, options, choices: small enough to read in five seconds, real enough
 * that anyone who's worked a field season winces.
 */

import { Rng } from './rng';

export interface EventChoice {
  label: string;
  outcome: string; // shown after picking
  cash?: number; // + / − dollars
  sentiment?: number;
  hypeDebt?: number;
  slotPenalty?: number; // rigs lost NEXT quarter
}

export interface QuarterEvent {
  title: string;
  text: string;
  choices: EventChoice[]; // 1 choice = no real decision, just an "OK"
}

export const EVENTS: QuarterEvent[] = [
  {
    title: 'RIG BREAKDOWN',
    text: 'Your drill rig throws a rod through the mast. The driller shrugs: "She\'s cooked, boss."',
    choices: [
      {
        label: 'Fly parts in — pay $120k',
        outcome: 'Parts arrive on the red-eye. Expensive, but the rigs keep turning.',
        cash: -120_000,
      },
      {
        label: 'Wait for the slow fix',
        outcome: 'One rig sits idle next quarter while the part comes by road train.',
        slotPenalty: 1,
      },
    ],
  },
  {
    title: 'FARM-IN OFFER',
    text: 'A mid-tier miner offers $2.0M cash for a 25% slice of the project. Their geologist looked at your maps for a suspiciously long time.',
    choices: [
      {
        label: 'Take the money',
        outcome: 'Cash lands. Some shareholders mutter you sold the good bit cheap.',
        cash: 2_000_000,
        sentiment: -0.03,
      },
      {
        label: 'Politely decline',
        outcome: 'Word gets around that a mid-tier wanted in. The market likes confidence.',
        sentiment: 0.05,
      },
    ],
  },
  {
    title: 'UNSEASONAL RAIN',
    text: 'It rains like it owes someone money. The access track is now a river with opinions.',
    choices: [
      {
        label: 'Hire tracked gear — $90k',
        outcome: 'The bog-mats and swamp-dozer keep the season alive.',
        cash: -90_000,
      },
      {
        label: 'Wait for it to dry out',
        outcome: 'One rig slot lost next quarter. The frogs are thriving, at least.',
        slotPenalty: 1,
      },
    ],
  },
  {
    title: 'NEAROLOGY',
    text: "The explorer next door hits visible gold. Their share price triples. Your tenement shares a fence line — and that's about all.",
    choices: [
      {
        label: 'Pump the postcode in an investor deck',
        outcome: '"Strategically located in a proven gold corridor." The market inhales; the adjectives go on your tab.',
        sentiment: 0.07,
        hypeDebt: 0.06,
      },
      {
        label: 'Stay classy',
        outcome: 'You say nothing. A fund manager notices the restraint and files it away favourably.',
        sentiment: 0.02,
      },
    ],
  },
  {
    title: 'TAKEOVER WHISPERS',
    text: 'An AFR column mentions your company in the same sentence as "corporate interest". No one calls. The stock does not care about details.',
    choices: [
      {
        label: 'No comment',
        outcome: 'The whisper does its work regardless.',
        sentiment: 0.06,
      },
    ],
  },
  {
    title: 'THE LAB QUEUE',
    text: 'The assay lab is six weeks behind — every junior in the state drilled the same quarter you did.',
    choices: [
      {
        label: 'Pay the priority fee — $60k',
        outcome: 'Your samples jump the queue. The lab manager now knows your first name.',
        cash: -60_000,
      },
      {
        label: 'Join the queue',
        outcome: 'Results crawl in. The market hates a quiet company.',
        sentiment: -0.04,
      },
    ],
  },
];

/** Draw an event with probability p, deterministically from the shared RNG. */
export function drawEvent(rng: Rng, p: number): QuarterEvent | null {
  if (rng.next() >= p) return null;
  return EVENTS[rng.int(0, EVENTS.length - 1)];
}
