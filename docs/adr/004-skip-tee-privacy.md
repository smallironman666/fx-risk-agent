# ADR-004: Do NOT Integrate Privacy / TEE Sealed Inference

## Status
Accepted — April 12, 2026

## Context

0G Labs prominently markets `Privacy / Secure Execution` as a core component, backed by Sealed Inference: AI models run inside Intel TDX + NVIDIA H100 TEEs, and responses are cryptographically signed before returning to the caller. Track 2 (Agentic Trading Arena) explicitly encourages teams to use Sealed Inference.

Three reasons to prototype with it:
1. It's a 0G flagship feature, which would score well on `0G Technical Integration Depth`.
2. Track 2 specifically rewards it.
3. Adding one more box-check to the component list looks good.

Three reasons against:
1. **Our use case does not require confidentiality**. FX risk monitoring for cross-border payment compliance *wants* transparency. Regulators, auditors, and operations teams need to read every decision. Hiding AI reasoning inside a TEE would actively *damage* the audit trail we're building.
2. **Authenticity of this use case vs. checking boxes**. If we add TEE integration without a real problem it solves, the write-up will be hollow. Evaluators who read carefully can tell.
3. **Implementation cost**. Full TEE integration requires the `0g-compute` backend to be live in production mode + enough OG tokens to fund a provider + Playwright/curl experiments to verify `processResponse()` actually returns `verified: true`. On testnet with 0.08 OG in the wallet, this is aspirational, not concrete.

## Decision

**Do not integrate Privacy / TEE.** Explicitly document the reasoning in the README and HackQuest submission.

However, keep the code path *capable* of TEE verification: `ZgComputeBackend.chat()` already calls `broker.inference.processResponse(providerAddress, chatId, content)` when `ZG_COMPUTE_TEE=true`. The `DecisionLog` schema includes `inferenceVerification: { providerAddress, chatId, verified }` so TEE results, when available, are stored.

This means:
- We can honestly say "code supports TEE verification, enabled when running on 0G Compute"
- We did NOT check the "Privacy / Secure Execution" box in the HackQuest submission
- We called it out explicitly in the Integration Proof narrative: "TEE not applicable — our use case requires transparent AI decisions for regulatory audit. TEE suits proprietary trading strategies, not compliance monitoring."

## Alternatives Considered

### Alternative A: Integrate TEE anyway for scoring points
- **Rejected**: Dishonest narrative, and evaluators can see TEE doesn't fit the audit-trail value proposition. Net negative on credibility.

### Alternative B: Partial integration (code only, no actual TEE execution)
- **Rejected**: This is essentially what we did already — `ZgComputeBackend.processResponse()` is wired up. We just don't claim the "Privacy/Secure Execution" label.

### Alternative C: Pivot the use case toward proprietary trading (which needs TEE)
- **Rejected**: Would destroy our clear differentiation on compliance/audit. Proprietary trading is crowded; AI compliance for cross-border payments is unclaimed territory.

## Consequences

**Positive**:
- Intellectually honest narrative: we choose 0G components based on fit, not box-checking
- Integration Proof calls out TEE's non-applicability as a deliberate decision — demonstrates product thinking, not just engineering
- Saves 2-3 days of integration work that can be redirected to polish, tests, and documentation

**Negative**:
- One fewer box on the HackQuest component list (4 integrated instead of 5)
- Evaluators who speed-read might not notice the "we thought about this and rejected it" distinction

**Mitigation**:
- README has a dedicated section explaining why TEE is wrong for this use case
- HackQuest Integration Proof text includes a one-line reason for not checking Privacy

## Lessons

Saying "no" to an optional feature is itself a design decision worth documenting. Hackathon projects that say yes to everything tend to score like products that say yes to everything: unfocused.

The strongest submissions pick 3-4 0G components they *actually need* and integrate them deeply. The weakest check 6 boxes and integrate all shallowly.
