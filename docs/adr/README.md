# Architecture Decision Records (ADR)

This directory captures the **why** behind key architectural choices in FX Risk Agent.
Each ADR documents a decision, its context, the alternatives considered, and the consequences.

## Index

| # | Title | Status |
|---|-------|--------|
| [001](./001-dual-ai-backend.md) | Dual AI Backend (Doubao + 0G Compute) instead of single | Accepted |
| [002](./002-v1-v2-coexistence.md) | Deploy V2 oracle alongside V1 instead of proxy upgrade | Accepted |
| [003](./003-agent-id-erc7857.md) | Tokenize agent identity as ERC-7857 INFT | Accepted |
| [004](./004-skip-tee-privacy.md) | Do NOT integrate Privacy/TEE for audit use case | Accepted |
| [005](./005-simulated-fx-data.md) | Use simulated FX data for MVP, defer real API to V2 | Superseded (in part) by [008](./008-fx-data-fallback-architecture.md) |
| [006](./006-foundry-over-hardhat.md) | Use Foundry instead of Hardhat for Solidity tooling | Accepted |
| [007](./007-static-html-frontend.md) | Single-file HTML + ethers.js instead of React/Next.js | Accepted |
| [008](./008-fx-data-fallback-architecture.md) | Four-tier FX data source fallback (Chainlink → fawazahmed0 → ECB → cache) | Accepted |

## Format

Each ADR follows this template:

```
# ADR-NNN: Short Title

## Status
Accepted | Superseded | Deprecated

## Context
What situation forced this decision?

## Decision
What did we decide?

## Alternatives Considered
What else did we evaluate and why did we reject it?

## Consequences
What are the positive and negative results of this decision?
```
