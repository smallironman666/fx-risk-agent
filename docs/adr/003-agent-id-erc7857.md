# ADR-003: Tokenize Agent Identity as ERC-7857 INFT

## Status
Accepted — April 12, 2026

## Context

Every AI decision our agent makes is recorded on-chain with full reasoning stored on 0G Storage. But **who is the agent**?

Without an explicit identity, every alert is signed only by a wallet address. This creates problems:
1. **No versioning**: Which system prompt was used? Which model version? If the agent is updated, there's no way to tell "this alert came from v0.1 vs v0.2".
2. **No reputation**: Long-term performance can't be tracked — "this agent has made 10k inferences with X accuracy".
3. **No accountability**: Regulators want to know "which specific agent made which decision". A raw wallet address is not enough.
4. **No tradeability**: If the agent becomes valuable (e.g., proven accuracy over time), it can't be transferred or licensed without moving the entire wallet's assets.

0G Labs is actively promoting **ERC-7857 (Intelligent NFT / INFT)** as the standard for AI agent identity in their ecosystem.

## Decision

Deploy `FXRiskAgentINFT` — a minimal ERC-721-based contract inspired by ERC-7857 — that tokenizes the agent's identity.

Core design:

```solidity
struct AgentMetadata {
    string    agentName;
    string    version;
    string    modelType;
    bytes32   storageRootHash;   // pointer to full metadata JSON on 0G Storage
    uint256   createdAt;
    address   creator;
}

mapping(uint256 => AgentMetadata) public agentMetadata;
mapping(uint256 => uint256) public inferenceCount;

function mintAgent(...) external returns (uint256);
function updateAgentState(uint256 tokenId, bytes32 newStorageRootHash) external;  // increments inferenceCount
```

Integration:
- **Mint once** at bootstrap time. `tokenId=0` represents "FX Risk Agent v0.2.0".
- **Update state** after every agent session — writes a new session summary rootHash and increments `inferenceCount`.
- **Every alert** on `FXRiskOracleV2` now carries `agentTokenId`, linking it back to the INFT.

## Alternatives Considered

### Alternative A: Off-chain agent registry
- Maintain a simple JSON file or database mapping agent IDs to metadata.
- **Rejected**: Defeats the entire verifiability narrative. Off-chain data is mutable.

### Alternative B: Stamp agent version in the alert contract directly
- Add `string agentVersion` column to `FXRiskOracleV2`.
- **Rejected**: Versioning alone is not identity. Misses the tradeability/ownership benefits. Also couples the oracle to agent metadata, violating separation of concerns.

### Alternative C: Use vanilla ERC-721 (no ERC-7857)
- Standard NFT with tokenURI pointing to metadata.
- **Rejected**: Works but misses the narrative alignment with 0G's ecosystem direction. ERC-7857 adds the `updateAgentState()` primitive which is exactly what we need for `inferenceCount`.

### Alternative D: Full ERC-7857 with encryption + re-encryption on transfer
- **Rejected**: Scope creep. Transfer flow with oracle-based re-encryption is a hackathon-killer. Our MVP doesn't need transferable privacy.

## Consequences

**Positive**:
- Every on-chain alert on V2 now links to a specific Agent tokenId → full provenance
- `inferenceCount` is a provable performance metric. "Agent #0 has made N inferences" is queryable with a single contract call.
- Sets up future features: agent licensing, reputation scoring, multi-agent coordination
- Matches 0G's ecosystem direction (ERC-7857 is a featured standard in their docs)
- Scoring alignment: `Agent ID` is one of four 0G components highlighted in the hackathon evaluation criteria

**Negative**:
- Extra gas per agent session: one `updateAgentState()` call per run, ~45k gas
- Extra contract to maintain
- Slight frontend complexity: Dashboard now reads three contracts (V1, V2, INFT) instead of one

**Mitigation**:
- `updateAgentState()` happens once per session, not per inference → batched gas cost
- The Agent Passport UI makes the extra data feel valuable, not burdensome

## Lessons

The INFT model draws a clean line between three concepts:

| Concept | Lives In |
|---------|----------|
| **Who made the decision** | `FXRiskAgentINFT` (identity) |
| **What was decided** | `FXRiskOracleV2.RiskAlert.level` |
| **Why it was decided** | `0G Storage` (full reasoning JSON, referenced by `rootHash`) |

Keeping these three orthogonal pays dividends when the system scales — multi-agent support, reputation-based trading, regulatory queries all become natural extensions rather than refactors.
