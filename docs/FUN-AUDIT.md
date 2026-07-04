# FUN AUDIT & V3 INTERACTION SPEC — "Make the drill hole the hero"

> **Status: PLAN OF RECORD** for the v3 rebuild (D-021). The v2 sim core survives; the v2
> interaction layer is torched. Fun is the primary requirement; authenticity runs underneath it.
> Reference point: Molleindustria's *McDonald's Videogame* — visual satire, chunky readability,
> zero reading required — crossed with hyper-casual ad-game immediacy (tap → payoff in seconds).

---

## PART 1 — The audit (why v2 isn't fun)

| # | Failure | Evidence in v2 |
|---|---|---|
| 1 | **Time-to-first-dopamine ~90 s, requires reading** | Start modal → difficulty blurbs → map → deskbar of finance buttons. Hyper-casual target: payoff < 5 s, zero words. |
| 2 | **The core verb pays off in text, later** | Tap → radial menu → queue → "Run Quarter" → read a modal. All dopamine batched into an administrative report. We built a compliance simulator. |
| 3 | **The discovery moment has no fireworks** | A 155 koz discovery renders as one 13 px sentence. A duster and a bonanza are emotionally the same size. |
| 4 | **Modals stop the game 6+ times per arc** | Quarterly report, event card, publish, build intro, reconcile, picker. |
| 5 | **Nothing escalates** | Hole #40 feels identical to hole #1. No upgrades, no rising stakes, no speed. "One more go" never fires. |
| 6 | **Silliness lives in tooltips, not on screen** | The Maccas game's satire is visual (cows → patties in front of you). Ours is po-faced pixels with witty captions nobody reads. |
| 7 | **No near-miss psychology** | Slot machines run on *almost*. Our misses are flat "nothing." |
| 8 | **Numbers don't feel like anything** | Ounces arrive as strings, not as nuggets flying into a counter. |

**What survives the fire (keep, verbatim or near):** seeded deterministic worlds + challenge links;
JORC ladder as progression; market/announcement irony (hype debt, ASX queries); consultant
tiers + business-card punchline; sterilization build phase; entire sim/econ core; zero-server
architecture; ~25 KB bundle. **The skeleton is right. The moment-to-moment gets rebuilt.**

---

## PART 2 — Locked decisions (from Tom, 2026-07-04)

- **Run shape: arcade runs + persistent upgrades.** Each tenement = a tight 3–6 minute run ending
  in a score (market cap) + grade + business card. Upgrades carry between runs (the hyper-casual
  meta loop). Supersedes D-001's multi-session career.
- **Silliness: full Maccas satire.** Pixel characters, absurd headlines, kangaroos. The satire is
  VISUAL. The professional point lands harder by contrast.
- **Quarters die.** Time flows continuously underneath (days tick per action, silently). The
  milestone track replaces the turn structure. Supersedes the quarterly loop of D-017 (plain-English
  and one-ladder rules from D-017 stay).

## North-star metrics (acceptance tests for v3)

1. First tap **< 3 seconds** from page load. No start modal — the game opens ON the map with a
   pulsing finger: **"TAP TO DRILL."** Seed/difficulty live behind a small corner menu.
2. First gold flash **< 15 seconds** (world gen guarantees a shallow starter lens near the old
   workings; the finger points near it).
3. Full run **3–6 minutes**. Score screen worth screenshotting.
4. **Zero required reading before fun.** Words are reactions, never instructions.

---

## PART 3 — The core loop, beat by beat (the hero moment)

**One verb: TAP GROUND = DRILL.** No tool menu.

1. **Slam (80 ms):** rig sprite drops onto the tile — dust, *thock*, 2 px screenshake.
2. **Drill (500–700 ms):** rig vibrates, rat-tat audio, depth meter spins.
3. **The Core Tray (the slot machine):** a full-width tray slides up from the bottom edge; SIX core
   segments flip left→right, 90 ms apart, tick-tick-tick — brown, grey, grey…
   - **HIT:** gold segment flips with flash + rising ding. Grade stamp slams — **"4.2 g/t!"** — type
     size scales with grade. 5–20 nugget particles arc from the hole into the oz counter; counter
     rolls; the confidence blob blooms outward on the map (animated paint); price ticker blips.
   - **MISS:** all grey. Two sad notes. Dust puff. Floating **“−$240k”** drifts off the hole. Barry
     occasionally pops up: *"She felt good though, ay."*
   - **NEAR-MISS (engineered):** if ore sits within 1 tile, the LAST segment flips a thin gold fleck —
     *"traces…"* — and a faint shimmer nudges one tile over. Slot-machine *almost*, geologically honest.
4. **Cash bar drains visibly per hole.** Below one drill's cost, the RAISE button inflates and pulses.

### The other one-tap verbs (bottom HUD, three buttons total)

- **RADAR** (replaces soil/aircore): consumable charges — tap, then tap ground → satellite ping
  sweeps a radius, prospectivity heat blooms. Buy charges in the shop.
- **MEGAPHONE (Announce):** shows a meter of unannounced ounces. Tap → two big buttons appear for
  3 seconds: **STRAIGHT** and **LOUD** (LOUD is bigger, shakes, obviously tempting). Headline banner
  scrolls across the screen; price arrow rockets — or the **ASX-query klaxon** sounds. Hype debt as now.
- **RAISE:** instant placement — cash floods in, your **ownership pie visibly shrinks** with a bite sound.

### Milestone track (replaces quarters, teaches the game)

Across the top, filling like a progress bar with celebration stings:
**SMOKE → INFERRED → INDICATED → MEASURED → FUND IT → BUILD IT → POUR GOLD**

- **FUND IT** auto-triggers the **Bank Scene**: the Banker (pixel portrait) stamps
  **APPROVED / DENIED** — his mood is literally the M+I share (the 60 % rule, visualized).
- **Consultant pick** (one scene, three cards for the whole study package in v3.0): Barry's card has
  a stain on it; The Good Consultants card gleams. Choice drives reconciliation variance exactly as
  the current sim does. (Per-study tiers can return later as depth.)
- **BUILD IT:** keep v2's siting game — dashed predicted pit, chunky buildings, footprint traps — it is
  already the right mini-game; make placement a juicy drag/tap with ghost preview, and the Regulator
  character visibly frowns if the TSF nears the creek.
- **POUR GOLD — the montage:** numbers slam down one at a time with shake: STUDY SAID → GROUND SAYS →
  RELOCATIONS → **FINAL NPV** → share-price rocket/crater → market-cap score + rank
  (ranks are JORC-themed: *Exploration Target → Inferred → Indicated → Measured* as grade names) →
  **the business card** → the Upgrade Shop.

### Events

Keep the six event cards; restyle as **BREAKING NEWS ticker takeovers** — two big buttons,
**5-second auto-default timer** (urgency instead of interruption).

---

## PART 4 — Meta: the upgrade shop (persists via localStorage)

Credits earned per run ≈ final market cap (tuned). Purchases persist:

| Upgrade | Effect |
|---|---|
| **Barry's Ute Rig** (start) | Shallow, cheap, wobbly grades |
| **RC Rig** | Deeper, better assays |
| **Diamond Rig** | Deepest, precise — reaches the blind lenses (replay value) |
| Radar charges | More sweeps per run |
| A Richer Uncle | Starting cash bump |
| Broker Contact | Better raise discounts |
| Staff Geologist | One free lens hint per run |

Depth-tiered rigs gate deep ore → real reason to replay the same seed after upgrading.

## PART 5 — The cast (pixel portraits, speech bubbles, ≤ 8 words each)

- **BARRY** — driller/cheap consultant. Stained shirt. Appears on dusters and bad advice.
- **THE BROKER** — appears when sentiment runs hot: *"Mate. MATE. Raise now."*
- **THE BANKER** — the FUND IT scene; mood = bankable share.
- **THE REGULATOR** — frowns at creek-side tailings in build phase.
- **Ambient:** kangaroos hop across idle ground; a willy-willy spins through occasionally; flies
  gather if the player idles: *"You gonna drill or what?"*

## PART 6 — Sound (all synthesized, expand juice.ts)

Drill rattle · tray tick · grade sting (pitch scales with g/t) · kaching · klaxon · sad-trombone
duster · milestone fanfare · roo thump. Mute toggle stays.

---

## PART 7 — What survives in code

| Module | Fate |
|---|---|
| `core/rng.ts` | Unchanged |
| `core/world.ts` | Retune: guarantee shallow starter lens near workings; keep terrain/heritage/creek |
| `core/survey.ts` | Classification radii reused for blob painting; TOOLS become rig tiers/radar |
| `core/market.ts` | Continuous ticking (per action) instead of quarterly; announce/raise/hype logic intact |
| `core/feasibility.ts` | Truth + NPV + consultant variance intact; five-study UI collapses to one scene (v3.0) |
| `core/build.ts` | Intact — footprints, canPlace, sitingPenalties |
| `core/events.ts` | Intact; restyled presentation |
| `ui/isomap.ts` | Keep renderer + D-020 look; add blob-bloom painting, critters, drill anim hooks |
| `ui/juice.ts` | Expand heavily |
| `main.ts` | **Rewritten** around the new loop |
| Quarters / plan queue / deskbar / studies chips / most modals | **Deleted** |

## PART 8 — Build order (next session)

1. **The Core Tray + drill juice, in isolation.** The hero moment gets built FIRST and judged naked
   (D-009 principle). **If tapping to drill isn't fun with everything else turned off, nothing else
   gets built until it is.**
2. Continuous time; strip HUD to: cash bar, oz counter, price arrow, milestone track, 3 buttons.
3. Announce/raise as juiced one-taps; breaking-news events.
4. Bank scene → consultant cards → build phase → pour-gold montage → business card → shop.
5. Meta persistence + upgrade balance; 3–6 min run tuning; first-15-seconds gold guarantee.
6. Cast portraits + ambient critters + sound pass.
7. Only then: share card, deploy, weekly seed.
