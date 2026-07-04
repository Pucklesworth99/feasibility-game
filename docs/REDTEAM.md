# FINAL INTERROGATION — benchmark + red team (2026-07-04, autonomous session)

> **THE MOJANG GAUNTLET (2026-07-04, later that day).** A simulated "Mojang technical lead" critic
> agent ran three adversarial review rounds against the full codebase. Round 1: 12 findings incl.
> 3 blockers (12.5fps interval renderer; hype debt never collected; the mine ignored discovery).
> Round 2: verified all 12 fixed, found 8 more incl. 1 new blocker (pagePos not DPR-corrected).
> Round 3: verified all 8 fixed, zero gating findings, and signed off explicitly:
> **"This survives playtest night… every system now closes its loop. You drill what you announce,
> you mine what you found, you pay for what you exaggerated, and dilution prices itself into your
> final number. The satire is no longer decoration on top of the mechanics; it IS the mechanics."**
> Named ceiling (accurate): brilliant single session, not yet a week-two game (meta depth, offline
> pull, staff characters, tenement variety). Named launch debts: phone pass, dead CSS, FX scroll
> anchoring, branding placeholder. Poster sentence: *"Every ounce you announce is a debt — drill,
> hype, build, and find out what the ground really thinks of your spreadsheet."*

## Competitive benchmark

| Benchmark | Their strength | Us | Verdict |
|---|---|---|---|
| **Idle Miner Tycoon** (100M+ installs) | Meta depth, offline progress, prestige loops | Instant loop, real geology, 26 KB vs their ~150 MB | We win first 5 minutes; they win week 2. **Gap: offline progress + deeper meta** (3 upgrades vs their hundreds) |
| **Turmoil** | Land auctions, round tension, price manipulation | Same prospect-drill-sell skeleton, ours adds JORC/disclosure/build phases | Comparable loop quality. **Steal later: tenement auctions between runs** |
| **Kairosoft** | Charm via staff personalities over years | Cast is speech-bubbles-only so far | **Gap: staff as hireable characters** (v4 doc §6, not yet built) |
| **Hyper-casual ads (zombie/gold-pan)** | <5 s to payoff, zero reading | First tap <3 s, guaranteed jackpot via finger, zero reading | **We match** — verified north stars |
| **McDonald's Videogame** | Satire IS the mechanics | Ours: disclosure/hype/Barry are mechanics, not decoration | **We match**, and our niche (mining LinkedIn) is sharper |

**Net position:** best-in-class first session for the theme; thinnest area is week-two retention
(meta depth, offline progress, staff characters) — all designed in GAME-DESIGN-v4, not yet built.

## Red-team attacks run

| Attack | Result |
|---|---|
| Full-arc scripted playthrough (drill→announce→fund→consult→build→ops→end) | ✅ passes, twice, on two seeds incl. DAILY |
| Pour economy abuse | ✅ fixed this session ($192M/pour → $220/oz; credits ≤10★) |
| Ops continues after run end | ✅ fixed (opsTick halts on S.over) |
| Ops drama never fires (20% both-miss parlay) | ✅ fixed (0.8/0.7 chances) |
| Placement softlock on tight tenements | ✅ guarded (pit-line waiver when zero valid anchors) |
| Raise-spam to zero | ✅ stake floor 12%, Broker refuses below |
| Broke + can't raise + <100koz | ⚠ dead-ish end; New Tenement is the exit — acceptable (arcade), Broker could point at it |
| Heritage/creek/dug-tile taps, double-drill, drill-during-modal | ✅ all rejected with jokes |
| NaN/finite guards (grades, audio frequencies) | ✅ fixed earlier session + defensive clamps |
| Hidden tab: pours auto-bank, draws skip, no runaway clock | ✅ verified |
| Deterministic challenge fairness | ✅ world + market seeded; only Barry's quips use Math.random() |
| Share card generation | ✅ renders + downloads, includes live map snapshot |

## Remaining before public launch (priority order)

1. **Tom's thumb + one stranger** — Gate criteria are human, not scripted.
2. **Real phone pass** (layout ≤380 px, touch feel, audio unlock).
3. **branding.ts placeholders** — the business card still says `[Your Firm Name Here]`.
4. **Deploy** (Cloudflare/GitHub Pages + domain — 10-minute job, needs Tom's accounts).
5. Week-two retention layer: staff characters, more shop tiers, offline trickle, tenement auctions.
6. OG meta tags + favicon for link unfurls.
