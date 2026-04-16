# From SWIFT to Smart Contracts: Building Verifiable AI Risk Infrastructure on 0G

> What I learned building the first fully on-chain AI decision trail for cross-border payments — and why the "Memory as Asset" thesis actually works in production.

---

## The Problem No One Talks About

Cross-border payment companies process billions in FX transactions every day. Between the moment an order is placed and settlement completes — the T+0 to T+2 window — exchange rates move, sometimes violently. A three-pip drift on a ¥10M remittance is $23,000 of margin evaporated.

Modern treasury desks deploy AI models to watch these windows. That part isn't new. What *is* new is the question I started asking after several years inside cross-border infrastructure:

**When the audit team shows up six months later asking "what exactly did your AI know at 14:32:06 on the day everything went sideways?" — can you actually answer?**

In almost every case today: **no**.

The reasoning lives in conversation histories on OpenAI's servers. The recommendation is in a Slack message someone screenshotted. The confidence score is in a log file that rotated out 90 days ago. The prompt got patched three times since then. If the AI was wrong, you can't prove what it *believed* when it was wrong. If it was right, you can't prove it was the AI's doing and not a lucky guess.

This is the audit problem that every AI-in-finance pitch glosses over. **"AI makes decisions"** and **"AI decisions are auditable"** are separated by a chasm, and the chasm is where compliance, trust, and capital allocation all fall in.

## What "Verifiable AI" Actually Means

The standard answer from Web3 is "put AI on-chain." That phrase usually means one of:

1. **On-chain inference** — run the model itself inside a smart contract. Cute, doesn't scale, expensive on gas, and most useful models don't fit.
2. **Oracle-fed outputs** — an off-chain AI computes, an oracle signs the result, the signed value lands on-chain. Better, but now you're trusting the oracle operator not to lie about what ran off-chain.
3. **ZK-proven inference** — proves the computation was performed correctly. Elegant, but today's state of the art can prove small models at hobbyist scale.

None of these answer the real audit question. They prove the AI *did* something, not what the AI *thought*.

The answer I converged on, after a weekend of whiteboarding:

**Verifiability is not about the computation — it's about the provenance of the reasoning.**

You don't need to re-run the AI. You need to cryptographically commit to the *complete* decision artifact — the prompt, the model metadata, the reasoning chain, the confidence, the recommendation, the source data snapshot — at the moment the decision was made. And you need a way for any third party, months later, to retrieve that exact artifact and verify it hasn't been tampered with.

That's the architecture FX Risk Agent is built around.

## The Four 0G Components, Each Doing Exactly One Job

What took me a while to appreciate about 0G's stack is that it's the **first L1 where all four primitives you need for verifiable AI exist on the same chain**:

### 1. 0G Storage — The Reasoning Archive

Every time the agent runs, it produces a `DecisionLog` JSON containing:
- Currency pair, spot rate, breach threshold
- The complete AI reasoning (several paragraphs of natural language)
- Recommendation, confidence score, risk level
- Prompt/completion token usage
- Model identity, AI backend, optional TEE verification receipt
- Session ID, agent ID, timestamp

This JSON is uploaded to 0G Storage. The upload produces a **rootHash** — a Merkle commitment to every byte of the decision. The rootHash is what gets recorded everywhere else.

This matters more than it sounds. The rootHash is the fingerprint of the *exact* AI reasoning at that exact moment. Change a comma in the reasoning field, the rootHash changes. Anyone retrieving the rootHash later gets back byte-for-byte what the AI actually produced.

### 2. 0G Chain — The Alert Registry

On top of 0G Storage, I deployed `FXRiskOracleV2`, a Solidity contract that records every risk alert as an on-chain event. Each event carries:
- Currency pair, risk level, spot rate, threshold
- The Storage rootHash (linking back to the full reasoning)
- The `agentTokenId` of the AI agent that produced the alert
- The `aiBackend` identifier

Critically, `submitAlert` is access-controlled: only the owner of the agent's INFT can submit an alert attributed to that agent. This closes the most common impersonation vector — anyone can read the public contract, but only the legitimate Agent identity can write.

### 3. 0G Compute — The Verifiable Inference Layer

For the AI itself, I use a **dual-backend pattern**. Production path: 0G Compute (Qwen 2.5 7B running inside a TEE-attested provider, accessed through `@0glabs/0g-serving-broker`). Fallback path: Volcano Ark's Doubao model. Both return results into the same `LLMBackend` interface; the wrapper decides.

When 0G Compute responds, the response includes a TEE attestation — the provider has cryptographically asserted the response was produced by the claimed model inside a secure enclave. That attestation gets embedded in the DecisionLog JSON that goes to 0G Storage. Anyone downloading the decision log can verify the TEE signature independently.

When the TEE path fails, we silently fall back to Doubao and **record the fallback reason directly in the DecisionLog**. The on-chain `aiBackend` field tells you which backend actually produced the result. No ghosts in the machine.

### 4. Agent ID (INFT, ERC-7857 inspired) — The Accountable Entity

Here's the piece that made the whole architecture click for me: **the AI agent is itself a tokenized, owned, accountable entity on-chain**.

`FXRiskAgentINFT` is an ERC-721 with a few extensions inspired by the ERC-7857 draft: every token has a `storageRootHash` pointing to the agent's metadata, a `creator`, a `createdAt`, and a mutating `inferenceCount`. Every time the agent runs, `updateAgentState()` bumps `inferenceCount` and updates the storageRootHash to a new session-summary artifact.

Three consequences:

- **The agent has a provable history.** Token #0 has done N inferences. Each inference's rootHash is discoverable via contract events.
- **Ownership is transferable.** If I sell or transfer the INFT, the new owner inherits the agent's full audit trail — Memory *is* an asset.
- **Access control has a clean root.** The Oracle's "who can submit on behalf of Agent #0?" question becomes `INFT.ownerOf(0) == msg.sender`. Lose the INFT, lose the ability to speak as that agent.

Combined, the four components form a closed loop: **Storage holds the truth, Chain holds the pointers, Compute produces verifiable inference, and the INFT anchors accountability.**

## The Dashboard That's Actually Decentralized

Most Web3 dashboards are static HTML files that read from a backend API that reads from a centralized database. The "Web3" part is aesthetic.

FX Risk Agent's dashboard is a single static HTML page hosted on GitHub Pages. When you click "View AI Decision" on any alert, the browser **fetches the decision log JSON directly from 0G's storage indexer** — no backend, no middleman, no proxy. The bytes you see in the modal are the same bytes I uploaded days ago, served from 0G's decentralized storage network and verified by the same rootHash that's on-chain.

The **Download Original** button does the same thing, but gives you the raw JSON to keep. Anyone can run `curl https://indexer-storage-testnet-turbo.0g.ai/file?root=<hash>` and get the identical bytes. That's what "public, verifiable" looks like when it's not a marketing slogan.

I'll admit, getting here took some wrestling. When I started, I was writing local mirror files and pushing them to the repo on every agent run. It worked, but it wasn't really Web3 — the Dashboard was reading from GitHub, not from 0G. The moment I confirmed 0G's indexer serves `Access-Control-Allow-Origin: *`, I rewrote the Dashboard to fetch directly. The local mirror stays as a graceful fallback, but the primary path is pure decentralized retrieval.

## Security Architecture: The Boring-Looking Parts That Matter Most

Two decisions that don't fit on a pitch slide but are the reason I'd trust this in production:

**1. Trust boundaries are closed at both ends.** Minting an INFT agent requires `onlyOwner` on the NFT contract. Submitting an alert requires owning the INFT. Neither side is permissionless. An attacker who wants to forge an "official" AI alert has to either compromise the deployer key or compromise the INFT owner — there's no lateral path through the Oracle that was the obvious-in-hindsight attack vector most similar projects miss.

**2. State-mutating paths are reentrancy-guarded.** `mintAgent` and `updateAgentState` both inherit OpenZeppelin's `ReentrancyGuard`. `mintAgent` orders its state writes before the `_safeMint` external call so a malicious `ERC721Receiver` can't observe half-written metadata. These are small, boring decisions. They're also the difference between "safe smart contract" and "every testnet alarm going off when the real world shows up."

## What's Live Right Now

- **FXRiskOracleV2**: `0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca`
- **FXRiskAgentINFT**: `0xAA540f42f0d20588f183E3B92B3b617991fa22D1` — Token #0 active
- **Live Dashboard**: [smallironman666.github.io/fx-risk-agent](https://smallironman666.github.io/fx-risk-agent/)
- **GitHub**: [github.com/smallironman666/fx-risk-agent](https://github.com/smallironman666/fx-risk-agent)

Every alert on the dashboard is a real agent run. Every rootHash resolves to a real JSON on 0G Storage. Every `submitAlert` transaction is indexed on Chainscan. Verify independently, or take my word for it — but the whole point is that you don't have to take anyone's word.

## The Honest Part

Is the "Memory as Asset" thesis the next Ethereum? I don't know. The AI-x-Web3 narrative is loud, and 0G is early. What I can say after two weeks inside the stack: **it's the only infrastructure I've tried where building verifiable AI for real financial decisions felt natural, not bolted-together.** Everything else I considered involved gluing IPFS to generic L2s with an off-chain signer in between. The chain primitives for this use case simply weren't there.

Whether that makes 0G a 10x asset-of-the-cycle is a market question I can't answer. Whether it makes 0G the most obvious place to ship a production-grade verifiable AI agent today is an engineering question, and my answer is yes.

## What's Next

- **Mainnet migration** on 0G Aristotle (Chain ID 16661) — waiting on testnet graduation of our current agent state.
- **INFT metadata URI** so wallets and explorers can render Agent #0 with its full provenance inline.
- **Historical Replay Mode** — a "what did the agent think the week before the crisis" demo that walks through a real timeline of archived decisions.

If you're building at the intersection of cross-border finance, agent ownership, or verifiable AI — reach out. This is a small room right now, and that's precisely why it matters.

---

**FX Risk Agent** — verifiable AI risk monitoring for cross-border payments.
Built on 0G. Solo-shipped. Production-minded.

🔗 [Dashboard](https://smallironman666.github.io/fx-risk-agent/) · [GitHub](https://github.com/smallironman666/fx-risk-agent) · [Demo](https://youtu.be/j2eaoJN18a8)
🐦 [@0xSmallironman](https://x.com/0xSmallironman)
