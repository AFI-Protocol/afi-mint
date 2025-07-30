# 🌟 AFI Mint – Signal-Driven Token Minting Pipeline

**AFI Mint** is the core minting module for the **Agentic Financial Intelligence (AFI) Protocol**.  
It handles **signal validation, challenge windows, threshold checks, and token minting**  
in a way that is **modular, auditable, and ready for autonomous agents**.

---

## 🚀 Overview

AFI Mint orchestrates token emission through a **Proof-of-Intelligence (PoI)**-driven process:

1. **Signals Submitted** → From validators and scoring agents  
2. **Threshold Check** → Ensures sufficient qualified signals  
3. **Challenge Window** → Allows potential disputes or slashing events  
4. **Mint Event** → AFI tokens minted and logged in the **Mint Codex**  
5. **Codex Recording** → Results stored for audits and replay simulations

This module is **Augmentcode + Factory-ready**, enabling autonomous agent deployment and future staking integrations.

---

## 📂 Repository Structure

```plaintext
afi-mint/
├── cli/                 # CLI commands for signal challenge, mint triggers, simulation
├── codex/               # Mint receipt schema (JSON)
├── contracts/           # Solidity stubs: ChallengeRegistry, MintManager, ThresholdRules
├── mint/                # Core TS minting logic and eligibility checks
├── schemas/             # TypeScript schemas for challenge and mint triggers
├── scripts/             # Scripted trigger examples
├── test/                # Unit test stubs for minting flows
└── docs/sprint_archive/ # Placeholder and historical READMEs
```

---

## 🧩 Key Features

- **Signal Validation & Threshold Checks**  
- **Challenge Window Logic for Dispute Handling**  
- **Codex Mint Receipts for Audit & Replay**  
- **Solidity Contracts for On-Chain Mint Management**  
- **CLI and Scripts for Local Simulation & Testing**  

---

## 🛠️ Development

Install dependencies and run tests:

```bash
npm install
npm run test
```

Future integration will include **staked minting**, **agent-triggered challenges**, and **automatic Codex replay**  
for deterministic audit trails and autonomous treasury management.

---

## 📜 License

MIT © 2025 Agentic Financial Intelligence
>>>>>>> 58e78aa (Fix: Restore correct AFI-Mint README and remove accidental ElizaOS content)
