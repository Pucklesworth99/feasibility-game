# Architecture

## Stack (per D-011)

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Instant dev server, tiny static output, zero config. `base: './'` so the bundle works from any path on any static host. |
| The Ground | **Canvas 2D** (hand-rolled pixel renderer) | A cross-section grid with drill reveals needs no engine. PixiJS/Phaser would add 100–400 KB for nothing we use. |
| The Boardroom | **Vanilla DOM + CSS** | Tables, bars, and panels. No framework debt; Preact (3 KB) is the escape hatch if phase 2–4 UI gets genuinely complex. |
| Sim core | **Pure TypeScript modules** | Deterministic, framework-free, unit-testable. The same engine runs casual and expert tiers (D-003). |
| Runtime deps | **None** | Bundle target well under 100 KB gzipped. |

## Module Map

```
src/
├── main.ts            — app wiring: state, input, HUD updates, phase flow
├── style.css          — dark theme, gold accents, "Boardroom" panels
├── core/              — deterministic sim, no DOM imports anywhere
│   ├── rng.ts         — seed hashing (xmur3) + mulberry32 PRNG + value noise
│   ├── deposit.ts     — seeded orebody generation (lenses, grade field, archetypes)
│   ├── estimate.ts    — resource estimation from drill holes + JORC classification
│   └── econ.ts        — financing verdict, NPV model, outcome vs. estimate, debrief rules
└── ui/
    └── ground.ts      — Canvas renderer: fog of war, grade ramp, rigs, confidence overlay
```

**The golden rule:** everything in `core/` is a pure function of `(seed, player actions)`. No `Date.now()`, no `Math.random()`, no DOM. This is what makes seed challenges (D-006) and save codes (D-010) trivially correct — replaying the same inputs always rebuilds the same world.

## Determinism & Seeds

- Seed string (e.g. `KALGOORLIE-4471`) → xmur3 hash → mulberry32 PRNG → deposit. Same seed = identical orebody on every device, forever.
- Seeds read from `?seed=` URL param; generated seeds use mining-district names for flavour.
- Weekly challenge (later) = seed derived from ISO week number. No server.

## Save Codes (career persistence, post-MVP)

`FSB1.` + base64url(deflate(JSON of {version, reputation, unlocks, activeRun{seed, holes[], phase, budget}}))

- localStorage for auto-resume on the same browser.
- The text code is the cross-device mechanism — copy it out, paste it in. Versioned prefix so old codes survive updates.
- An active run stores *actions*, not world state — tiny codes, and the deterministic core rebuilds everything.

## Rendering

- Fixed internal resolution (grid × 8 px), CSS-scaled with `image-rendering: pixelated` — crisp pixels at any screen size, one canvas, no sprite assets (rigs and ground are drawn programmatically).
- Redraw on state change + a rAF loop only while a drill animation is live.

## JORC Model (prototype fidelity)

- Truth: 2D grade field (g/t Au) on a ~110×64 grid, 10 m cells.
- Drilling reveals true grades down a column. Estimation = inverse-distance weighting from drilled columns.
- Classification by proximity to data (translated from real drill-spacing practice):
  - **Measured** — ≤ 20 m from a hole *and* a second hole within 50 m (continuity confirmed)
  - **Indicated** — ≤ 50 m from a hole
  - **Inferred** — ≤ 100 m (extrapolation)
- Financing gate: lenders want ≥ 60 % of ounces in Measured+Indicated, a minimum ounce count, and positive projected NPV.
- Outcome: the mine runs on the *truth* field inside the classified envelope — estimate error becomes the consequence beat, and feeds the rule-based debrief.

## Deployment

Repo → GitHub → Cloudflare Pages (or GitHub Pages) auto-deploy on push. `npm run build` → `dist/` static output. Custom domain via CNAME. Zero monthly cost.
