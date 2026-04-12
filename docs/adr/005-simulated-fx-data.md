# ADR-005: Simulated FX Data for MVP, Real API Deferred to V2

## Status
Accepted — April 12, 2026

## Context

FX Risk Agent analyzes foreign exchange market data. Real data sources exist:
- **Alpha Vantage** — 25 free calls/day, real-time FX
- **Twelve Data** — 8 calls/minute free tier
- **Exchange Rate API** — 1500 calls/month free
- **Polygon.io** — Paid, professional grade

Each comes with constraints: rate limits, API keys to manage, potential outages, and most only update every few minutes.

For a 3-day MVP targeting a Checkpoint submission, the priority was **architectural correctness of the end-to-end pipeline**, not data authenticity.

## Decision

Use a **seeded pseudo-random FX simulator** in `src/data/fxSimulator.ts` with three scenarios:

- `normal`: ±0.2% random walk around base rate
- `volatile`: ±0.6% random walk
- `crisis`: ±1.6% random walk with directional drift

Base rates match real market values (USD/CNY 7.25, EUR/USD 1.08, GBP/USD 1.26, USD/JPY 152.5) as of early 2026.

This lets us:
1. Demonstrate the **full pipeline** — market data → AI → Storage → Chain — without network dependencies
2. Generate **HIGH/CRITICAL scenarios** on demand for demo videos (hard to catch real crises)
3. Keep the demo reproducible — judges running the project get the same quality experience regardless of time of day

The simulator is isolated behind a module boundary. Swapping in a real API is a one-file change.

## Alternatives Considered

### Alternative A: Alpha Vantage from day 1
- **Pros**: Authentic demo. "Real market data." Stronger judging perception.
- **Cons**:
  - 25 free calls/day is tiny. A 4-pair monitoring agent running every hour needs 96 calls/day.
  - During demo recording, if the market is calm, we'd never see a HIGH/CRITICAL alert — the demo would be all LOW, which undersells the product.
  - Adds an API key dependency that judges would need to replicate to verify the code.

### Alternative B: Cached historical data
- **Pros**: Real data without API rate limits. Deterministic replay.
- **Cons**:
  - Sourcing historical tick data requires a paid provider or scraping
  - Still doesn't solve the "guaranteed interesting scenario" problem for demos
  - Would need to pick a specific week of history, which may or may not include interesting movements

### Alternative C: Hybrid (simulator + optional live mode)
- **Pros**: Best of both worlds
- **Cons**: Premature complexity. Not needed for Checkpoint scope.

## Consequences

**Positive**:
- Demo videos always include a CRITICAL alert (run with `--scenario crisis`). Visual impact maintained.
- Zero external dependencies. Judges can clone the repo, run `npm run agent`, and see the full flow without API keys.
- Pipeline tests in `test/ts/analyzer.test.ts` work against the simulator — no flaky network-dependent tests.
- The simulator is 117 lines; swapping for a real adapter is under 50 lines of new code.

**Negative**:
- We can't honestly claim "production-ready" because production needs a real data feed.
- Hackathon evaluators who read carefully will note this as a limitation (we do call it out explicitly in `Known Limitations`).

**Mitigation**:
- README has a `Known Limitations` section that lists "FX data is currently simulated" as the first item
- Roadmap explicitly tracks "Real FX data feed (Alpha Vantage / Twelve Data)" as the next milestone
- `src/data/fxSimulator.ts` exports `generateHistoricalQuotes()` and `generateMarketSnapshot()` — the same shape a real adapter would return, so the interface contract is already defined

## Lessons

For hackathon MVPs, **the question is not "is this production-realistic?" but "does this demonstrate the architecture I'd build in production?"**.

A fake data source that produces deterministic, visually interesting demos is more useful than a real data source that shows `LOW` alerts every single time you press record.

The real feed integration will happen post-Checkpoint once we've proven the pipeline works end-to-end.
