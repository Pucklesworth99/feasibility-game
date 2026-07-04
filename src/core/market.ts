/**
 * The market — your listed junior's share price, sentiment, news flow and
 * capital raising. The price anchors to fundamentals (cash + ANNOUNCED risked
 * ounces) and swings on sentiment. The market only values what you announce;
 * promotional announcements pump sentiment now and store "hype debt" that
 * amplifies the re-rate when reality disappoints. Market cap is the score.
 */

import { Rng } from './rng';

export interface Difficulty {
  key: 'boom' | 'tight' | 'realistic';
  label: string;
  blurb: string;
  cash: number;
  baseDiscount: number; // placement discount floor
  sentimentDecay: number; // per day
  goldDrift: number; // per day
  newsChance: number; // per day
}

export const DIFFICULTIES: Difficulty[] = [
  {
    key: 'boom',
    label: 'Boom market',
    blurb: 'Gold is running, money is easy, everyone is a geologist. $8.0M in the bank.',
    cash: 8_000_000,
    baseDiscount: 0.1,
    sentimentDecay: 0.015,
    goldDrift: 0.0005,
    newsChance: 0.02,
  },
  {
    key: 'tight',
    label: 'Tight market',
    blurb: 'Raises are hard and brokers stopped calling back. $4.0M in the bank.',
    cash: 4_000_000,
    baseDiscount: 0.16,
    sentimentDecay: 0.025,
    goldDrift: 0.0,
    newsChance: 0.03,
  },
  {
    key: 'realistic',
    label: 'Realistic',
    blurb: 'The hardest setting, obviously. $2.5M, sector apathy, and the gold price owes you nothing.',
    cash: 2_500_000,
    baseDiscount: 0.2,
    sentimentDecay: 0.035,
    goldDrift: -0.0002,
    newsChance: 0.04,
  },
];

export interface NewsItem {
  day: number;
  text: string;
  kind: 'company' | 'market' | 'announcement' | 'good' | 'bad';
}

export interface AnnouncedOz {
  measured: number;
  indicated: number;
  inferred: number;
}

export interface Market {
  diff: Difficulty;
  cash: number;
  shares: number;
  price: number;
  sentiment: number; // roughly -0.5 .. +0.8
  hypeDebt: number;
  announced: AnnouncedOz;
  day: number;
  goldPrice: number;
  news: NewsItem[];
  history: number[]; // daily closes, capped
  spentExploration: number;
  /** EV/oz multiplier once a feasibility study is published (DFS-stage re-rate). */
  dfsBoost?: number;
}

// Risked $/oz the market pays an explorer for ANNOUNCED ounces, by class.
const EV_MEASURED = 130;
const EV_INDICATED = 95;
const EV_INFERRED = 45;

export function newMarket(diff: Difficulty): Market {
  const shares = 120_000_000;
  const fundamental = diff.cash / shares;
  const m: Market = {
    diff,
    cash: diff.cash,
    shares,
    price: fundamental * 1.25, // a little blue-sky in the IPO price
    sentiment: 0.05,
    hypeDebt: 0,
    announced: { measured: 0, indicated: 0, inferred: 0 },
    day: 0,
    goldPrice: 3000,
    news: [],
    history: [],
    spentExploration: 0,
  };
  m.history.push(m.price);
  return m;
}

export function marketCap(m: Market): number {
  return m.price * m.shares;
}

function riskedValue(m: Market): number {
  const a = m.announced;
  const goldFactor = m.goldPrice / 3000;
  return (
    (a.measured * EV_MEASURED + a.indicated * EV_INDICATED + a.inferred * EV_INFERRED) *
    goldFactor *
    (m.dfsBoost ?? 1)
  );
}

function fundamentalPerShare(m: Market): number {
  return (m.cash + riskedValue(m)) / m.shares;
}

const SECTOR_NEWS: Array<{ text: string; sentiment: number; gold: number; kind: NewsItem['kind'] }> = [
  { text: 'Gold breaks higher overnight — juniors bid up across the board.', sentiment: 0.05, gold: 0.03, kind: 'good' },
  { text: 'US data spooks gold — the sector bleeds.', sentiment: -0.05, gold: -0.03, kind: 'bad' },
  { text: 'Neighbouring explorer reports a discovery hole. Nearology is a hell of a drug.', sentiment: 0.07, gold: 0, kind: 'good' },
  { text: 'Risk-off day. Fund managers rediscover "capital discipline".', sentiment: -0.06, gold: -0.01, kind: 'bad' },
  { text: 'A broker initiates coverage on the junior gold space: "selectively constructive".', sentiment: 0.03, gold: 0, kind: 'market' },
  { text: 'Conference season — every CEO in Kalgoorlie says "drill-ready targets".', sentiment: 0.02, gold: 0, kind: 'market' },
];

export function tickDays(m: Market, days: number, rng: Rng): void {
  for (let d = 0; d < days; d++) {
    m.day++;
    m.goldPrice = Math.max(1200, m.goldPrice * (1 + m.diff.goldDrift + rng.gauss() * 0.006));
    m.sentiment *= 1 - m.diff.sentimentDecay;

    if (rng.next() < m.diff.newsChance) {
      const ev = SECTOR_NEWS[rng.int(0, SECTOR_NEWS.length - 1)];
      m.sentiment += ev.sentiment;
      m.goldPrice *= 1 + ev.gold;
      pushNews(m, ev.text, ev.kind);
    }

    const target = fundamentalPerShare(m) * (1 + clampSentiment(m.sentiment));
    m.price += (target - m.price) * 0.12;
    m.price *= 1 + rng.gauss() * 0.015;
    m.price = Math.max(0.001, m.price);
    m.history.push(m.price);
    if (m.history.length > 400) m.history.shift();
  }
}

function clampSentiment(s: number): number {
  return Math.max(-0.5, Math.min(0.9, s));
}

export interface AnnounceInput {
  deltaMeasured: number;
  deltaIndicated: number;
  deltaInferred: number;
  bestGrade: number;
  promotional: boolean;
  projectName: string;
}

export function announce(m: Market, a: AnnounceInput, rng: Rng): NewsItem {
  const deltaTotal = a.deltaMeasured + a.deltaIndicated + a.deltaInferred;
  m.announced.measured = Math.max(0, m.announced.measured + a.deltaMeasured);
  m.announced.indicated = Math.max(0, m.announced.indicated + a.deltaIndicated);
  m.announced.inferred = Math.max(0, m.announced.inferred + a.deltaInferred);

  let text: string;
  let kind: NewsItem['kind'] = 'announcement';

  if (deltaTotal >= 5000) {
    let bump = 0.05 + Math.min(0.25, deltaTotal / 1_200_000) + Math.min(0.08, a.bestGrade / 60);
    if (a.promotional) {
      bump *= 1.7;
      m.hypeDebt += bump * 0.6;
      text = `"BONANZA GRADES CONFIRM ${a.projectName} AS EMERGING WORLD-CLASS DISTRICT" — up to ${a.bestGrade.toFixed(1)} g/t Au. The market inhales.`;
      if (rng.next() < 0.3) {
        m.sentiment += bump - bump * 0.35;
        pushNews(m, text, kind);
        return pushNews(
          m,
          'Exchange price query received. "The Company is not aware of any information…" Sure.',
          'bad',
        );
      }
    } else {
      m.hypeDebt *= 0.7;
      text = `Exploration update, ${a.projectName}: resource grows by ${Math.round(deltaTotal / 1000)}koz (best ${a.bestGrade.toFixed(1)} g/t Au).`;
    }
    m.sentiment += bump;
  } else if (deltaTotal > -5000) {
    text = `Exploration update, ${a.projectName}: assays pending, nothing material to report. The market shrugs.`;
    m.sentiment -= 0.02;
    kind = 'market';
  } else {
    // Downgrade — reality bites, hype debt comes due.
    const hit = 0.06 + Math.min(0.2, Math.abs(deltaTotal) / 800_000) + m.hypeDebt * 0.8;
    m.sentiment -= hit;
    m.hypeDebt = 0;
    text = `Resource downgrade at ${a.projectName}: ${Math.round(Math.abs(deltaTotal) / 1000)}koz comes off the books. The market remembers every adjective you used.`;
    kind = 'bad';
  }

  return pushNews(m, text, kind);
}

export function raise(m: Market, amount: number, rng: Rng): NewsItem {
  const discount =
    m.diff.baseDiscount + Math.max(0, -m.sentiment) * 0.4 + rng.next() * 0.03;
  const px = Math.max(0.001, m.price * (1 - Math.min(0.4, discount)));
  const newShares = amount / px;
  m.shares += newShares;
  m.cash += amount;
  m.sentiment -= 0.03; // placement overhang
  return pushNews(
    m,
    `Placement: raised ${fmtM(amount)} at ${(px * 100).toFixed(1)}c (${Math.round(discount * 100)}% discount, ${Math.round((newShares / m.shares) * 100)}% dilution). The register groans.`,
    'company',
  );
}

export function pushNews(m: Market, text: string, kind: NewsItem['kind']): NewsItem {
  const item: NewsItem = { day: m.day, text, kind };
  m.news.unshift(item);
  if (m.news.length > 60) m.news.pop();
  return item;
}

export function sentimentWord(s: number): string {
  if (s < -0.15) return 'Despised';
  if (s < 0) return 'Ignored';
  if (s < 0.15) return 'Watched';
  if (s < 0.35) return 'Hot';
  return 'Euphoric';
}

function fmtM(v: number): string {
  return `$${(v / 1e6).toFixed(1)}M`;
}
