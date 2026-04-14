# From SWIFT to Smart Contracts: Building a Verifiable AI FX Risk Agent on 0G

*How 5 years of cross-border payment experience shaped my submission to the 0G APAC Hackathon — and why "Verifiable AI" is the next frontier in financial compliance.*

---

## The Moment That Started It All

I've spent the last 5 years building cross-border payment infrastructure. FIX 4.4 protocol. SWIFT MT103 messages. ISO 20022 camt.052 reports. The kind of work where a misplaced decimal point costs millions.

In the past two years, AI started making more and more of our decisions. Risk scoring. Fraud detection. FX exposure analysis. But every time something went wrong — a channel returned an inverted currency pair (USD/ZAR=16 instead of ZAR/USD=0.06, a 260x error), a reference rate feed went down — the same question came up:

> **"What did the system know, when did it know it, and what did it decide?"**

And every time, the answer was buried in a mix of logs, Slack messages, and retrospective guesses. There was no **unified, tamper-proof audit trail for AI decisions**.

This is the problem EU AI Act enforcement (August 2026) tries to solve with regulation. I wanted to solve it with architecture.

## Meet FX Risk Agent

Built in 3 days for the **[0G APAC Hackathon](https://www.hackquest.io/hackathons/0G-APAC-Hackathon)** — Track 2: Verifiable Finance.

**Core idea**: An autonomous AI agent that monitors FX markets, makes risk judgments, and records **every single decision** on-chain, with full reasoning stored permanently on 0G Storage.

```
FX Market Data → AI Analysis → Decision Log (0G Storage)
                                        ↓
                          Risk Alert (0G Chain with rootHash)
                                        ↓
                          Agent State Update (INFT inferenceCount++)
```

**The verification chain anyone can run**:
1. Pull any `AlertCreated` event from 0G Chain
2. Extract the `storageRootHash` field
3. Download the full AI reasoning JSON from 0G Storage using that hash
4. Verify the AI's judgment matches the market data at that moment

No permission needed. No one can alter what's been written.

## Why 0G, Specifically?

I evaluated Ethereum L2s, Solana, Polygon. Ended up on 0G for four reasons:

| Need | 0G Component | What Traditional Chains Can't Do |
|---|---|---|
| Store full AI reasoning (JSON with 1-2KB per decision) | **0G Storage** | Ethereum calldata costs $50+ per KB. Unsustainable. |
| Link on-chain events to off-chain logs | **0G Chain** (EVM) | Standard EVM, so my Solidity skills transfer directly |
| AI-as-an-asset identity | **Agent ID (ERC-7857)** | No mature INFT standard on other chains |
| Confidential inference | **0G Compute (TEE)** | No other chain has native Sealed Inference |

0G is built for this exact use case — **"AI is a first-class citizen, not a bolt-on"**.

## Architecture Walkthrough

### Layer 1: AI Inference (Dual Backend)

The most interesting architectural choice was **dual AI backends**, toggleable via `.env`:

```typescript
// src/agent/llm/factory.ts
export function createLLMBackend(): LLMBackend {
  const kind = process.env.AI_BACKEND || "doubao";
  if (kind === "0g-compute") return new ZgComputeBackend();
  return new DoubaoBackend();
}
```

- **`doubao`**: ByteDance's Doubao Seed 2.0 Pro via OpenAI-compatible API. Fast, high-quality reasoning. Used for demo.
- **`0g-compute`**: 0G Compute Network with TEE-backed inference. Every response is cryptographically signed inside a hardware enclave. This is what makes strategy-level confidentiality possible.

For the hackathon demo, I default to Doubao for quality. For production use cases where **front-running prevention** matters (trading strategy execution), switch to `0g-compute` and the entire inference pipeline becomes tamper-proof.

### Layer 2: On-Chain Audit Trail (V1 + V2 Coexistence)

I deployed **two versions** of the oracle contract:

- **V1** (`0x12030bc3...`): Simple alert registry. Kept for historical continuity.
- **V2** (`0x2ddfe566...`): Adds `agentTokenId` and `aiBackend` fields per alert.

```solidity
// contracts/FXRiskOracleV2.sol
function submitAlert(
    string calldata currencyPair,
    RiskLevel level,
    uint256 spotRate,
    uint256 threshold,
    bytes32 storageRootHash,
    uint256 agentTokenId,      // ← NEW: links to Agent INFT
    string calldata aiBackend   // ← NEW: "doubao" or "0g-compute"
) external;
```

**Design decision**: Why not use a proxy pattern to upgrade V1 in-place?

Because the demo story is stronger with both contracts live. The frontend shows a unified timeline with V1 alerts gracefully labeled as "pre-Agent-ID" and V2 alerts carrying full Agent badges. It communicates **evolution**, not just features.

### Layer 3: Agent Identity (ERC-7857 INFT)

This is where it gets interesting. The agent itself is an on-chain asset:

```solidity
// contracts/FXRiskAgentINFT.sol
function mintAgent(
    address to,
    string calldata agentName,
    string calldata version,
    string calldata modelType,
    bytes32 storageRootHash    // points to full agent metadata JSON
) external returns (uint256);

function updateAgentState(
    uint256 tokenId,
    bytes32 newStorageRootHash
) external;  // increments inferenceCount
```

Every session, the agent calls `updateAgentState()` with a session summary:
- Which pairs were analyzed
- Which backend was used
- Which decision logs were generated

The on-chain `inferenceCount` becomes a **verifiable performance counter**. Long-term, this enables:
- **Reputation scoring** — "This agent has made 10,000 verified inferences with 95% accuracy"
- **Marketplace economics** — INFTs can be transferred, licensed, monetized
- **Regulatory clarity** — `getAgent(tokenId)` exposes model version, creator, metadata provenance

Think of it as the agent's **passport + resume + license plate**, all rolled into one.

### Layer 4: Verifiable Risk Cockpit (Frontend)

The dashboard is a single-file vanilla HTML + ethers.js app. No Node.js server, no build step. Deploys anywhere a static file server runs.

Key design goal: **show the verification chain visually**. Every V2 alert displays:
- Risk level badge (color-coded)
- Agent #0 chip (links to Agent INFT)
- Backend chip (`doubao` or `0g-compute`)
- Storage rootHash (click to verify on StorageScan)
- Chain tx link (click to verify on ChainScan)

The audit trail becomes **interactive**. Regulators can click through in real time.

## Building With an AI Coding Agent

Here's the meta-story: **I built an AI agent with an AI coding assistant.**

I used [Claude Code](https://claude.com/claude-code) as my pair programmer for the entire build. For a solo builder competing against teams, this wasn't optional — it was the difference between shipping and not.

A typical exchange looked like this:

> **Me**: "I need to integrate 0G Compute into the existing AI analyzer. Keep Doubao as default so demo quality doesn't regress. Design a clean strategy pattern."
>
> **Claude Code**: *Creates `src/agent/llm/` with types.ts, doubaoBackend.ts, zgComputeBackend.ts, factory.ts. Refactors analyzer.ts to accept the backend as a parameter. Updates .env.example. Verifies TypeScript compiles.*

The 14-hour estimate for "integrate 0G Compute + Agent ID" collapsed to **3 hours of focused work** because:
- Code generation was instant
- SDK integration (reading `@0glabs/0g-serving-broker` type defs) was automated
- Bug hunting happened through compile cycles, not manual reading

**Key insight**: AI coding agents don't replace architectural thinking — they accelerate the implementation layer. I still made every design decision. The AI filled in the code after I committed to a direction.

## Critical Design Decisions

### Why ERC-7857 (not ERC-721)?

ERC-7857 extends NFT with **encrypted metadata that can be re-encrypted on transfer**. For a financial agent whose system prompt + thresholds are valuable IP, this matters. ERC-721 would expose everything.

### Why store every decision (including LOW risk)?

At first I only stored HIGH/CRITICAL. Then I realized: **the absence of an alert is itself evidence**. If the AI judged "LOW" at 10:00 and the market crashed at 10:30, regulators need to see that LOW judgment — because it reveals whether the AI was wrong or the data was wrong.

Audit trails that only log alarms are not audit trails. They're marketing.

### Why preserve V1 alongside V2?

Throwing away data is a red flag to auditors. "We lost our historical records during the upgrade" is not an acceptable answer. V1 stays, V2 adds, the system tells a continuous story.

## What I Learned

1. **Verifiable ≠ Transparent ≠ Public**. These are three different properties. Verifiable AI needs cryptographic proof that the output came from the claimed input through a specific model version. It doesn't need the inputs/outputs to be public (that's privacy). It doesn't need humans to read everything (that's transparency).

2. **The hardest part wasn't code**. It was deciding which 0G components to integrate (Storage/Chain — obvious; Compute — yes, dual-mode; Agent ID — yes; Privacy/TEE — no, wrong fit for audit use case). Every "yes" is a commitment. Every "no" is a focused scope.

3. **"Financial AI" and "trading AI" need opposite properties**. Financial compliance needs transparency and auditability. Trading strategy needs confidentiality. I chose compliance. That choice shaped everything downstream.

4. **Infrastructure tokens are a real bottleneck**. 0G Compute requires 3+ OG to fund the broker ledger. Galileo faucet gives 0.1/day. That's a 30-day wait for a tool that takes 3 hours to integrate. Real-world hackathon friction.

## What's Next

- **Mainnet migration** before final submission (May 16, 2026)
- **Real FX data source** (Alpha Vantage or Twelve Data) replacing simulator
- **TEE Sealed Inference** on mainnet for strategy confidentiality
- **Multi-agent collaboration** — per-corridor agents (USD/CNY, EUR/USD, etc.)
- **Dashboard v2** — Agent passport redesign, real-time inference streaming

## Final Thoughts

Financial regulators are about to demand what AI providers can't currently deliver: **provable evidence of what an AI did, when, and why**. The EU AI Act in August 2026 is just the starting gun.

Chains like 0G — designed specifically for AI, not retrofitted from generic L1s — are positioned to be the substrate for this new compliance layer. Not because blockchains are magical, but because:

1. Cryptographic immutability is cheaper than legal attestation
2. Public verifiability beats trusted third parties for cross-border disputes
3. Tokenized AI identity (INFTs) creates accountability without centralized registries

The gap between "AI makes decisions" and "AI decisions are auditable" is vast. Projects like FX Risk Agent are a concrete step into that gap.

---

## Try It Yourself

🐙 **GitHub**: [github.com/smallironman666/fx-risk-agent](https://github.com/smallironman666/fx-risk-agent)
📹 **Demo Video**: [youtu.be/j2eaoJN18a8](https://youtu.be/j2eaoJN18a8)
📊 **Live Dashboard**: [fx.0xsmall.com](http://fx.0xsmall.com)

**On-chain verification**:
- FXRiskOracleV2: [`0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca`](https://chainscan-galileo.0g.ai/address/0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca)
- Agent INFT: [`0xAA540f42f0d20588f183E3B92B3b617991fa22D1`](https://chainscan-galileo.0g.ai/address/0xAA540f42f0d20588f183E3B92B3b617991fa22D1)

---

*Built by [@0xSmallironman](https://x.com/0xSmallironman) for the 0G APAC Hackathon. 5 years of cross-border payment infrastructure experience (FIX 4.4, SWIFT MT103, ISO 20022). Currently exploring AI × Web3 at the intersection of compliance and verifiable computation.*

*If you're building at this intersection or hiring for it, [DM me on X](https://x.com/0xSmallironman).*
