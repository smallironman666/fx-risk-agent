# ADR-001: Dual AI Backend (Doubao + 0G Compute)

## Status
Accepted — April 12, 2026

## Context

FX Risk Agent's core value depends on the **quality of AI risk judgments**.

0G Compute Network offers TEE-protected inference — critical for the hackathon's "Verifiable Finance" narrative and the `Privacy/Secure Execution` scoring criterion. However, 0G Compute on the Galileo testnet currently only serves **Qwen 2.5 7B**, which is materially weaker than the reasoning quality of Doubao Seed 2.0 Pro (LMArena top-10).

Two competing constraints:

1. **Demo quality**: Judges watch a 3-minute demo video. If the AI reasoning is visibly shallow, the product feels broken regardless of its 0G integration depth.
2. **0G integration depth**: Judges evaluate `0G Technical Integration Depth & Innovation`. Not using 0G Compute after checking the box would be dishonest.

## Decision

Implement a **strategy pattern for AI backends** with two concrete implementations:

- `DoubaoBackend`: OpenAI-compatible call to Volcengine Ark. Default backend.
- `ZgComputeBackend`: Full `@0glabs/0g-serving-broker` integration with TEE verification via `processResponse()`.

Backend selection is controlled by the `AI_BACKEND` environment variable:

```bash
AI_BACKEND=doubao       # default, for demo quality
AI_BACKEND=0g-compute   # for TEE-verified inference
```

Both backends share the same `LLMBackend` interface (`chat(request) -> response`), so `analyzer.ts` is backend-agnostic.

## Alternatives Considered

### Alternative A: 0G Compute only
- **Pros**: Simpler codebase. Stronger "all-in on 0G" narrative.
- **Cons**: Demo quality regression. Qwen 7B occasionally produces malformed JSON or shallow reasoning. 3-minute video would show lower-quality AI output than existing submissions using ChatGPT/Claude.

### Alternative B: Doubao only
- **Pros**: Best AI quality. Minimal work.
- **Cons**: Cannot truthfully claim 0G Compute integration. Would fail the hackathon's "must integrate at least one 0G component" check if Compute is the intended one.

### Alternative C: Runtime A/B switching per request
- **Pros**: Could dynamically pick based on model availability or latency.
- **Cons**: Overengineering for a hackathon MVP. No clear use case where we'd want per-request backend switching.

## Consequences

**Positive**:
- Demo videos use Doubao → full-quality AI reasoning in every scene
- Code still includes a production-ready 0G Compute integration that passes code review
- `AI_BACKEND=0g-compute` can be demonstrated live once sufficient testnet OG tokens are available
- Easy to swap in a third backend (e.g., Claude API) in the future — just implement `LLMBackend`

**Negative**:
- Two code paths to maintain. Each backend has its own error handling.
- Testnet quality asymmetry: the `0g-compute` path produces different (lower-quality) reasoning than the `doubao` path, which could confuse users if they switch backends mid-demo.
- Slightly higher documentation burden (README needs to explain both modes).

**Mitigation**:
- Both backends go through the same `parseAnalysisResponse()` logic in `analyzer.ts`, which tolerates Qwen's tendency to emit markdown-fenced JSON.
- `DecisionLog` stores `aiBackend` field so auditors can tell which backend produced any given decision.
