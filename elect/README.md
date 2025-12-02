# Governance Voting System

A production-style decentralized governance experience that mixes weighted whitelisting, quadratic voting, voter delegation, timed phases, and live audit logging. Everything runs on Solidity ^0.8.11 (Truffle) with a Bootstrap-based single page frontend that talks to MetaMask via Web3 + TruffleContract.

## Core Features
- **Weighted whitelist** – admin assigns raw voting credits per address before the election.
- **Quadratic voting engine** – effective vote power = `sqrt(rawWeight + delegatedWeight)` to curb whales.
- **Delegation desk** – voters can delegate or reclaim their voting credits during the setup phase.
- **Time-boxed phases** – admin chooses a duration and the contract enforces start/end timestamps; anyone can finalize after expiry.
- **Pause / resume switch** – circuit breaker built with OpenZeppelin `Pausable` so the admin can halt suspicious activity instantly.
- **On-chain audit trail** – UI streams every contract event (proposal added, voter whitelisted, vote cast, pause/resume, etc.) with timestamps, actors, and transaction hashes linked to the block explorer.
- **Government-grade UI** – responsive cards for connection, admin tools, voter dashboard, results, and audit history (emoji-free, clean typography).

## Architecture
| Layer | Details |
| --- | --- |
| Smart Contract | `contracts/GovernanceVoting.sol`, Solidity ^0.8.11, uses OpenZeppelin `Pausable`. Handles phases, delegation, quadratic tally, pause/resume, and emits events for each action. |
| Frontend Logic | `src/js/app.js`, plain JS + jQuery + Web3/TruffleContract. Manages wallet detection, state rendering, MetaMask transactions, pause banner, and audit log aggregation. |
| UI / Styling | `src/index.html`, `src/css/governance.css`. Bootstrap grid with custom government color palette. |
| Tooling | Truffle 5, Ganache (dev chain on `127.0.0.1:7545`, chain id 1337), MetaMask, lite-server (`npm run dev`). |

## Prerequisites
- Node.js 18+ and npm
- Truffle CLI (`npm install -g truffle`)
- Ganache (GUI or CLI) running on port `7545`
- MetaMask browser extension

Install dependencies:
```bash
npm install
```

## Build & Run
1. **Start Ganache** and ensure the network id is `1337` (matches MetaMask custom RPC).
2. **Compile + deploy contracts**
   ```bash
   truffle migrate --reset
   ```
   The latest GovernanceVoting address is written to `build/contracts/GovernanceVoting.json` for the UI.
3. **Serve the frontend**
   ```bash
   npm run dev
   ```
   Browse to the printed URL (usually `http://localhost:3000`).
4. **Connect MetaMask**
   - Add a custom network pointing to `http://127.0.0.1:7545` with chain id `1337`.
   - Import Ganache accounts via private keys so you can demo admin vs voters.

## Usage Flow
1. **Admin (Setup phase)**
   - Add proposals with titles/descriptions.
   - Whitelist voter addresses and assign raw voting credits.
   - Optional: observe delegation requests from voters.
2. **Start voting**
   - Enter duration (minutes) and click *Start Voting*.
   - Timer shows remaining time. Voting card enabled for whitelisted voters.
3. **Voters**
   - Review their dashboard (weight, delegated weight, quadratic power).
   - Delegate to another address or remove delegation during setup.
   - When voting is active, select a proposal and confirm the MetaMask transaction.
4. **Emergency controls**
   - Admin can click *Pause Election* to disable all state-changing buttons; resume once safe.
5. **Audit trail**
   - History card lists recent events with timestamps and transaction hash hyperlinks.
   - Click *Refresh* to pull the latest logs (uses Web3 `getPastEvents` fallback).
6. **Close election**
   - Admin clicks *Close Voting* (or anyone can call `finalizeIfExpired` after the deadline).
   - Results card shows winner, quadratic votes, and raw totals for every proposal.

## Testing
Run the Truffle test suite (same as `npm test`):
```bash
truffle test
```
Existing tests cover whitelist flows and weighted counting. Extend with new specs (delegation, pause, timers) as needed.

## Troubleshooting
- **“Failed to load contract”** – ensure `truffle migrate --reset` ran against the same Ganache instance the UI is connected to.
- **MetaMask keeps asking for confirmation** – every state change is a blockchain transaction; approve each one while testing.
- **Audit history empty** – perform an action (add proposal, whitelist, vote) then click *Refresh*; history only shows confirmed events.
- **Paused state stuck** – call *Resume Election* in the admin card; contract uses OpenZeppelin `Pausable` and blocks all state changes while paused.

## Demo Checklist
- Start Ganache, run `truffle migrate --reset`, launch `npm run dev`.
- Open the DApp, connect MetaMask, verify status bar shows account + role.
- Walk through: add proposals → whitelist voters → start voting → show delegation → cast votes → pause/resume → display audit trail → close voting → highlight results.

The repository is presentation-ready—clean UI, advanced governance mechanics, and a complete audit trail that proves every action on chain.
