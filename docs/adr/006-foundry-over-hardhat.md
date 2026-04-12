# ADR-006: Use Foundry Instead of Hardhat

## Status
Accepted — April 10, 2026

## Context

Project starts empty. Need to pick a Solidity toolchain.

Options on the table:
- **Hardhat** — the TypeScript-based incumbent, huge plugin ecosystem, familiar to most Web3 devs
- **Foundry** (forge + cast + anvil) — Rust-based, ~10× faster compilation, tests in Solidity

Initial instinct was Hardhat because:
1. Everything else in the project is TypeScript (Agent, Storage integration, frontend)
2. The 0G documentation examples show Hardhat
3. More community familiarity

Then three friction points surfaced during the first hour:

1. **Hardhat 3.x requires ESM project mode** (`"type": "module"` in package.json), which breaks our OpenAI + 0G-ts-sdk setup that uses CommonJS.
2. **Hardhat 3 → 2 downgrade** triggered dependency resolution wars (ethers@6.13.1 is a peer-dep of `@0gfoundation/0g-ts-sdk`, and Hardhat's plugin-toolbox wants `ethers@^6.4.0`, causing `ERESOLVE` failures).
3. **Compiler download failures** — Hardhat couldn't fetch `solc 0.8.24` binaries (likely network issue), blocking compilation entirely.

Meanwhile, Foundry installed in 30 seconds via `curl | bash`, compiled our contracts in 1.5 seconds flat, and required zero dependency coordination with the TypeScript stack.

## Decision

Use **Foundry** for all Solidity work (compilation, testing, deployment).

Keep TypeScript for everything off-chain (agent, storage client, frontend, tests of business logic).

The two coexist cleanly:
- `foundry.toml` points `src = "contracts"` so Foundry works in its own namespace
- `tsconfig.json` points `rootDir = "./src"` and excludes `contracts/` — TypeScript never touches Solidity files
- `lib/` (Foundry git submodules for OpenZeppelin + forge-std) is separate from `node_modules/` (npm)
- Deploy scripts are Solidity (`script/Deploy*.s.sol`), invoked by `npm run deploy-v2`

## Alternatives Considered

### Alternative A: Hardhat + debug dependency issues
- **Rejected**: Hours of dependency hell for zero architectural benefit. The TS-language argument for Hardhat disappears when you discover you'll write deploy scripts either way.

### Alternative B: Pure Foundry (no TypeScript at all)
- **Rejected**: Agent logic, 0G Storage client, frontend — none of these fit in Foundry's scope. Foundry is for Solidity; we need both languages.

### Alternative C: Remix for Solidity, npm for everything else
- **Rejected**: Remix doesn't integrate into CI/CD. Would have to manually copy-paste ABIs between browser IDE and local code. No contract tests.

## Consequences

**Positive**:
- Compile times under 2 seconds → tight iteration loop
- Contract tests run in 119ms for 19 tests (`forge test -vv`)
- No dependency conflicts with the TypeScript stack
- Industry-standard toolchain for serious Solidity work (adopted by Uniswap, Optimism, Aave)
- Deploy scripts in Solidity are more concise than Hardhat JS: `vm.startBroadcast(); new Contract();` is literally the entire body

**Negative**:
- Two dependency systems: `npm install` for TypeScript and `forge install` for Solidity libs
- Newcomers to the repo need to install Foundry (`curl -L https://foundry.paradigm.xyz | bash`) in addition to Node.js
- 0G's own code examples are Hardhat-based, so there's occasional translation needed

**Mitigation**:
- README's Quick Start documents both installation steps
- `package.json` has `forge build` / `forge test` wrapped in npm scripts (`npm run compile`, `npm test`) so most users don't need to learn the Foundry CLI directly
- `foundry.toml` and `remappings.txt` are checked in, so contract builds are reproducible

## Lessons

The rule "use one toolchain per project" is wrong when the toolchains serve fundamentally different languages. TypeScript and Solidity are different languages; trying to unify their tooling (as Hardhat attempts) produces the worst of both worlds when dependency graphs collide.

Foundry and npm coexisting through a clear directory split (`contracts/` vs `src/`) and a clear CLI split (`forge` vs `ts-node`) is actually *simpler* than a single unified tool trying to do everything.
