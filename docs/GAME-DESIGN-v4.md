# GAME DESIGN v4 — "A Tiny Mine That Runs"

> **PLAN OF RECORD** (D-022), building on [FUN-AUDIT.md](FUN-AUDIT.md) (D-021) — the audit, the
> Core Tray drill reveal, the satire cast, the death of quarters and the no-reading rule all stand.
> v4 adds the missing half identified by Tom's Pixel Hotel reference: the **ambient operating
> diorama**. Fun, simple, funny — in that order. Authenticity runs underneath, never on top.

---

## 1. Intent synthesis (why v4 is shaped like this)

Tom's five corrections across the project all point one direction: away from dashboards, text and
finance cognition — toward **a small living world that visibly responds to simple touches**
(McDonald's Videogame, Pixel Hotel, zombie-hoard ads: all "legible cause-and-effect rendered as a
living scene"). v2 failed as a compliance simulator. v3's slot-machine drill fixed the *spike* but
not the *ambience*: a slot machine alone is a casino. Pixel Hotel's magic is that **the reward for
progress is your little world getting busier and working while you watch**. v4 = spike + ambience.

## 2. Market gap

| Proof | Lesson |
|---|---|
| Idle Miner Tycoon, ~100M+ downloads | Massive casual demand for the mining theme — served with zero authenticity |
| Farming Simulator franchise | Faithful vocational detail is a feature people pay for |
| Kairosoft catalogue (~50 themes, no mining) | The cozy-pixel-management format is evergreen and the mining slot is vacant |
| McDonald's Videogame | Insider satire travels; the industry in-jokes ARE the shareability |

**Gap: a cozy, funny pixel mine-site tycoon where the underlying model is how mining actually
works.** Unique wedge: the mining industry's LinkedIn community as seeding audience — every share
is the consultant's business card. General players are upside, not the requirement.

## 3. The two loops (the whole game)

### Loop A — DISCOVER (active, spiky) — from FUN-AUDIT, unchanged
Tap ground → rig slams (80 ms, dust, thock, shake) → drills (0.5–0.7 s) → **Core Tray** slides up,
six segments flip like a slot reel → HIT: grade stamp scaled to g/t, nuggets arc to the oz counter,
confidence blob blooms; MISS: dust, two sad notes, "−$240k" floats away, Barry quip; NEAR-MISS:
gold fleck in the last segment when ore is one tile over.

### Loop B — OPERATE (ambient, cozy — the Pixel Hotel half) — NEW
Everything proven and built **runs visibly on its own**:
- A tiny excavator chews the pit (benches deepen tile by tile over the run).
- **Haul trucks do loops**: pit → ROM pad → plant. More trucks = visibly busier site.
- The plant chuffs smoke; **gold bars slide out and stack** beside it.
- Periodic **GOLD POUR**: a glowing bar pops with a sparkle — tap to bank it (coins arc to cash).
  Un-tapped bars bank themselves after ~8 s (no punishment, tapping just feels better).
- Workers walk camp ↔ pit at "shift change". Kangaroos, willy-willies and flies own the idle ground.

**The loops feed each other like real mining:** drilling grows the orebody → the operation eats it
→ operating cash funds more drilling → mined out ends the run. Brownfields drilling WHILE producing
is authentic and means the game never stops for a report.

## 4. Run structure (reconciling arcade + cozy)

One run = one tenement's whole life, **~5–8 minutes**: arrive → find smoke → prove it → get funded
→ build → watch it run while drilling the next lens → orebody exhausted → **reconciliation montage**
(STUDY SAID / GROUND SAYS / RELOCATIONS / FINAL, slamming down one by one) → score = final company
value + JORC-themed rank (Exploration Target → Inferred → Indicated → Measured) → **business card**
→ Upgrade Shop → next tenement. Persistent meta (localStorage): staff roster, rig tiers, radar
charges, best scores per seed. Milestone track from FUN-AUDIT stays:
**SMOKE → INFERRED → INDICATED → MEASURED → FUND IT → BUILD IT → POUR GOLD** (now POUR GOLD is a
*phase you live in*, not the end screen).

## 5. Simple money (Pixel Hotel legibility)

- **One number on screen: CASH.** Gold pours convert to cash physically (bars → coins → counter).
- **RAISE:** the Broker arrives on screen in a ute with a bag of money; your ownership pie takes a
  visible bite. One tap.
- **MEGAPHONE:** unannounced-ounces meter; STRAIGHT / LOUD choice (3-second buttons); headline
  banner + price-arrow theatre + klaxon risk. The joke survives; the market sim runs underneath as
  the score engine (market cap = final score), never as homework.
- Difficulty via tenement choice in the shop later, not a start-modal quiz. **First tap < 3 s stands.**

## 6. Staff = characters, not stats

Hired in the shop or mid-run when a slot unlocks; each is a visible little person on site.

| Character | Effect | Gag |
|---|---|---|
| The Geo | Marks one lens hint per run | Licks rocks |
| The Driller | Faster drill cycle | Winch trouble events |
| The Truckie | +1 haul truck in the loop | Names the truck |
| The Metallurgist | +recovery % | Angry at Barry specifically |
| **Barry** | Any role, half price | His version of the effect misfires ~30 % of the time, hilariously |

Consultant pick at FUND IT (Barry / Standard / The Good Consultants) and the Banker whose face is
your bankable %, the Regulator at the creek — all per FUN-AUDIT.

## 7. Controls & HUD (thumb spec)

- **Tap ground = drill.** Tap gold pour = collect. Tap event buttons. That's the whole input model.
- Bottom: RADAR (charges) · MEGAPHONE (meter) · RAISE. Top: cash, oz, price arrow, milestone track.
- Build phase: tap-place the three big buildings against the dashed predicted pit (v2's mini-game,
  kept, juiced with ghost preview + Regulator reactions).
- No start modal, no tutorial: pulsing finger over guaranteed smoke; the milestone track teaches.

## 8. Systems architecture (code)

### Survives (mostly untouched)
`core/rng` · `core/world` (retune: guaranteed shallow starter lens near workings) · `core/survey`
(classification → blob painting; tools → rig tiers/radar) · `core/market` (continuous ticks; score
engine) · `core/feasibility` (truth/NPV/consultant variance) · `core/build` (footprints, pit masks,
penalties) · `core/events` (breaking-news restyle) · `ui/isomap` (D-020 look + hooks) · `ui/juice`
(expanded) · seeds/challenge links · zero-server.

### New modules
- **`core/run.ts`** — run state machine (phases, milestone progression, mine-out detection, scoring).
- **`core/ops.ts`** — the operating sim: pit depletion rate, truck count, plant throughput,
  recovery, pour cadence. Pure functions of (state, dt).
- **`ui/actors.ts`** — the diorama: actors (truck, excavator, worker, roo, willy-willy, broker ute)
  with waypoint paths over the iso grid (pit ↔ ROM ↔ plant; camp ↔ pit), ~20 actors max, drawn in
  the existing render pass. Ambient loop lifts to ~20 fps during OPERATE.
- **`ui/tray.ts`** — the Core Tray reveal component (Gate 1 deliverable).
- **`ui/cast.ts`** — pixel portraits + speech bubbles (≤ 8 words), banner headlines.
- **`main.ts`** — rewritten around the two loops. Deskbar/quarters/studies-chips deleted.

### Perf & size
Canvas 2D remains ample (30×30 tiles + 20 actors at 20 fps). Everything stays programmatic;
budget < 100 KB gzipped total even with the cast.

## 9. Build order & acceptance gates

| Gate | Deliverable | Pass condition |
|---|---|---|
| **1** | Core Tray + drill juice, naked | Tom taps five times and wants a sixth |
| **2** | First truck loop (pit→plant→bars→pour→collect) on a stub mine | Watching it is pleasant for 60 s with zero taps |
| **3** | Loops joined: drill grows blobs → pit eats them → cash funds drills; milestone track; 3 buttons | A stranger reaches FUND IT with zero instructions |
| 4 | Bank scene, consultant cards, build phase, montage, business card, shop | Full run 5–8 min, punchline lands |
| 5 | Cast, critters, events-as-news, sound pass | It's funny with the sound ON and OFF |
| 6 | Meta balance, first-15 s gold guarantee, share card, deploy | Cold-open test on a phone |

**Rule: no gate starts until the previous gate passes with Tom's thumb, not my telemetry.**

## 10. Risks & honest tensions

- **Cozy vs. arcade:** resolved by making the run = one tenement lifecycle (a Pixel Hotel compressed
  into minutes). If playtests want to linger, mine-out pacing is one constant.
- **Authenticity creep (my recurring failure):** every feature must pass "does the SCREEN get more
  alive?" before "is it more correct?". The sim earns its place by powering the diorama, not by UI.
- **Scope:** the actor system is the only genuinely new engineering; it is deliberately dumb
  (waypoints + sprites). If Gate 2 slips, cut worker actors before truck actors — trucks ARE the ambience.
- **Satire tone:** in-jokes must never gate progress — they decorate it. Anyone can finish; miners
  laugh twice.
