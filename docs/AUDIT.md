# v4 BUILD AUDIT — 2026-07-04

Audit of the full-arc build against hyper-casual / web-game best practice, per Tom's brief:
"go to the end and audit your work against best practice, then improve." Findings ranked;
✅ = fixed in this build, ⚠ = open with a plan.

## Caught and fixed during this build

1. ✅ **Pour economy explosion.** First playtest banked **$192M in one pour** ($1,200/oz margin ×
   90koz batches — geologically honest, ludicrously game-breaking: it made drill costs, raises and
   dilution meaningless). Margin rescaled to $220/oz; shop credits clamped (max 10★/run).
2. ✅ **Market clock racing.** Ops loop was ticking ~12.5 market-days/second; now ~1/second.
3. ✅ **First-tap gold not guaranteed.** The tutorial finger pointed at surface clues, which can sit
   over barren or deep ground. It now scores every tile (ounces + clue bonus − depth) and points at
   real, shallow, drillable gold — the first tap always pays. (FUN-AUDIT north star: gold < 15 s.)
4. ✅ **Motion sensitivity ignored.** `prefers-reduced-motion` now disables shake/bounce/throb.
5. ✅ **No small-screen consideration.** First responsive pass added (chrome tightens ≤700 px).
   Full phone test still pending (see below).

## Verified good practice

- **Time-to-first-tap < 3 s, zero reading**: no start modal; finger tutorial; milestone track
  teaches the arc. ✅ (north stars 1 & 3)
- **Bundle 24.5 KB gzipped total** — loads on mine-site wifi; zero runtime deps, zero image/audio
  assets (all sound synthesized, all art programmatic). Far inside budget.
- **Determinism**: challenge links reproduce the exact world; market RNG seeded; only cosmetic
  choices (Barry quips) use `Math.random()`.
- **No leaks**: DOM particles/pours self-remove; single interval loop; draw skipped when hidden.
- **Full-arc integrity** (verified by scripted playthrough): drill → tray → heat → announce
  (straight/LOUD, hype debt, price re-rate) → Banker gate (only counts *announced* ounces — the
  disclosure mechanic teaches itself) → consultant tiers → sequential placement with ghost +
  pit-line → live diorama (pit digs itself, trucks haul, pours bank) → reconciliation with
  consultant callback → rank + business card + shop.

## Open items (priority order)

1. ⚠ **Human playtest is the real Gate 3.** A stranger must reach FUNDED with zero instructions.
   The Banker's "announce your ounces" line is the load-bearing teacher — verify it lands.
2. ⚠ **Real phone pass**: touch targets ≥44 px (dock ✓, tray n/a, canvas tiles ✓ at 56 px), layout
   at 380 px, audio unlock on first tap (sounds already gesture-driven ✓). Needs a device.
3. ⚠ **Ops-phase agency**: currently drill-while-she-runs + bank pours; no failure state (cozy by
   design). Planned spice: a "SELL THE COMPANY?" takeover offer mid-ops (accept = end early at a
   premium — tension without punishment).
4. ⚠ **Events surface rarely** (every 5th hole, 50%): tune frequency; add ops-phase events
   (rain flooding the pit, truck breakdowns) for diorama drama.
5. ⚠ **Repo hygiene**: `src/gate1.ts` and `src/main.ts` (v2) are unbundled but on disk;
   `estimate.ts`/`deposit.ts`/`ground.ts` legacy from v1. Prune at the next quiet moment.
6. ⚠ **Share card** is still text-only; the PNG result card remains the top viral upgrade.
7. ⚠ **Branding placeholders**: `core/branding.ts` still says `[Your Firm Name Here]` — Tom.

## Balance snapshot (as shipped)

Start $5M · hole $250k · raise +$2.5M / −8% stake (floor ~12%) · Banker wants 100koz ANNOUNCED,
pays $8M · consultants $150k/$400k/$800k · pours ~7% of pool every 5 s at $220/oz × true recovery ·
camps 234k–1.3Moz (~25% bonanza tiles) · rank by ounces poured · credits ≤10★/run.
