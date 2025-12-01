# Weighted Voting DApp

A governance-themed decentralized application where an administrator whitelists voters, assigns weights, and collects ballots on proposals. Built with Truffle, Solidity ^0.8.11, and a lightweight Bootstrap frontend that talks to MetaMask via Web3 + TruffleContract.

## Features
- **Weighted whitelist** – admin assigns per-address voting power before the election starts.
- **Lifecycle management** – proposals can be created in the setup phase, moved into voting, then finalized to reveal winners.
- **Transparent results** – anyone can read proposal tallies (weighted) and, once finished, the leading proposal.
- **Presentation friendly UI** – single-page app shows connection status, admin tools, voter controls, and real-time tallies.

## Development Workflow
1. **Start Ganache** on `127.0.0.1:7545` (default Truffle network).
2. **Compile & migrate**:
   ```bash
   truffle migrate --reset
   ```
3. **Run tests**:
   ```bash
   npm test
   ```
   Covers whitelist rules, weighted counting, phase enforcement, and winner calculation.
4. **Launch frontend**:
   ```bash
   npm run dev
   ```
   Browse to the shown URL (usually `http://localhost:3000`). The dev server serves both `src/` assets and the contract ABI in `build/contracts`.
5. **Connect MetaMask** to the Ganache network and switch between accounts to demo admin vs voter experiences.

## Demo Script
1. **Connect wallet** – show the Connection card updating with account, role, and phase.
2. **Admin setup** – add a proposal, whitelist two voter accounts with different weights, and click *Start voting*.
3. **Voter flow** – switch MetaMask to each voter, observe status text, and cast votes. The proposal table updates with weighted totals.
4. **Close election** – switch back to admin, click *Close voting*, and highlight the Results panel showing the leading proposal.

## Tech Stack
- **Solidity** smart contract (`contracts/WeightedElection.sol`).
- **Truffle** for build/migrations/tests.
- **Web3.js + TruffleContract** for browser interactions.
- **Bootstrap + jQuery** for quick UI scaffolding.

Feel free to extend the roadmap (e.g., voter weight updates, multi-choice ballots, automatic deadlines) once the core flow is approved.
