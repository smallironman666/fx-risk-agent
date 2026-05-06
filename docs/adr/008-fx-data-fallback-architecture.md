# ADR-008: Four-Tier FX Data Source Fallback Architecture

## Status
Accepted — May 6, 2026

**Supersedes (in part):** [ADR-005: Simulated FX Data for MVP, Real API Deferred to V2](./005-simulated-fx-data.md)

## Context

ADR-005 deferred real FX data to a "V2" because the MVP needed architectural completeness without external dependencies. After Checkpoint and during the workshop on April 16, 2026, Dragon (0G Labs APAC DevRel Lead) flagged the simulator as the single largest gap in the project's credibility:

> "If you can connect at least one real API, that would be a huge plus."

Three independent forces then converged on the same answer:

1. **Demo Day evaluators** look for "is this connected to real markets" before they read any code. A `FX_SIMULATOR` source label on every alert kills the narrative.
2. **EU AI Act / DORA compliance angle** — the project's "auditable AI" narrative requires real, verifiable inputs. Synthetic data undermines the pitch about "what did the Agent know at time T."
3. **Chainlink Data Streams partnership** — Dragon confirmed on April 17 that Data Streams is the *correct* primitive for this use case ("event-driven pricing, not regular push updates"). This opens a path to sub-second, on-chain-verifiable market data on Aristotle mainnet.

A single real-data source would address (1) but introduces failure modes that work against (2): a downed API mid-incident is exactly the moment the audit trail must not gap. The architecture has to reflect the seriousness of the use case.

## Decision

Adopt a **four-tier data source fallback** in `src/data/fxRealData.ts`:

```
┌────────────────────────────────────────────────────────────────┐
│  L0  Chainlink Data Streams                                    │
│      (sub-second, event-driven, on-chain-verifiable)           │
│      Status: integration code ready; awaiting API credentials  │
├────────────────────────────────────────────────────────────────┤
│  L1  fawazahmed0 / jsDelivr CDN                                │
│      (200+ currencies, daily updates, no auth)                 │
│      Status: live                                              │
├────────────────────────────────────────────────────────────────┤
│  L2  Frankfurter API (ECB + 40 central banks)                  │
│      (regulatory-grade reference, daily updates, no auth)      │
│      Status: live                                              │
├────────────────────────────────────────────────────────────────┤
│  L3  Local cache (last successful fetch on disk)               │
│      Status: live, defensive                                   │
└────────────────────────────────────────────────────────────────┘
```

**Routing rules** (`fetchRealRates()` in `fxRealData.ts`):

1. If `CHAINLINK_API_KEY` and `CHAINLINK_FEEDS` are set → try L0; on failure or partial result, fall through.
2. Else / on L0 failure → try L1; on failure, fall through.
3. On L1 failure → try L2; on failure, fall through.
4. On L2 failure → return L3 cache and emit a `cache-aged` warning into the DecisionLog.
5. If even L3 is empty, the agent surfaces the error rather than silently fabricating data.

**Why each layer is necessary, not just nice-to-have:**

- **L0 (Chainlink)** is the only layer that produces an *on-chain-verifiable* price. When the agent eventually consumes Data Streams, the Verifier Proxy contract on Aristotle can prove the price report came from the DON. This is the real production answer for compliance.
- **L1 (fawazahmed0)** is the workhorse during testnet. CDN-served static JSON, no auth, ~99.9% available, daily granularity is sufficient for risk-band classification. Acts as the primary source today and as a fast-failover layer once L0 lands.
- **L2 (Frankfurter / ECB)** is the regulatory-grade fallback. When auditors ask "where did this price come from when L1 was down" the answer is "the European Central Bank reference rate." That is a defensible answer in front of a regulator.
- **L3 (local cache)** keeps the agent producing decisions during a network partition. The DecisionLog is explicit when L3 was used, so degraded operation is visible in the audit trail rather than hidden.

The `RealDataSource` discriminator (`"chainlink-ds" | "fawazahmed0" | "frankfurter" | "local-cache"`) is propagated all the way to:

1. The DecisionLog JSON stored on 0G Storage (`assessment.quotes[0].source`).
2. The Dashboard (`inferDataSourceBadge()` lazy-loads each alert's DecisionLog and shows a badge).

This gives evaluators a one-glance answer to "did this come from real data and which tier?"

## Alternatives Considered

### Alternative A: Single source — Chainlink Data Streams only, full stop

- **Rejected**: forces all alerts to wait on a single SLA. Data Streams API access on testnet is not yet provisioned (as of writing); even after provisioning, an outage on Chainlink's side would gap the audit trail. The architecture's whole pitch is "auditable risk decisions" — the data side has to match the durability of the storage side (0G Storage with rootHash) and the chain side (V2 contract).

### Alternative B: Two sources — fawazahmed0 + ECB, no Chainlink layer

- **Rejected**: works for testnet but does not scale the credibility. Both are off-chain HTTP APIs with no cryptographic provenance. Without an on-chain-verifiable layer the project leaves a major 0G Network ecosystem play (Chainlink integration on Aristotle) on the table.

### Alternative C: Continue with `FX_SIMULATOR` until mainnet, then switch

- **Rejected**: directly contradicts Dragon's workshop feedback and weakens the Checkpoint→Final narrative. Real data on testnet is the highest-ROI single change available and was implemented in approximately one engineer-day.

### Alternative D: Three-tier without local cache (L3)

- **Rejected**: the cache exists specifically for the "everything offline at once" case, which is rare but not zero (consider corporate firewall + DNS issue + provider outage cluster). The cost of L3 is one file write per successful fetch — negligible — and the benefit is "the agent never returns a 500." A regulator's first question after an incident is "did your system stop?"; "no, it served degraded but logged the degradation" is a much better answer than "yes."

## Consequences

**Positive**

- Every Dashboard alert post-2026-04-17 carries a real-source badge. The shift from `FX_SIMULATOR` to `LIVE · fawazahmed0` is visible to anyone scrolling the timeline.
- ADR-005's deferral is closed out before the final submission, removing a known weakness.
- The L0 hook is implemented and tested in `chainlinkDataStreams.ts`; activating it is a `.env` change once Chainlink GTM issues credentials.
- The fallback chain is observable: each layer emits a `[Data] L<n> <source> failed: ...` warning, so production failures are visible in logs without breaking decisions.

**Negative**

- Four sources means four failure modes to reason about. Mitigated by uniform interface (`fetchRealRates(): Promise<RealRatesResult>`) and end-to-end smoke tests.
- Dependency on `@chainlink/data-streams-sdk` adds an npm dep (~6 packages) for a layer that is not yet active on testnet. Acceptable cost given that activating L0 is the primary path post-mainnet.
- The simulator (`src/data/fxSimulator.ts`) is retained for the `crisis` scenario in demo videos. Two parallel data systems coexist; care must be taken not to confuse them in code reviews.

**Neutral / Future Work**

- L0 activation post-Aristotle migration. Tracked separately in the Mainnet migration plan.
- A future ADR may collapse the simulator into L4 ("synthetic stress-test layer") so the demo scenarios live in the same architectural framework as production data. Not blocking for the May 16 submission.
