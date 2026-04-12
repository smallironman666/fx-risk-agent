# ADR-002: V1 / V2 Oracle Coexistence (No Proxy Upgrade)

## Status
Accepted — April 12, 2026

## Context

After deploying `FXRiskOracle` (V1) and populating it with 10 historical alerts, we needed to extend the schema to include `agentTokenId` and `aiBackend` fields for the new Agent ID integration (see ADR-003).

V1 is not an upgradeable proxy. Three paths were possible:

1. Redeploy V1 + migrate state off-chain (lose history)
2. Deploy a proxy pattern now and upgrade to V2 implementation (future-proof but requires abandoning V1)
3. Deploy V2 at a new address; keep V1 running indefinitely for historical data

## Decision

**Deploy FXRiskOracleV2 at a new address. Keep V1 fully operational. Frontend reads from both and merges the timeline.**

## Alternatives Considered

### Alternative A: Proxy upgrade pattern
- **Pros**: Canonical Solidity engineering practice. Single contract address forever.
- **Cons**:
  - V1 was deployed without a proxy. Introducing one now requires abandoning V1 or re-deploying it as an implementation contract, either of which rewrites history.
  - Proxies add complexity (storage layout conflicts, admin functions, pausability) that are wasted on a 34-day hackathon project.
  - Narrative: "We upgraded contracts mid-hackathon" sounds like scope creep. "We evolved from V1 to V2 while preserving V1 audit history" sounds like production-grade discipline.

### Alternative B: Redeploy and abandon V1 data
- **Pros**: Simpler. Single contract to point at.
- **Cons**: Loses the 10 historical alerts that were part of the Checkpoint demo video. Judges who check the video against the final submission would see inconsistency.

### Alternative C: Coexistence with frontend merge
- **Pros**:
  - Zero data loss. The Checkpoint demo remains verifiable on V1.
  - Demo narrative: "V1 ran without Agent ID. V2 added accountable identity. Both are verifiable. The audit trail is continuous."
  - Frontend code is already structured to read arbitrary alert sources, so adding a V2 reader was mechanical.
- **Cons**:
  - Two contracts to monitor in the frontend. Each runs a separate `getLatestAlerts()` call per refresh.
  - Mental overhead: developers reading the repo need to understand why there are two oracle contracts.

## Consequences

**Positive**:
- Entire Checkpoint-era data remains visible, clickable, and verifiable in the Dashboard
- V2 can iterate without touching V1 state
- Frontend demonstrates "smooth evolution" which is a positive signal for production readiness
- If V2 has a bug, V1 keeps working as a fallback for reads

**Negative**:
- Two contract addresses to document in the README
- Frontend needs a `version: "v1" | "v2"` discriminator on alerts
- Slightly higher gas usage in frontend (two RPC calls instead of one per refresh)

**Mitigation**:
- README lists both contracts in a clear table with their roles
- Dashboard visually distinguishes V1 ("LEGACY" chip) and V2 (Agent # chip) alerts
- Future V3 (if needed) would follow the same pattern: deploy new, merge in frontend, never lose history

## Lessons

Proxy upgrades are worth the ceremony only when:
1. The contract governs active user funds that must remain at a stable address
2. Upgrade frequency is expected to be low (once a year)

Neither applies here. An oracle registry is an **append-only log** — deploying a new version and indexing both in the UI is both simpler and more honest than pretending it's a single "evolving" contract.
