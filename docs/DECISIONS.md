# Decision Log

Locked decisions and the reasoning behind them. Newest at the bottom. If a decision gets reversed, strike it through and add a new entry — don't delete history.

---

## D-001 · Session shape: multi-session career
**Decided:** 2026-07-04
Each deposit is a self-contained 20–40 min run; reputation, unlocks, and commodity progression persist across runs. Chosen over one-sitting arcade (weaker retention) and idle/incremental (bigger build, wrong tone for a professional portfolio).

## D-002 · Rigor register: authentic but translated
**Decided:** 2026-07-04
Real JORC Code structure and feasibility workflow drive the mechanics; plain-language labels on the surface, real terminology in tooltips/expert mode. The simulation is never dumbed down — only the presentation is translated.

## D-003 · Audience: both tiers, one engine
**Decided:** 2026-07-04
Casual mode for the broad public/recruiters; expert mode (real NPV math, visible JORC thresholds) for industry peers and prospective clients. Same simulation engine; tiers differ only in exposure and forgiveness.

## D-004 · Art direction: pixel "Ground" + minimalist data "Boardroom"
**Decided:** 2026-07-04
Pixel-art cross-section for the tactile drill-reveal layer; clean numbers-forward UI for JORC tables, cashflow, and term sheets. The contrast is intentional: playful ground, serious boardroom. Also the cheapest style to iterate and the lightest over the wire.

## D-005 · Zero-server, static-first architecture
**Decided:** 2026-07-04
Entire game client-side; free-tier static hosting; localStorage saves with export/import codes; no accounts, no database. Driven by the low-cost hosting requirement. Anything that appears to need a backend gets redesigned serverless (see D-006).

## D-006 · Virality via deterministic seeds, not servers
**Decided:** 2026-07-04
Deposits are fully determined by a seed string → shareable challenge links, date-derived weekly challenges, and PNG share cards replace hosted leaderboards/multiplayer. Competition happens in LinkedIn comments — which serves the marketing goal better than a leaderboard would anyway.

## D-007 · Featherweight budget: < 2 MB initial load
**Decided:** 2026-07-04
Must be instantly playable on poor connections (mine-site wifi, FIFO phones). Pixel art + procedural generation make this natural. Framed on-brand: *if it loads in the Pilbara, it loads anywhere.*

## D-008 · Dual showcase: mining expertise + AI capability
**Decided:** 2026-07-04
The game must impress as an artifact ("one consultant built this with AI?"). Consequences: polish beats breadth everywhere; a "How this was built" page ships with v1; the rule-based Debrief ships first, with an LLM-powered Debrief as a post-v1 stretch (avoids API cost/keys at launch).

## D-009 · MVP gate: the drill-reveal must be fun in isolation
**Decided:** 2026-07-04
Smallest playable slice = drill-reveal + JORC confidence bar + go/no-go verdict + share card. Playtest that before building phases 2–4. If drilling isn't satisfying on its own, nothing downstream matters.

## D-010 · Web-only, no install; save codes as the portability mechanism
**Decided:** 2026-07-04
Wholly web-hosted: visit the domain, play instantly. No downloads, installs, or accounts. Saves live in localStorage (auto-resume on same browser); a versioned compressed text code (`FSB1.<payload>`) exports/imports progress across devices. The save code IS the account system — zero backend.

## D-011 · Tech stack: Vite + TypeScript, Canvas 2D, vanilla UI
**Decided:** 2026-07-04
No game engine, no UI framework. The Ground is a Canvas 2D pixel renderer (a cross-section grid needs nothing heavier); the Boardroom is plain DOM/CSS; the simulation core is pure framework-free TypeScript (deterministic, testable). Zero runtime dependencies → bundle well under 100 KB gzipped, far inside the 2 MB budget. Revisit only if Boardroom UI complexity demands it (Preact at 3 KB is the designated escape hatch).

## D-012 · PIVOT: tile-map company sim, not cross-section puzzle
**Decided:** 2026-07-04 (after playtesting the v1 cross-section prototype)
The main stage is now a randomly generated ~50×50 tile tenement — a land-use and company-building sim (McDonald's-game / Clash-of-Clans lineage), not a side-on drilling puzzle. Sampling ladder (soils → aircore → RC → diamond) with AOE reveals; spatial placement of plant/TSF/infrastructure; pit pushbacks that eat tiles over time (the "don't sterilise your orebody" lesson). The v1 engine (RNG, JORC classifier, econ, debrief) carries over; the v1 cross-section renderer is retained unwired as a future section-view tool.

## D-013 · Map presentation: isometric ("angled plan")
**Decided:** 2026-07-04
Diamond-grid pixel tiles with elevation shading, drawn programmatically on Canvas 2D. ~1.5× the work of flat plan for a dramatically more game-like, shareable look.

## D-014 · One persistent company; share price is the career score
**Decided:** 2026-07-04
The player runs a single ASX-listed junior across many tenements. Cash, shares on issue, share price and market sentiment persist; market cap is the score. Announcements (straight vs. promotional), placements/dilution, and market news drive the price. Replaces the abstract "reputation" meta-score from D-001.

## D-015 · Rebuilt MVP slice: exploration + market
**Decided:** 2026-07-04
First playable of the new design = map gen, sampling ladder with AOE reveal, per-tile JORC classification heatmap, announcement choices, live share price + news feed, difficulty settings (Boom / Tight / Realistic — realistic is the hardest, that's the joke), gated hand-off to Feasibility. Later phases (studies, build placement, pushbacks) follow once this loop proves out.

## D-016 · Map-first UI: 30×30 grid, radial tile menu, everything on the map
**Decided:** 2026-07-04 (Tom's playtest feedback on the first tile build)
Grid drops 50×50 → 30×30 with much larger, higher-contrast tiles — readability by eye beats tenement scale. The whole game is played ON the map: no sidebar. Above the map only a stats strip (day, gold, cash, share price, market cap, sentiment) + corporate action buttons; below it a scrolling news ticker. Tapping a tile opens a radial menu of up to 4 context actions around the tap point (the sampling tools now; studies/infrastructure in later phases reuse the same pattern). This is also the mobile interaction model.

## D-017 · Radical simplification: plain English, one knowledge ladder, quarterly turns
**Decided:** 2026-07-04 (Tom: "make it super simple, for even the most dumb people")
- **Plain language everywhere.** Tools are "Soil Test / Shallow Drill / Deep Drill / Core Drill" — real terms (aircore, RC, diamond) live in tooltips only.
- **One knowledge view.** Terrain/Anomaly/Confidence overlays merge into a single always-on (toggleable) findings layer with one ladder: **Prospective → Inferred → Indicated → Measured** (violet → orange → yellow → green). Prospective absorbs the old anomaly heat.
- **Quarterly turn loop** (Game Dev Story cadence, authentic to ASX juniors): plan up to 4 field programs (rig slots), hit **Run Quarter** → everything resolves, ~90 days of market pass, then the **Quarterly Report** modal: results, an optional Reigns-style event card with a two-way choice, and the disclosure decision (straight / LOUD / say as little as possible — silence has a price too).

## D-018 · Feasibility phase design: consultant tiers, with the real firm as the in-joke
**Decided (design direction, build pending):** 2026-07-04
Feasibility = commissioning studies (metallurgy, geotech, water, permitting, mining) quarter by quarter, choosing a consultant tier per study: cheap ("a bloke from the pub with a spreadsheet") = fast/cheap but error-prone, triggers rework events and the market discounts the numbers; mid-tier = fine; **"The Good Consultants" = Tom's actual firm as a branded cameo** — dearer, accurate, catches fatal flaws early, market believes their numbers. The end screen turns the cameo into the business card: "The Good Consultants are real — [link]." The game's lead-gen CTA is diegetic.
