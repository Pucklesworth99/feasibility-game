# BUILD BRIEF: "Feasibility" — A Mining Development Game (Portfolio Build)

> **⚠ PIVOT NOTICE (2026-07-04, post-playtest).** The core stage described in §3–§4 (side-on cross-section drilling) has been superseded by decisions **D-012…D-015** in [DECISIONS.md](DECISIONS.md): the game is now an **isometric 50×50 tile tenement sim** — sampling ladder (soils → aircore → RC → diamond) with AOE reveals, a **persistent ASX-listed company whose share price/market cap is the career score** (announcements, placements, news flow), and later phases adding plant/TSF placement and pit pushbacks that reclaim tiles ("don't sterilise your orebody"). §1–§2 purpose/pillars, §6 tiers, §9 serverless sharing, and §10 credibility layers all still stand. This document needs a full v2 rewrite; until then DECISIONS.md is authoritative where they conflict.

> **How to read this document.** Sections marked **(locked)** are settled decisions — build to them. Section 11 lists branches deliberately left open — recommend an option and justify it. Section 12 lists scope-flex items — the client is flexible on these if cutting or adding them makes the core product more impressive and more shareable.

---

## 1. Purpose & Success Criteria

Build a web-hosted, browser-based game for a mining engineering consultant's personal portfolio site (custom domain). The game has **two jobs**:

1. **Demonstrate mining expertise through play.** A visitor plays, feels the decisions were genuinely hard and real, and comes away thinking "this person clearly does this for a living." End-screen CTA to real consulting services.
2. **Demonstrate AI capability.** The game is itself evidence that the consultant can wield AI to build serious, polished software. It must impress on craft — the kind of thing that circulates in the mining community with "wait, one consultant built this?" attached.

Secondary success = shareable/replayable enough to circulate on LinkedIn and mining-industry social channels.

**This is a marketing asset first, a game second — but it must be a genuinely fun game or it fails at being a marketing asset.**

## 2. Design Pillars (locked)

- **Multi-session career.** Each deposit is a short, self-contained session (target 20–40 min); persistent reputation, unlocks, and progression stack across many plays. Persistence via localStorage (see Pillar: zero-server) with save export/import codes.
- **Authentic but translated.** Real JORC Code structure and feasibility-study workflow drive the actual mechanics. UI uses plain-language labels on the surface with **real terminology surfaced in tooltips / expert mode**. Never dumb down the underlying model; only translate the presentation.
- **Two audiences via difficulty tiers.** Casual mode (guided, forgiving, gamified labels) and expert mode (real NPV math, discount rates, visible JORC thresholds, unforgiving). Same core simulation engine; tiers change what's exposed and how forgiving parameters are.
- **Zero-server, static-first.** The entire game runs client-side. Deployed as a static site on a free tier (Cloudflare Pages / GitHub Pages / Netlify — architect to pick). No accounts, no database, no server-side game logic. Anything that seems to need a backend must be redesigned to not need one (see §9 for how sharing/competition works serverless).
- **Featherweight delivery.** Target **< 2 MB initial load**, playable within seconds on poor connections. Rationale is on-brand: the target audience includes people on mine-site wifi and FIFO rosters — *if it loads in the Pilbara, it loads anywhere.* Pixel art and procedural generation make this natural: no large media assets, no big data files, deposits are generated not downloaded.

## 3. Core Mechanic — "Reduce uncertainty under capital constraint"

The heart of the game: **the player spends limited capital to learn about a randomly generated orebody, climbing the JORC confidence ladder far enough to justify (or reject) building a mine — without going broke.**

The JORC ladder is the progression spine:

`Exploration Target → Inferred Resource → Indicated Resource → Measured Resource → Probable Reserve → Proved Reserve`

**The signature interaction — the drill-reveal:**

- The screen shows a **pixel-art side-on cross-section of the ground.** The orebody is hidden inside it.
- The player places **drill holes**; each punches down and reveals a vertical strip of pixels. Grade is shown as colour intensity.
- Each hole costs money and time. More holes / tighter spacing → higher confidence → higher JORC classification → higher financeable value.
- Tension: too few holes = deposit stays "Inferred," banks won't fund it; too many = budget burned confirming ore you could have sold. **The sweet spot is the entire game.**

This single mechanic teaches sampling density → confidence → classification *by feel*, and it's the tactile, satisfying hook. **It is also the MVP gate: if this loop isn't fun in isolation, nothing downstream gets built until it is.**

## 4. Game Phases (the four-beat loop, repeated per phase)

Every phase runs the same rhythm — **Reveal → Interpret → Decide → Consequence** — with a different currency each time:

1. **Exploration (drill metres).** Generate a deposit; drill to establish grade, tonnage, geometry, and JORC class.
2. **Feasibility Studies (study reports).** Commission metallurgical, geotechnical, hydrogeological, and environmental/social studies. Each costs time+money, reduces a specific uncertainty, and can surface problems (low recovery, unstable pit walls, groundwater, community/permitting risk). Player chooses *which* uncertainties are worth paying to close — mirrors real scoping/PFS/DFS staging.
3. **Financing (term sheets).** Pitch the project. Options — equity (VC / strategic partner), debt (development bank), royalty/streaming, JV. Financeability is *gated by JORC class and study quality from prior phases.* Simple counter-offer negotiation mechanic.
4. **Development & Operations (production tonnes).** Build and run the mine against a timeline. Lightweight resource management (mining vs. processing bottleneck), plus random events grounded in reality (commodity price swings, equipment failure, weather, permitting delays). Under-drilled/under-studied projects blow out here — the consequence layer for earlier corner-cutting.

**Scoring:** final NPV, ownership stake retained, timeline, and ESG/social outcome — feeding reputation.

## 5. Meta-Progression (the "expansive" layer)

Keep each run simple (5–8 real decisions); stack persistence on top:

- **Reputation** as the true meta-score; unlocks bigger, harder mandates.
- **Commodity unlocks**, each adding exactly ONE new wrinkle: gold (baseline) → copper (by-product credits) → lithium (price volatility) → rare earths (processing + permitting hell).
- **Deposit archetypes** — procedurally generated from real templates (narrow high-grade reef, bulk low-grade porphyry, shallow vs. deep, remote vs. road-accessible). Same mechanics, different optimal strategy → replayability without new systems.
- **"The ground lies" twist deposits** — faults offsetting orebodies, flooding, erratic grades. Where real expertise pays off and novices get humbled.

## 6. Difficulty Tiers

- **Casual:** guided decision trees, plain-language labels, forgiving economics, hints. JORC terms appear only in tooltips.
- **Expert:** real terminology on-surface, visible NPV/discount-rate/cut-off-grade math, real JORC classification thresholds, unforgiving budget. Aimed at industry peers and prospective clients.
- Both run the **same simulation engine**; tiers change what's exposed and how forgiving parameters are.

## 7. Art & UI Direction

- **Pixel art = "The Ground":** the cross-section, drill-reveal, the mine as it develops. Nostalgic, tactile, cheap to iterate — and tiny over the wire.
- **Minimalist data UI = "The Boardroom":** JORC resource table, cashflow/NPV model, term sheets, feasibility reports. Clean, numbers-forward, professional — this layer is the credibility signal.
- The contrast between the two is intentional and on-brand: playful ground, serious boardroom.
- **Polish is a feature, not a luxury.** Because the game doubles as an AI-capability showcase, micro-interactions matter: satisfying drill animation, smooth JORC-bar fills, a result card that looks designed. Small scope, high finish beats large scope, rough finish — always.

## 8. Retention / Addictive Mechanics

Clash-of-Clans hooks, mining-themed: short sessions; highly visible progress bars (confidence %, funding raised, mine build %); asymmetric outcomes (same deposit → different mines); instant replay via procedural generation; shareable results ("I turned a $2M Inferred prospect into a $480M mine").

## 9. Serverless Sharing & Competition (locked design pattern)

All social/viral mechanics must work with **zero backend**, built on **deterministic seeded procedural generation**:

- **Seed challenges.** Every deposit is fully determined by a seed string. A share link (`…/play?seed=KALGOORLIE-4471`) gives every player the *identical* orebody. "I got $480M NPV out of this deposit — beat me" is a complete competitive loop with no server. Seeds get memorable mining-flavoured names (real district Easter eggs).
- **Daily/weekly challenge.** Seed derived deterministically from the date — everyone worldwide plays the same deposit that week. Community leaderboard happens organically in LinkedIn comments, which is *better* for the marketing goal than a hosted leaderboard.
- **PNG share cards.** On run completion, canvas-render a downloadable/shareable result card: mini cross-section of *their* mine, final NPV, JORC class achieved, key stats, game URL. Sized for LinkedIn. This is the primary viral artifact.
- **Save export/import codes** stand in for accounts: progress lives in localStorage, exportable as a compact string for device transfer.

## 10. Credibility, Lead-Gen & AI-Showcase Integration

- Expertise shows through *difficulty and authenticity*, not advertising. Real JORC clause references in expert tooltips; nods to real mining districts as Easter eggs; an end-of-run summary framing the player's choices against real feasibility principles.
- One clean, non-intrusive CTA on the end screen: *"That was a game. The real version is what I do — [services link]."*
- **The Debrief.** After each run, the player gets a consultant-style project review: what their drill spacing implied, where their study choices left residual risk, how their financing structure performed. Built as a **rule-based procedural text system** (zero-cost, offline) that reads the full run state and composes a bespoke-feeling report. This is the single highest-leverage credibility feature: it makes the player feel personally reviewed by a professional. *(An LLM-powered version is a scope-flex item — see §12.)*
- **"How this was built" page.** A short, well-designed page telling the story of building the game with AI — the meta-marketing layer for AI-consulting capability. Links from the game footer.

## 11. OPEN BRANCHES — architect to recommend + justify

- **Tech stack** — engine/framework for pixel + data UI in-browser (e.g., PixiJS/Phaser + lightweight UI layer? plain Canvas + Preact/Svelte? vanilla?). Hard constraints: static build output, < 2 MB initial load, mobile-capable, embeddable in a portfolio site.
- **Mobile vs. desktop-first** — affects UI density and drill interaction (tap vs. click-drag). Note: LinkedIn traffic is heavily mobile; mine-site traffic is heavily phone-based. Lean mobile-first unless there's a strong counter-argument.
- **Economic model fidelity** — how real should the NPV/cashflow engine be under the hood, even in casual mode? Recommend a fidelity level that keeps expert mode defensible to industry peers without bloating the sim.
- **Content pipeline** — deposit archetypes, random events, and Debrief text authored as data-driven config (JSON/YAML) the consultant can edit without touching code. Recommend a schema.
- **Client-side analytics** — funnel insight (plays → completions → CTA clicks) within the zero-server constraint: privacy-friendly free tier (e.g., Cloudflare Web Analytics) vs. none. Recommend.

## 12. SCOPE-FLEX ITEMS — negotiable if they make it more awesome

The client is explicitly flexible on scope. Guidance: **cut breadth before finish, and prefer additions that compound shareability.**

- **Cut candidates (fine to defer past v1):** commodity unlocks beyond gold; the full Development & Operations phase (a run could end at the financing decision + projected-outcome reveal, which is arguably the *more* authentic consulting endpoint); negotiation mechanics (financing could be take-it-or-leave-it term sheets in v1).
- **Keep at all costs:** drill-reveal loop, JORC ladder, the Debrief, seed challenges, PNG share cards.
- **Stretch candidates (only after v1 ships):** LLM-powered Debrief via a free-tier edge function (rate-limited; small ongoing cost; genuinely impressive AI showcase — but ship the rule-based version first); underground vs. open-pit method choice; a weekly-challenge archive page.

## 13. Requested Deliverables from the Architect

1. Recommended tech stack + rationale (against the featherweight/static constraints).
2. System architecture — client structure, seeded procedural generation approach, localStorage save model, share-card renderer.
3. Core game-loop state machine / phase flow diagram.
4. Data model for a deposit, JORC classification logic, and the economic/NPV engine.
5. Wireframes for each phase (both the pixel "Ground" and data "Boardroom" views), mobile and desktop.
6. Art style guide + asset list (with byte-budget per asset class).
7. Progression/unlock and reputation system spec.
8. Debrief system spec — run-state inputs → rule-based text composition.
9. **MVP definition** — smallest playable slice = Exploration phase drill-reveal + JORC confidence bar + go/no-go verdict + share card — vs. full-build roadmap.
10. Performance budget & deployment pipeline (repo → static host auto-deploy).
11. Client-side analytics + CTA conversion tracking plan (within zero-server constraint).
