# afi-mint — Agent Instructions ⚠️ HIGH RISK / CRITICAL

**afi-mint** coordinates **signal-driven token minting and emissions scheduling** for AFI Protocol. This repo orchestrates the minting pipeline (signal validation, threshold checks, challenge windows, mint triggers) but **does NOT contain token contracts or on-chain economics logic**.

**⚠️ CRITICAL**: This repo is **HIGH RISK** because incorrect minting coordination can cause:
- Unauthorized token emissions
- Incorrect supply cap enforcement
- Failed challenge windows
- Broken audit trails in the Mint Codex

**Global Authority**: All agents operating in AFI Protocol repos must follow `afi-config/codex/governance/droids/AFI_DROID_CHARTER.v0.1.md`. If this AGENTS.md conflicts with the Charter, **the Charter wins**.

For global droid behavior and terminology, see:
- `afi-config/codex/governance/droids/AFI_DROID_CHARTER.v0.1.md`
- `afi-config/codex/governance/droids/AFI_DROID_PLAYBOOK.v0.1.md`
- `afi-config/codex/governance/droids/AFI_DROID_GLOSSARY.md`

---

## Build & Test

```bash
# Install dependencies
npm install

# Build TypeScript (stub – TBD)
npm run build

# Run tests (stub – TBD)
npm test

# Type check
npm run typecheck

# Validate schemas (planned command – may be stubbed in this phase)
npm run validate:schemas
```

**Expected outcomes**: All tests pass, schemas validate, no TypeScript errors.

---

## Run Locally / Dev Workflow

```bash
# Simulate mint trigger (planned command – may be stubbed in this phase)
npm run simulate-mint

# Challenge a signal (CLI) (planned command – may be stubbed in this phase)
npm run challenge-signal

# Check threshold eligibility (planned command – may be stubbed in this phase)
npm run check-threshold

# Validate mint receipts (planned command – may be stubbed in this phase)
npm run validate:receipts
```

**⚠️ Do not trigger real minting without explicit human approval and security review.**

---

## Architecture Overview

**Purpose**: Coordinate signal-driven minting and emissions scheduling. **Not** for token contracts, on-chain economics, or DAG orchestration.

**Key directories**:
- `mint/` — Core minting coordination logic (eligibility, mint triggers)
- `cli/` — CLI commands (challenge signals, simulate mints)
- `schemas/` — TypeScript schemas (ChallengeRecord, MintTrigger)
- `codex/` — Mint receipt schemas (JSON)
- `contracts/` — Solidity stubs (ChallengeRegistry, MintManager, ThresholdRules) **[PLACEHOLDER ONLY]**
- `test/` — Unit tests for minting flows

**Depends on**: afi-core (validators, schemas), afi-config (global config)  
**Consumed by**: afi-ops (deployment), afi-reactor (signal pipeline), afi-token (on-chain minting)

**Boundary with afi-token**:
- `afi-mint` = minting **coordination** (off-chain logic, threshold checks, challenge windows)
- `afi-token` = minting **execution** (on-chain contracts, supply caps, role management)

**Boundary with afi-reactor**:
- `afi-reactor` = signal **orchestration** (DAG pipeline, signal scoring)
- `afi-mint` = signal **consumption** (threshold checks, mint triggers based on scored signals)

---

## Security

- **⚠️ Minting logic affects token supply**: Incorrect coordination can cause unauthorized emissions.
- **⚠️ Challenge windows must be enforced**: Skipping challenges can allow invalid signals to mint tokens.
- **⚠️ Threshold checks are critical**: Incorrect thresholds can over-mint or under-mint.
- **All minting changes require tests**: 100% coverage for critical paths.
- **No secrets in code**: Use environment variables for API keys and private keys.
- **Mint receipts must be auditable**: All mints must be logged in Mint Codex.

---

## Git Workflows

- **Base branch**: `main`
- **Branch naming**: `feat/`, `fix/`, `security/`, `test/`
- **Commit messages**: Conventional commits (e.g., `feat(mint): add threshold check for epoch 5`)
- **Before committing**: Run `npm test && npm run typecheck`
- **⚠️ Minting changes require approval**: Tag @afi-mint-team in PR

---

## Conventions & Patterns

- **Language**: TypeScript (ESM), Solidity stubs (placeholder only)
- **Schemas**: Zod or JSON Schema for validation
- **Tests**: Jest or Vitest, comprehensive coverage for minting flows
- **Codex**: All mints must be recorded in Mint Codex for replay and audit

---

## Scope & Boundaries for Agents

**Allowed**:
- Add minting coordination logic in `mint/` (eligibility checks, threshold logic, challenge windows)
- Add CLI commands in `cli/` for simulation and testing
- Add schemas in `schemas/` for mint triggers and challenge records
- Add tests in `test/` for minting flows
- Improve documentation in `docs/`
- Add Mint Codex receipt schemas in `codex/`

**Forbidden**:
- **Modify token contracts in `afi-token`** (minting execution is separate from coordination)
- **Change supply caps, emissions rates, or token economics** (those belong to `afi-token` only)
- **Deploy contracts or broadcast transactions** (deployment is handled by `afi-ops` and `afi-token`)
- **Add orchestration logic to `afi-reactor`** (signal orchestration is separate from minting coordination)
- **Modify DAG structure or signal scoring** (those belong to `afi-reactor` and `afi-core`)
- **Bypass challenge windows or threshold checks** (security-critical)
- **Hardcode minting parameters** (use config from `afi-config` instead)
- **Add cross-repo modifications** (no touching `afi-token`, `afi-reactor`, `afi-core`, etc.)

**When unsure**: **DO NOT PROCEED**. Ask for explicit spec, security review, and human approval. Minting coordination affects token supply and must be correct.

---

## Interaction with Other AFI Repos

**afi-token** (on-chain contracts):
- `afi-mint` **consumes** token contract interfaces (e.g., `mintEmissions()`)
- `afi-mint` **MUST NOT** modify token contracts, supply caps, or role management
- Dependency direction: `afi-mint` → `afi-token` (never reverse)

**afi-reactor** (DAG orchestration):
- `afi-mint` **consumes** scored signals from `afi-reactor`
- `afi-mint` **MUST NOT** modify DAG structure or signal scoring logic
- Dependency direction: `afi-mint` → `afi-reactor` (never reverse)

**afi-core** (validators, schemas):
- `afi-mint` **consumes** validators and schemas from `afi-core`
- `afi-mint` **MUST NOT** modify core validators or signal schemas
- Dependency direction: `afi-mint` → `afi-core` (never reverse)

**afi-config** (global config):
- `afi-mint` **consumes** minting parameters from `afi-config`
- `afi-mint` **MUST NOT** hardcode minting parameters (use config instead)
- Dependency direction: `afi-mint` → `afi-config` (never reverse)

**Principle**: `afi-mint` is a **consumer** of AFI services, not a **producer** of core logic. Consume, don't clone.

---

## Future Droids (Placeholder)

**TODO**: Define `mint-coordinator-droid` in `.factory/droids/mint-coordinator-droid.md` when minting goes live.

**Expected responsibilities**:
- Validate minting coordination logic (eligibility, thresholds, challenge windows)
- Add tests for minting flows
- Update Mint Codex schemas
- Ensure minting parameters are sourced from `afi-config`, not hardcoded

**Constraints**:
- MUST follow AFI_DROID_CHARTER and AFI_DROID_PLAYBOOK
- MUST NOT modify token contracts in `afi-token`
- MUST NOT bypass security reviews for minting changes

---

## Human Review & Escalation

- **All minting changes require human review** before merge.
- **HIGH RISK changes** (threshold logic, challenge windows, mint triggers) require explicit sign-off from @afi-mint-team and @afi-security-team.
- **Security audits required** for any changes affecting token supply or emissions logic.
- **Prefer small, reversible changes** over large refactors.
- **When in doubt, escalate** to @afi-mint-team or @afi-security-team.

---

**Last Updated**: 2025-12-06  
**Maintainers**: AFI Mint Team  
**Charter**: `afi-config/codex/governance/droids/AFI_DROID_CHARTER.v0.1.md`  
**Risk Level**: HIGH / CRITICAL

