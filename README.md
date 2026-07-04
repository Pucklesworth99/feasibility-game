# Feasibility — A Mining Development Game

A browser-based game for a mining engineering consultant's portfolio site. You run a freshly listed gold junior with one randomly generated tenement: soil-sample and drill the hidden gold system (WA style), climb the JORC confidence ladder, manage your share price through announcements and placements — then take it to feasibility, site the plant, and mind the pushbacks. Authentic mining workflow underneath; isometric pixel land-management sim on top.

**Dual purpose:** demonstrate mining engineering expertise *and* AI-assisted development capability. The game itself is the portfolio piece.

## Status

🎮 **Full arc playable.** `npm install && npm run dev` → http://localhost:5199. Explore (quarterly turns, plain-English sampling ladder, findings ladder Prospective→Measured, event cards, disclosure choices) → Feasibility (five studies × three consultant tiers — Barry vs The Good Consultants) → Build (site plant/tailings/camp against the pit outline; the true pit settles the argument) → Reconciliation + the business-card CTA. Persistent listed company across tenements; market cap is the score. ~25 KB gzipped, zero servers.

⚠ Before going public: fill in the real firm name + URL in [src/core/branding.ts](../src/core/branding.ts).

## Project Map

| Document | Purpose |
|---|---|
| [docs/BRIEF.md](docs/BRIEF.md) | **The master brief** — feed this to the architect/build process. Full game design, locked decisions, open branches, requested deliverables. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log — what's locked, and why. |

## Hard Constraints (summary)

- **Zero-server, static-first.** Entire game runs client-side. Free-tier static hosting (Cloudflare Pages / GitHub Pages). No accounts, no database.
- **Featherweight.** Target < 2 MB initial load. Must be instantly playable on bad mine-site wifi — if it loads in the Pilbara, it loads anywhere.
- **Shareable without a backend.** Deterministic seeds make deposits shareable as challenge links; results export as PNG share cards for LinkedIn.
- **Authentic but translated.** Real JORC Code structure drives the mechanics; plain-language UI with real terminology in tooltips/expert mode.

## Next Steps

1. Architecture pass against `docs/BRIEF.md` → tech stack choice, data model, MVP scope.
2. Prototype the drill-reveal loop (the one mechanic everything depends on).
3. Playtest: is drilling holes and watching the orebody emerge fun on its own? If yes, build outward. If no, fix before anything else.
