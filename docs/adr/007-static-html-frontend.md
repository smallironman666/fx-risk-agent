# ADR-007: Single-File HTML + ethers.js Frontend (No React/Next.js)

## Status
Accepted — April 12, 2026

## Context

The project needs a dashboard to visualize agent activity. Judges will look at it during evaluation; it's also an important element of the demo video.

Three frontend stack options evaluated:

1. **Next.js + React + TypeScript + shadcn/ui** — the Web3 default choice
2. **Vite + React + TypeScript** — lighter alternative
3. **Single `index.html` + vanilla JS + ethers.js via CDN** — the "no build step" option

## Decision

Ship a **single `frontend/index.html` file** with vanilla JavaScript, ethers.js loaded from CDN, and all styles/scripts inlined.

The entire dashboard is deployed by copying one file to a Python `http.server` behind a systemd service.

## Alternatives Considered

### Alternative A: Next.js + React
- **Pros**:
  - Standard Web3 stack. All serious projects use this.
  - TypeScript types align with backend agent code
  - Good developer experience with hot reload, Tailwind, component libraries
- **Cons**:
  - Build step adds ~200 dependencies to the project
  - Deployment needs a Node.js runtime or static export + CDN (Vercel ideal, but yet another dependency)
  - For a dashboard that only reads 3 contracts and 1 Storage call, React's component model is overkill
  - Build time adds ~30s to every deploy cycle. For hackathon iteration speed, this compounds.

### Alternative B: Vite + React (no SSR)
- **Pros**: Same as Next.js but lighter
- **Cons**: Same deployment complexity. Still ~100+ dependencies. Still a build step.

### Alternative C: HTMX + server-side rendering
- **Pros**: Minimal JS, progressive enhancement
- **Cons**: Requires a server backend. We have a Python `http.server` only because it's the simplest static file server; running a Flask/Node backend for HTMX would be more work.

### Alternative D (chosen): Vanilla HTML + ethers UMD
- **Pros**:
  - Zero build step. Save file → copy to server → refresh browser.
  - Zero npm dependencies for the frontend
  - Entire UI fits in one ~900-line file that judges can skim
  - Deployment is `scp index.html user@server:` — doesn't get simpler
  - Works without a CDN if the user downloads ethers.js once
- **Cons**:
  - Manual DOM manipulation (no JSX). More code per feature than React.
  - No component system. Reuse is via functions, not composable components.
  - Limited CSS-in-JS conveniences

## Consequences

**Positive**:
- Total frontend code is one file the judges can open and read top-to-bottom
- Dashboard updates take 10 seconds from edit to live (`scp` + browser refresh)
- No security surface from transitive npm dependencies
- Loads in under 1 second over cellular (single 40KB HTML + ethers.js from jsDelivr CDN cache)
- Works in any browser without polyfills

**Negative**:
- Growing the UI beyond ~1500 lines would start to hurt. If we add more features (e.g., interactive charts, real-time WebSocket streams), we'd outgrow this approach.
- No type safety between Solidity events and the frontend's parsing (we manually maintain ABIs inline)
- Animation sophistication is limited compared to what a Motion-enabled React app could achieve

**Mitigation**:
- Current scope (3 contracts, ~30 alerts displayed, 1 Agent Passport card) is well within the "single file" sweet spot
- ABIs are short enough to inline; V1 and V2 ABIs are ~4 lines each
- If we outgrow this, the migration path is clear: extract the existing `renderTimeline()` / `renderPairCards()` functions into React components. The data flow is already one-directional.

## Lessons

For hackathons and MVPs, **"what a serious engineer would build in production"** is often not the right answer. The right answer is "what a serious engineer would ship in 3 days."

A single HTML file that works today beats a Next.js app that could theoretically be extended in 6 months.

The bias toward React is often about **perceived engineering sophistication** rather than actual user value. Judges who click the dashboard link don't care whether it's React or vanilla JS — they care whether the page loads fast, looks crafted, and shows the right data clearly. All three are easier to achieve without a build step than with one.
