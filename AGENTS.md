# Ooyaa

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

USDC payroll contract on Arc Testnet. Pays a fixed payee list once per period in order; anyone may call run() to process a period and earn a small USDC tip. Employer funds the contract via fund() and may withdraw free balance via withdraw().

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```

## Turn 14 (run payday button -- no deploy, no transactions)

No contracts changed. No transactions. Visitor-signed transactions only when the user presses Run.

### New files
- `src/payroll/runMachine.ts`: pure reducer, states: ready/checking/refused/needs_wallet/wrong_chain/signing/pending/paid/failed; events: PRESS/SIM_OK/SIM_REVERT/NO_WALLET/WRONG_CHAIN/SIGNED/REJECTED/RECEIPT_OK/RECEIPT_REVERTED/ERROR/RESET
- `src/payroll/runMachine.test.ts`: 14 tests for all transitions
- `src/payroll/runErrors.ts`: `classifyRunError(err)` -> `{kind, name, detail}` using viem BaseError/ContractFunctionRevertedError/UserRejectedRequestError/InsufficientFundsError
- `src/payroll/runErrors.test.ts`: 7 tests (selector-based ContractFunctionRevertedError construction)
- `src/payroll/useRunPayday.ts`: hook -- simulate from DEAD when no wallet; dispatch SIM_OK after sim passes; wallet/chain checks; estimate gas * 1.3; writeContract via RUN_ABI fragment; receipt parsing via summarizeRunReceipt + parseEventLogs; 60 s timeout; qc.invalidateQueries after paid
- `src/payroll/lastPaidRun.test.ts`: 6 tests for window scan and summarizeRunReceipt

### Edited files
- `src/payroll/lastPaidRun.ts`: rewritten -- window scan (10k-block newest-first), no binary search, no try/catch; exports summarizeRunReceipt(receipt, payroll) -> {txHash, period, paid, totalDeferred, tip, payslips}; exports PaidRunResult with deferred field
- `src/components/DemoPayrollCard.tsx`: onRun prop removed; useRunPayday wired; pressRef via useEffect; lastPaidRun via useQuery (retry 4, staleTime 60s); status line under button per runState; indeterminate sweep bar when pending; stampAll on RECEIPT_OK; refused/failed UI; loading slip uses Skeleton bars not zero address
- `src/components/Payslip.tsx`: payee prop accepts null for loading skeleton; Skeleton bars when payee is null; stamp() accepts kind arg from PayslipHandle
- `src/components/Stamp.tsx`: StampKind 'already-paid' -> 'already'; play(kind?) optional arg overrides prop; useState for activeKind
- `src/components/Hero.tsx`: onRun prop removed; DemoPayrollCard receives no onRun
- `src/pages/LabPage.tsx`: stampAlready uses 'already' not 'already-paid'
- `src/main.tsx`: StudioWatermark uses className="studio-badge" (no inline position styles)
- `src/index.css`: .studio-badge class added (fixed bottom-right desktop; static centered mobile); @keyframes btn-sweep for indeterminate bar

### Design decisions
- writeContract uses RUN_ABI fragment (not full payrollAbi) to avoid TS instantiation-depth error
- walletClient cast to WalletClient for writeContract; account: walletAddress required when chain is explicit
- SIM_OK dispatched after sim passes so NO_WALLET/WRONG_CHAIN can transition from signing state
- NO_WALLET and WRONG_CHAIN handled from both checking and signing states in the machine

### Test results (turn 14)
- 93/93 pass at end of turn 14 (superseded by turn 14b)
- bun run check: 0 errors, 0 warnings at end of turn 14

## Turn 14b (run payday error classification -- no deploy, no transactions)

No contracts changed. No transactions.

### Problem fixed
Two bug classes in the run payday flow:
1. classifyRunError checked instanceof at the outermost error only. Real wallet errors arrive as ContractFunctionExecutionError wrapping UserRejectedRequestError or InsufficientFundsError. Walk was only used for revert nodes; now all three viem leaf types are found by walking.
2. Non-revert errors from simulateContract (RPC timeout, rate limit) were classified as SIM_REVERT and shown as "The contract would refuse this run". Non-revert errors from estimateContractGas were classified as failed/reverted: "Arc refused the run on chain". Both are fixed: only decoded reverts dispatch SIM_REVERT; everything else dispatches ERROR other.

### Files changed
- `src/payroll/runErrors.ts`: walk the cause chain for UserRejectedRequestError, InsufficientFundsError, ContractFunctionRevertedError; removed outer instanceof checks
- `src/payroll/runErrors.test.ts`: tests build real viem errors via createWalletClient/createPublicClient with custom transports; no longer use bare constructors
- `src/payroll/runMachine.ts`: NO_WALLET and WRONG_CHAIN accepted only from checking (not signing); removed outdated comments from PRESS and ERROR handlers
- `src/payroll/runMachine.test.ts`: replaced old "PRESS, SIM_OK, NO_WALLET" test with 4 new tests per spec; added ERROR from checking test; 17 tests total
- `src/payroll/useRunPayday.ts`: deleted isNothingDue, isUnderfunded, getRevertName; unified error handling via classifyRunError; reordered steps so wallet/chain checks precede SIM_OK; RECEIPT_OK built from summarizeRunReceipt only; deleted 8 banned comments
- `src/index.css`: deleted 2 comment lines from .studio-badge block

### Test results (turn 14b)
- 96/96 pass (64 payroll + 35 proof: 7 runErrors + 17 runMachine + 6 lastPaidRun + 10 cardState + 21 format + 35 proof)
- bun run check: 0 errors, 0 warnings

## Turn 15 (proof page -- no deploy, no transactions)

No contracts changed. No transactions. /proof ships in production builds.

### New files
- `src/proof/clients.ts`: mainnetClient and testnetClient (same settings as prove-it.ts)
- `src/proof/rows.ts`: buildLedgerRows -- flat per-transfer ledger rows from PayrollHistory
- `src/proof/rows.test.ts`: 4 tests (payslips+tip, funded, direct, sum totals)
- `src/proof/useProofReport.ts`: React query hook wrapping prove() with live checks array
- `src/generated/runtime.ts`: LOCAL_RUNTIME (PaydayFactory + Payroll deployed bytecode)
- `src/generated/build-facts.json`: foundry/app test pass counts + generatedAt timestamp
- `scripts/gen-runtime.ts`: writes src/generated/runtime.ts from Foundry artifacts
- `scripts/gen-build-facts.ts`: runs forge test --json + bun test src; writes build-facts.json
- `src/pages/ProofPage.tsx`: /proof page
- `src/components/proof/ProofSheet.tsx`: 8 check rows with live status marks + VERIFIED stamp
- `src/components/proof/TotalsBand.tsx`: 5 count-up totals with skeleton loading
- `src/components/proof/WalletList.tsx`: outside/ours runner classification
- `src/components/proof/LedgerTable.tsx`: per-transfer table + mobile cards + CSV download
- `src/components/proof/StudioFacts.tsx`: build-facts display + addresses + links

### Edited files
- `src/proof/prove.ts`: added onCheck option, pushCheck helper; all 8 checks now call onCheck
- `src/components/Stamp.tsx`: added 'verified' kind (--stamp, -10deg, same motion as PAID)
- `src/components/Nav.tsx`: Proof link with hover underline (left-to-right 200ms) and active-route state
- `src/pages/LabPage.tsx`: PROOF SHEET STATES block (pending/PASS/FAIL/SKIP rows, VERIFIED stamp button, in/out ledger row examples labelled EXAMPLE STATE)
- `src/App.tsx`: /proof route (production build)
- `package.json`: gen:runtime and facts scripts

### Test results (turn 15)
- 100/100 pass (64 payroll + 36 proof: 4 rows + 7 runErrors + 17 runMachine + 6 lastPaidRun + 10 cardState + 21 format + 35 proof/checks)
- bun run check: 0 errors, 0 warnings

### build-facts.json at turn 15
- app: 96 passing (prior to rows.test.ts addition; reruns will show 100)
- foundry: counted from forge test --json

---

## Turn 12c (prove-it rate-limit resilience -- no deploy)

No contracts changed. No transactions. Arc Mainnet RPC reached; 8/8 checks passed.

### New files
- `src/proof/retry.ts`: `withRetry(fn, label, onBackoff?)` -- exponential backoff (1,2,4,8,16 s + 25% jitter) on rate-limit errors (HTTP 429, "rate limit", "exceeds defined limit"); never retries contract reverts; prints "Arc RPC is rate limiting, waiting N s" on each backoff
- `src/proof/retry.test.ts`: 3 tests -- rate-limit twice then success; revert throws immediately; backoff message reported

### Edited files
- `src/proof/history.ts`: MAX_PARALLEL lowered 4 -> 2; `fetchWithRetry` replaced by `withRetry`; `getBlock` calls in `findCreationBlock` and `fetchPayrollHistory` wrapped in `withRetry`; `findCreationBlock` now accepts `onProgress`
- `src/proof/prove.ts`: every `getCode`, `readContract`, `getBlock`, `getBlockNumber`, `simulateContract` wrapped in `withRetry(fn, label, onProgress)`
- `src/proof/checks.ts`: `AllEvents` now uses `strict:false` matching `PayrollHistory.events` so filterName works without casts; all `history.events as AnyParsedEvent[]` replaced with typed assignments; `reqAddr`/`reqBig` helpers guard arg access; C7 equation format: "balance at snapshot X - balance before creation Y = in Z - out W"; equation always printed in C7 lines
- `scripts/prove-it.ts`: `http(url, { retryCount: 6, retryDelay: 1000 })` on both clients; state section shows "oldest unpaid payday due: UTC" when dueNow, "next payday: UTC" otherwise; direct deposits always shown in totals
- `src/proof/checks.test.ts`: 2 new C7 equation tests (pass + fail cases)

### Test results (turn 12c)
- 35/35 pass (src/proof)
- bun run check: 0 errors
- bun run prove: 8/8 PASS against Arc Mainnet block 28437421

## Turn 13 (hero, live demo payroll card, /lab -- no deploy)

No contracts changed. No transactions. Arc Mainnet RPC reachable from sandbox.

### New files
- `src/fonts.ts`: fontsource imports (Fraunces Variable, Instrument Serif, IBM Plex Sans, IBM Plex Mono)
- `src/pages/HomePage.tsx`, `LabPage.tsx`, `NotFound.tsx`
- `src/components/Nav.tsx`, `Hero.tsx`, `DemoPayrollCard.tsx`, `Payslip.tsx`, `Stamp.tsx`, `StampRing.tsx`
- `src/payroll/usePayrollState.ts`, `useChainClock.ts`, `lastPaidRun.ts`, `cardState.ts`, `format.ts`
- `src/payroll/cardState.test.ts` (10 tests), `format.test.ts` (21 tests) -- 31 total
- `public/favicon.svg`: stamp-ring mark
- `vercel.json`: SPA rewrite rule

### Edited files
- `src/config.ts`: chains [arc, mainnet], http('https://rpc.mainnet.arc.io') for arc
- `src/main.tsx`: BrowserRouter + fonts import
- `src/App.tsx`: Routes (/, /lab DEV-only, *)
- `src/index.css`: design tokens, perf mask, dot field, link underline
- `tailwind.config.js`: colors and fontFamily from tokens
- `index.html`: title, meta description, favicon
- `src/deployments.ts`: demoPayroll + demoPayrollBlock added to ARC_MAINNET
- `package.json`: build script added

### Test results (turn 13)
- 61/61 pass (31 payroll + 30 proof)
- bun run check: 0 errors
- bunx vite build: succeeds (chunk size warning expected from wagmi deps)

## Turn 12b (prove command fixes, no deploy)

All F1-F9 bugs from the 12b spec fixed. 30/30 unit tests pass (`bun test src/proof`). `bun run check` passes with zero errors.

### Files changed in turn 12b
- `scripts/gen-abi.ts`: regenerates `src/proof/abi.ts` from Foundry artifacts
- `src/proof/abi.ts`: regenerated (no manual edits allowed)
- `src/proof/abi.test.ts`: 2 tests, deep-equal artifact check (no @ts-expect-error)
- `src/proof/checks.ts`: typed events via parseEventLogs<typeof payrollAbi, false>,
  matchTransfers one-to-one, combineStatus, C5 sorted by (blockNumber, logIndex),
  C7 undecodable log check, Ledger struct, summarizeLedger
- `src/proof/history.ts`: typed getLogs for USDC via AbiEvent cast + our own LogFilter type;
  parseEventLogs strict:false in PayrollHistory type; null-safe sort comparator
- `src/proof/code.ts`: 5xx after retries, 429, bad JSON -> unreachable; throw Error directly
- `src/proof/code.test.ts`: 6 tests for sourcifyStatus (no @ts-expect-error)
- `src/proof/checks.test.ts`: 30 tests for C5/C6/C7/combineStatus (no @ts-expect-error)
- `src/proof/prove.ts`: typed C4 getLogs via AbiEvent; combineStatus for C3;
  ContractFunctionRevertedError for C8; dueNow/nextPayday as separate readContract calls;
  Ledger in ProofReport
- `scripts/prove-it.ts`: isAddress exit 2; main().catch; outside runners via PayeeAdded +
  getPayees; ledger logic from src/proof; dead code removed
- `package.json`: gen:abi script added
- `src/bun-test.d.ts`: bun:test type shim (references bun-types/test)
- `tsconfig.json`: unchanged (bun-types installed as devDep, picked up via src/bun-test.d.ts)

### Test counts (turn 12b)
- src/proof/abi.test.ts: 2 pass
- src/proof/code.test.ts: 6 pass
- src/proof/checks.test.ts: 22 pass
Total: 30/30

## Turn 12 (prove command, no deploy)

`bun run prove <payroll>` reads C1-C8 against Arc Mainnet. Shape correct but had F1-F9 bugs (fixed in 12b).

Files added in turn 12:
- `src/deployments.ts`: ARC_MAINNET, ARC_TESTNET, USDC_ADDRESS constants
- `src/proof/abi.ts`: ABIs (regenerated by gen-abi.ts in 12b; do not edit by hand)
- `src/proof/history.ts`: getLogsChunked, findCreationBlock, fetchPayrollHistory
- `src/proof/checks.ts`: checkC5, checkC6, checkC7, summarizeLedger, combineStatus, matchTransfers
- `src/proof/code.ts`: runtimeEquals, sourcifyStatus
- `src/proof/prove.ts`: prove() orchestrator, ProofReport type
- `src/proof/checks.test.ts`: C5/C6/C7/combineStatus tests
- `scripts/prove-it.ts`: CLI entry point
- `package.json`: prove script

## Turn 11 test results (tests-only turn, no deploy)

Changed file: contracts/test/PayrollFork.t.sol only.
- TransferMeter replaced by RunContextTransfer (reads own USDC balance first,
  then forwards exact gas to USDC.call, returns ok -- no gasleft() arithmetic).
- test_fork_TransferCostHasTwoXMargin: tryInRunContext(fresh, 55_000) must pass,
  tryInRunContext(fresh2, 30_000) must fail.
- Non-fork suite: 83/83 in both shared and --isolate modes.
- Sandbox has no Arc fork URL; fork tests cannot run here. Results from your run
  will be the definitive check.
- Payroll.sol, PaydayFactory.sol, and all other test/helper files are unchanged.

## Turn 10 test results (tests-only turn, no deploy)

Both Foundry modes verified (shared default + --isolate):
- Unit tests: 83/83 passing in both modes (69 Payroll+Factory + 14 invariant)
- Invariant tests: 14/14 at seeds 0-4, both modes
- Payroll.sol SHA256: `7222b301204cee3afb2e114ac6fad304b45a3d81bdedb2b53efb5079b1697c5b` (unchanged)
- PaydayFactory.sol SHA256: `7b2382f8c467f863cfc4ecfd0767f6cfe6d670afab74fa57067281dfcd323e57` (unchanged)

### Turn 10 changes
- `contracts/test-helpers/GasBurnAtTarget.sol`: burn-last technique, TARGET_TOTAL=106500
- `contracts/test-helpers/RealisticERC20.sol`: burn-last technique, TARGET_TOTAL=50000 (removed _scratchA/counter)
- `contracts/test/Payroll.t.sol`: test_RealisticTransferCostsAbout50k (renamed+rewritten with exact gas limits); test_BudgetCoversTwiceRealTransfer (+ direct call{gas:110k} pass / call{gas:100k} fail assertions)
- `contracts/test/PayrollFork.t.sol`: TransferMeter contract added; test_fork_TransferCostHasTwoXMargin measures inside one frame via meter.measure(); SafeERC20 import removed
- `contracts/test/PayrollInvariant.t.sol`: closedGhost bool added; _modelStartedPeriods guards on closedGhost not closedAtGhost>0
- Scratch proof (item 8): PAYEE_TRANSFER_GAS=100000 makes test_BudgetCoversTwiceRealTransfer fail in both modes; original restored

## Turn 09 test results (tests-only turn, no deploy)

- Unit tests: 69/69 passing (65 Payroll + 4 PaydayFactory)
- Invariant tests: 14/14 passing at seeds 0-4 (up from 9/9 last turn)
- Payroll.sol SHA256: `7222b301204cee3afb2e114ac6fad304b45a3d81bdedb2b53efb5079b1697c5b` (unchanged)
- PaydayFactory.sol SHA256: `7b2382f8c467f863cfc4ecfd0767f6cfe6d670afab74fa57067281dfcd323e57` (unchanged)

### Turn 09 new test files
- `contracts/test-helpers/GasBurnAtTarget.sol`: ERC-20 mock that burns 80,000 gas for a chosen payee
- `contracts/test/Payroll.t.sol`: +3 new tests (test_BudgetCoversTwiceRealTransfer, test_CloseBeforeStartOwesNothing, item-11 warp assertions in two low-gas tests)
- `contracts/test/PayrollInvariant.t.sol`: +5 new invariants (invariant_OwedMatchesModel, invariant_StartedPeriodsMatchesClock, invariant_FundedDuePeriodAlwaysRuns, invariant_GhostDeferredIdentity, invariant_EventsCrossCheck)
- `contracts/test/PayrollFork.t.sol`: FUNDED_WHALE removed; _fundUSDC uses vm.deal; delta balance asserts; selfdestruct comment corrected

## Deployed Contracts (current, turn 08)

### PaydayFactory (Arc Testnet, turn 08)
- **Address:** `0xb32feb10b48d753dee8938435ebe1c303ce6955b`
- **Deploy tx:** `0x8a50c11ff2dc8f0e7a9ff1f8416c03fe8e5f6027339c7240454697e09f55f979`
- **Explorer:** https://explorer.testnet.arc.io/address/0xb32feb10b48d753dee8938435ebe1c303ce6955b
- **Artifact:** `contracts/out/PaydayFactory.sol/PaydayFactory.json`

### Payroll reference (Arc Testnet, turn 08)
- **Address:** `0x1b31ea6ce9c6ad70444c476166eb219026e6c1d3`
- **Deploy tx:** `0x50de957bf04be05b89b4d1932436313b11c07777d1537fb378401658cd686089`
- **Explorer:** https://explorer.testnet.arc.io/address/0x1b31ea6ce9c6ad70444c476166eb219026e6c1d3
- **employer:** 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42
- **payees:** [0x5B12Ce46C7194aD57d143bC22847224047b1Ef42, 0x1111111111111111111111111111111111111111]
- **amounts:** [10000, 10000]
- **startTime:** 1793161771 (block.timestamp+600 at deploy)
- **periodLength:** 120
- **tipPerRun:** 1000
- **Artifact:** `contracts/out/Payroll.sol/Payroll.json`

### Compiler settings
- solc: 0.8.28
- optimizer: on, runs: 200
- evm_version: cancun
- forge: 1.7.1

### Superseded
- Turn 07 PaydayFactory: `0xdbd184d72bb0eca5f4ce4194ad92c4049e7d4267`
- Turn 07 Payroll: `0xd52810a4b3c705e705e9ec9304227844e06b63d8`
- Turn 06 PaydayFactory: `0x6abac7870a9f097cb1b478b921f6a5f0eeb0f204`
- Turn 06 Payroll: `0x17d3b8d4b15a3ae98f0cac5d13d1186e5f2813d4`
- Turn 05 PaydayFactory: `0xdf678be40a52ba1fcc0b6649b1fc404fa39ec90e`
- Turn 05 Payroll: `0x27480ffd23a3dbd3900a5c85dc0d536f5f033b9e`
- Turn 04 PaydayFactory: `0x220f3dcf6655e227b9723edf11d3aba9bce37335`
- Turn 04 Payroll: `0x56a451304a3c307c11648fdf6a5da6952a593cdd`
- Turn 03 PaydayFactory: `0x4db6f57e32575aec0a65a24d012dedeaf8da26c2`
- Turn 03 Payroll: `0xa0bd1bf078f566066105e786e8df8f29194cfc8d`
- Turn 02 PaydayFactory: `0x6c7ee2b2f94b07e0f33b2bfd912d36bfb20413ca`
- Turn 01 Payroll: `0x2590e4381a630a0d9df6549f71312098d0870e56`

## Turn 15b: proof page performance and polish

### Changes
- `src/proof/clients.ts`: batch transport (batchSize 20, wait 16 ms), retryCount 6, retryDelay 1000 ms.
- `src/proof/history.ts`: `parallel` param on `getLogsChunked` and `fetchPayrollHistory` (default 2).
- `src/proof/prove.ts`: `onLedger` callback fired after C7 (before C8 sim); `recentRunsOnly` param limits C8 scan; `parallel` threaded to history; `getAddress` on payroll before onLedger.
- `src/proof/useProofReport.ts`: passes `parallel: 6`, `recentRunsOnly: 12`, `onLedger`; exports `StreamedLedger`.
- `src/pages/ProofPage.tsx`: sections 2-4 stream from `streamedLedgers`; `min-width: 0` on grid children.
- `src/components/proof/ProofSheet.tsx`: VERIFIED stamp bottom 64px; mobile padding 20px; overflow-wrap anywhere on detail lines.
- `src/components/proof/LedgerTable.tsx`: WHEN col padded to 72px; `StreamedLedger` prop; `getAddress` on all addresses.
- `src/components/proof/WalletList.tsx`: `StreamedLedger` prop; `getAddress` on runner addresses.
- `src/components/proof/TotalsBand.tsx`: `StreamedLedger` prop; `getAddress` on factory.
- `src/components/proof/StudioFacts.tsx`: three separate rows (unit+invariant, fork, app); failing count styled as FAIL mark.
- `src/components/Nav.tsx`: Proof link moved to right group, 24px left of Connect.
- `scripts/gen-build-facts.ts`: excludes PayrollFork.t.sol from unit count; counts fork tests separately; new JSON shape.
- `src/generated/build-facts.json`: regenerated (foundry 83/0, fork 6, app 102/0).
- `src/proof/history.test.ts`: new, 2 concurrency tests.

### Test counts after turn 15b
- App tests: 102/102 pass (64 payroll + 38 proof)
- Proof tests: rows 4, runErrors 7, runMachine 17, lastPaidRun 6, cardState 10, format 21, checks 35, history 2
- Foundry unit/invariant: 83 pass, 0 fail (fork excluded)
- Fork tests: 6 (need Arc Foundry, not run in Studio)

## Turn 15c: proof page speed (Blockdaemon + event-based creation blocks)

### Changes
- `src/proof/clients.ts`: fallback transport (Blockdaemon primary at 100,000 blocks/query, Arc fallback at 10,000). No JSON-RPC batching. Exports LOG_SOURCES with name, url, chunk per node.
- `src/proof/history.ts`: added `chunk` param (default 10,000n) to getLogsChunked and fetchPayrollHistory.
- `src/deployments.ts`: added `factoryBlock: 28261674n` to ARC_MAINNET (same value as factoryDeployBlock, canonical name for log-source path).
- `src/proof/prove.ts`: added `logSources` option (named clients + chunk), `creationFromEvents` option (one getLogs call vs binary-search getCode), fallback loop for non-rate-limit history errors, `logSourceUsed` in ProofReport.
- `src/proof/useProofReport.ts`: passes logSources (per-URL clients from LOG_SOURCES), creationFromEvents true, parallel 6, recentRunsOnly 12.
- `src/pages/ProofPage.tsx`: second attribution line below snapshot showing which node was used, with link to Arc's docs.
- `src/proof/history.test.ts`: 2 new fallback tests (non-rate-limit error falls through to source 1; rate-limit propagates without reaching source 1).

### Test counts after turn 15c
- App tests: 104/104 pass (64 payroll + 40 proof)
- Proof tests: history 4 (2 concurrency + 2 fallback), rows 4, runErrors 7, runMachine 17, lastPaidRun 6, cardState 10, format 21, checks 35
- Foundry unit/invariant: 83 pass (fork excluded), fork 6 (need Arc Foundry)

## Turn 16a: per-payroll page (part 1 of 2)

### Changes
**Section E (proof page fixes):**
- `src/proof/clients.ts`: added `archiveClient` (Arc's own node, retryCount 6) for historical eth_calls that Blockdaemon prunes.
- `src/proof/prove.ts`: added `archive?: PublicClient` option; `balanceBefore`, C8 historical `readContract` calls, and C8 `simulateContract` at `foundBlock` now route through `arc` (archive or mainnet fallback) instead of the fallback-transport `mainnet`.
- `src/proof/useProofReport.ts`: passes `archive: archiveClient`.
- `src/components/proof/ProofSheet.tsx`: VERIFIED stamp moved to `right: '112px'` (was `right: '24px'`).

**Section B:**
- `src/proof/creation.ts`: `creationBlockOf(client, payroll, factory, fromBlock, toBlock, chunk?)` and `mainnetCreationBlockOf` convenience wrapper.
- `src/proof/creation.test.ts`: 3 tests (matching log, no log, null blockNumber).

**Section A:**
- `src/components/PayrollCard.tsx`: generalised card with `{ payroll, fromBlock, label, id? }` props; includes "Every payslip from this payroll" link (hidden on `/p/:address`).
- `src/components/DemoPayrollCard.tsx`: replaced with a 3-line wrapper forwarding `ARC_MAINNET.demoPayroll` / `demoPayrollBlock` / `"DEMO PAYROLL"`.

**Sections C.1, C.2, route:**
- `src/pages/PayrollPage.tsx`: guards (bad address, not a factory payroll, loading), header (PAYROLL label, employer-short h1, sub line, address + creation block), PayrollCard on the right. Mobile: one column below 768px.
- `src/App.tsx`: route `/p/:address`.

### Test counts after turn 16a
- App tests: 107/107 pass (64 payroll + 43 proof)
- New proof tests: creation.test.ts 3 (matching log, no log, null blockNumber)

## Turn 16b: payslips you can open (part 2 of 2)

### Files created
- `src/components/payroll/payslipUtils.ts`: pure utils -- `filterPayeeRows`, `buildPayeeCsv`, `buildAllCsv`, `downloadCsvFile`.
- `src/components/payroll/payslipUtils.test.ts`: 7 tests covering payee filter (3) and both CSV builders (4).
- `src/components/payroll/YourPayslips.tsx`: C.3 band showing connected payee's payslip count, total paid, held USDC, and CSV download. No signature needed.
- `src/components/payroll/EveryPayslip.tsx`: C.4 section with filter chips (All/Payslips/Tips/Funding), row-count sub, Download CSV, purpose-built table with clickable payslip rows. Fetches history via Blockdaemon-first/Arc-fallback same as /proof. Notifies parent when history is ready.
- `src/components/payroll/SlipDrawer.tsx`: C.5 right-side drawer (440px desktop, full-screen mobile). AnimatePresence slide-in 280ms, backdrop, focus trap, Escape/backdrop/button close, PAID stamp 430ms after settle, detail lines (Due/Paid/Block/Runner/Tip), "Open on explorer" link, "Copy link to this payslip" (copies ?slip=<tx>-<logIndex>). Exports `parseSlipParam`.

### Files edited
- `src/pages/PayrollPage.tsx`: added YourPayslips, EveryPayslip, SlipDrawer, ?slip= URL deep-link (via useEffect + setTimeout to avoid synchronous setState in effect).
- `src/components/proof/LedgerTable.tsx`: added `onPayslipClick?` prop to both desktop `<tr>` rows and mobile card divs.
- `src/payroll/runMachine.ts`: D.1 -- RECEIPT_OK and RECEIPT_REVERTED now transition from `failed{reason:'other'}` back to paid/reverted when the hash matches (late receipt after 60s warning).
- `src/payroll/runMachine.test.ts`: 3 new D.1 tests + 1 D.2 transparency test.
- `src/payroll/useRunPayday.ts`: D.1 -- 60s warning (no longer kills the wait); 600s waitForTransactionReceipt; variable renamed RECEIPT_WARNING_MS / RECEIPT_TIMEOUT_MS.
- `src/components/PayrollCard.tsx`: D.2 -- strip trailing `.` from detail before composing "Something went wrong: ..." line.
- `README.md`, `AGENTS.md`: updated.

### Test counts after turn 16b
- App tests: 117/117 pass (64 payroll + 43 proof + 7 payslipUtils + 3 new runMachine = 117)
- New tests: payslipUtils.test.ts 7 (filterPayeeRows x3, buildPayeeCsv x2, buildAllCsv x2); runMachine.test.ts +3 (D.1 late receipt: match, mismatch; D.2 transparency)

### Drawer ?slip= link format
`/p/<payroll>?slip=<txHash>-<logIndex>` -- `parseSlipParam` splits on last `-`.

---

## Turn 17a (/new payroll creation page)

No contracts changed. No transactions deployed or executed.

### New files
- `src/payroll/draft.ts`: `DraftPayroll` type, `validateDraft(draft, chainNow)`, `fundAmount`, `parseUsdcInput`, `PERIOD_OPTIONS`, `loadDraft`/`saveDraft` (localStorage key `ooyaa:draft:v1`).
- `src/payroll/draft.test.ts`: 19 tests (validateDraft x14, fundAmount x3, parseUsdcInput x4).
- `src/payroll/createMachine.ts`: pure reducer, steps: idle -> creating -> approving -> funding -> done. Events: CREATE_OK/REJECTED/SIM_FAIL, APPROVE_OK/REJECTED/SKIP, FUND_OK/REJECTED, WRONG_CHAIN, RETRY, RESET.
- `src/payroll/createMachine.test.ts`: 12 tests covering all transitions and failure/resume paths.
- `src/payroll/parsePayrollCreated.ts`: extracts new payroll address from decoded logs, filters to only the expected factory address.
- `src/payroll/createErrors.test.ts`: verifies CREATE_ERROR_NAMES covers all key names, and PayrollCreated parsing ignores events from other factory addresses.
- `src/payroll/useCreatePayroll.ts`: async runner for the creation machine (approve, simulate, execute, fund), dispatches machine events, returns state + submit + retry.
- `src/components/create/DraftPreview.tsx`: right-column live draft preview card showing up to 3 sample payslips with schedule and funded-for count. Fade-in CSS animation on value change.
- `src/components/create/StepList.tsx`: step indicator under the submit button (Create contract, Approve USDC, Fund contract), with idle/pending/done/failed icons.
- `src/components/create/CreateForm.tsx`: left-column form. Payee rows (address + amount, add/remove, up to 100), pay period segmented control, first payday datetime-local, tip field, fund paydays counter, fundLater toggle. Derives errors during render after first submit attempt.
- `src/pages/NewPayrollPage.tsx`: two-column layout, `CreateForm` left, `DraftPreview` right. localStorage draft persistence. Navigates to `/p/:address?created=1` on success.

### Files edited
- `src/payroll/runErrors.ts`: added `CREATE_ERROR_NAMES` map (13 factory custom error names).
- `src/pages/PayrollPage.tsx`: added `?created=1` toast "Payroll created. First payday HH:MM UTC, D Mon." (fires once on load when startTime available). Added `toast` import from sonner.
- `src/App.tsx`: added `/new` route importing `NewPayrollPage`.
- `src/components/Nav.tsx`: added "Create" link before "Proof" with same underline-on-hover pattern.
- `src/components/Hero.tsx`: added "Or create your own payroll in two minutes" text link below factory address line, with background-size underline animation.
- `src/index.css`: added `.fade-value` CSS animation (fade-in-value keyframe, 150ms).
- `README.md`, `AGENTS.md`: updated.

### Test counts after turn 17a
- App tests: 165/165 pass
- New tests: draft.test.ts (19), createMachine.test.ts (12), createErrors.test.ts (14) = +45 tests over prior 117
- Files tested across 16 files

---

## Turn 19 (history sources, closed+due fix, C8 copy honesty)

No contracts changed. No transactions deployed or executed.

### What changed

A. RPC setup (src/proof/clients.ts):
- Replaced Blockdaemon (pruned after 2.5 days) with optional VITE_ARC_RPC_URL (QuickNode).
- mainnetClient and archiveClient use fallback([QuickNode, Arc public]) when VITE_ARC_RPC_URL is set, else Arc public only.
- LOG_SOURCES now carries { name, client, parallel, chunk }; QuickNode gets parallel=8, Arc gets parallel=2.
- Removed all Blockdaemon references.

A. Shared readHistory helper (src/proof/history.ts):
- Exported readHistory(payroll, fromBlock, toBlock) -- iterates LOG_SOURCES, falls back on non-rate-limit errors, returns { history, sourceUsed }.
- isRateLimit guard lives here so the pattern is consistent everywhere.

A+D. history.test.ts:
- Added 3 new tests: parallel=8 cap, fallback when source 1 also throws, parallel=8 window cap via readHistory.
- Prior 4 tests kept unchanged.

A. prove.ts:
- logSources entries now carry parallel; fetchPayrollHistory called with src.parallel.
- C8 recentNote always says "Checked the k most recent of n runs." with real numbers.
- Removed "bun run prove checks all N" sentence.

A. useProofReport.ts:
- Simplified: LOG_SOURCE_OPTS = LOG_SOURCES (already has client/parallel/chunk).
- Removed per-source client construction.

A. ProofPage.tsx:
- sourceAttributionLine() shows: QuickNode / fallback-to-Arc / Arc-only based on logSourceUsed and PRIVATE_RPC_SET.

A. EveryPayslip.tsx:
- Replaced local fetchHistoryWithFallback and per-source clients with readHistory import.

A. lastPaidRun.ts:
- Added default parameter: client defaults to mainnetClient (QuickNode->Arc fallback).

A. PayrollCard.tsx:
- Removed hardcoded arcClient; passes undefined to lastPaidRun (uses default).

B. cardState.ts:
- closed + dueNow => { kind: 'due', ..., closedNote: true }. Only closed with nothing due returns { kind: 'closed' }.

B. cardState.test.ts:
- Added 3 new tests: closed+due => due, closedNote set, closed+funded+dueNow => due.
- Renamed old 'closed' test to 'closed with nothing due: kind is closed'.

B. PayrollCard.tsx:
- Removed 'Payroll closed' / disabled button branch for closed state (now unreachable when dueNow).
- Added closedNote line to statusLine(): "This payroll is closed. Paydays that already started can still be run."

C. ProofSheet.tsx: No changes needed -- the recentNote is in prove.ts detail lines.

Other: .env.example created with VITE_ARC_RPC_URL. README.md and AGENTS.md updated.

### Test counts after turn 19
- App tests: 170/170 pass
- New tests: history.test.ts +3 (parallel cap, double-fail, parallel=8), cardState.test.ts +3 (closed+due x2, funded) = +5 over prior 165

---

## Turn 20 (rate limiter, one period numbering, correct due time, filter count, .gitignore)

No contracts changed. No transactions deployed or executed.

### Changes
1. Rate limiter (clients.ts): `rateLimitedHttp(url)` wraps `http()` with a rolling-window concurrency cap (8 in-flight, 40/s) and 429/-32007 retry (300 ms, 3 times). The private node transport uses it; Arc fallback uses plain `http()`. `custom()` is used to wrap the inner transport into a valid viem Transport.

2. One fetch per page (useHistory.ts, history.ts, EveryPayslip.tsx, PayrollPage.tsx): `useHistory(payroll, fromBlock)` hook shares queryKey `['history', payroll.toLowerCase()]`, staleTime 60 s. On refetch it fetches only blocks after the cached horizon (`readHistory` now accepts a `prev` arg and uses `mergeHistory`). `EveryPayslip` was converted from `useQuery+readHistory` to `useHistory`. `PayrollPage` dropped the separate `chainHead` query. `useProofReport.onLedger` writes each fetched history into the react-query cache so `/p/:address` arriving after a `/proof` run has its data ready.

3. One period numbering (format.ts, rows.ts, LedgerTable.tsx, EveryPayslip.tsx, SlipDrawer.tsx): `periodDisplayLabel(index)` returns "Period 0038" for contract index 37. `describeRow(row)` in `rows.ts` is the single source of WHAT text used by both the /proof ledger and the /p/:address table. Old `#0038` form removed. CSV files now have `period_index` (0-based) and `period_label` columns everywhere.

4. Due time fix (SlipDrawer.tsx): `dueTs = startTime + period * periodLength`. Previously used `period + 1`, which placed the due time one period too late.

5. Filter count (EveryPayslip.tsx): when a filter is active the count reads "X of Y rows, newest first". Download CSV button shows "Download CSV (N rows)".

6. Repository hygiene: `.gitignore` written by the reviewer, kept as uploaded.

### Test counts after turn 20
- App tests: 177/177 pass
- New tests: history.test.ts +2 (mergeHistory), format.test.ts +5 (periodDisplayLabel x3, periodDueTime x2), rows.test.ts +1 (describeRow), payslipUtils.test.ts +2 headers updated, payslipUtils.test.ts +2 data row content = +7 over prior 170

---

## Turn 18 (/docs reader, site footer, Nav Docs link)

No contracts changed. No transactions deployed or executed.

### New files
- `src/components/docs/nav.ts`: canonical doc order in 6 groups (start, concepts, guides, developers, security, more), NAV_ORDER flat list
- `src/components/docs/docParser.ts`: `parseFrontMatter`, `headingId`, `extractHeadings`, `searchDocs`
- `src/components/docs/MermaidBlock.tsx`: lazy mermaid renderer (base theme, fallback to code block on error)
- `src/components/docs/DocReader.tsx`: react-markdown renderer with custom h1-h4, p, ul, ol, a, code, pre, table, blockquote, hr, strong; mermaid fenced blocks delegate to MermaidBlock; copy button on code blocks
- `src/components/docs/DocSearch.tsx`: sidebar search input + results list with snippet
- `src/components/docs/docs.test.ts`: 11 tests for parseFrontMatter (3), headingId (4), searchDocs (5), nav coverage (2)
- `src/pages/DocsPage.tsx`: three-column layout (240px sidebar, max-720px content, 200px on-this-page); sticky sidebars; mobile sheet menu; mobile collapsible on-this-page; prev/next; active heading tracker via IntersectionObserver; page title via document.title; scroll-to-top on slug change; uses import.meta.glob for eager markdown loading
- `src/components/Footer.tsx`: three-column footer (wordmark, nav links, chain fact); stacks on mobile; factory explorer link

### Edited files
- `src/App.tsx`: added /docs and /docs/:slug routes importing DocsPage
- `src/components/Nav.tsx`: refactored to helper function `navLink`; added Docs link; added mobile menu (hamburger button + dropdown with Create/Proof/Docs); mobile layout shows Connect + menu button; desktop shows all links + Connect

### Dependencies added
- `react-markdown@10.1.0`
- `remark-gfm@4.0.1`
- `mermaid@12.2.0`

### Fact discrepancies noted in docs (text unchanged per Turn 18 rule)
- `content/docs/judges.md` and `content/docs/limits.md` say "170 app tests"; actual count is 191 after Turn 18.
- `content/docs/judges.md` says "83 Foundry tests, 6 fork tests and 170 app tests pass"; the app test count was 177 before Turn 18 and is now 191.
- These figures are in user-uploaded doc files; the text was left untouched as required.

### Test counts after turn 18
- App tests: 191/191 pass (177 prior + 14 new docs tests: parseFrontMatter x3, headingId x4, searchDocs x5, nav coverage x2; one pre-existing "Invalid credentials" error remains)
- New tests: docs.test.ts file, 14 tests

## Turn 17b (employer and payee actions on /p/:address + Your payrolls on /new)

No contracts changed. No transactions. All actions visitor-signed only.

### New files
- `src/components/payroll/EmployerPanel.tsx`: shown only to the connected employer; reads live owed/freeBalance from the contract; three sub-panels: FundPanel (approve+fund with step list), WithdrawPanel (amount input + Max button), ClosePanel (confirm block requiring "close" to be typed before the button activates); each step simulates first; toasts with tx link on success; refetches live figures after each action
- `src/components/payroll/ClaimButton.tsx`: "Claim <amount> USDC" button for payees with held pay; simulates claim() first; toasts with tx link on success; calls onSuccess to trigger parent refetch
- `src/components/payroll/employerPanel.test.ts`: 22 tests: visibility (employer/payee/stranger/no-wallet/employer-not-loaded/case-insensitive x6), claim button visibility (3), withdraw max formatting (5), withdraw error copy (2), close confirm gate (6)

### Edited files
- `src/pages/PayrollPage.tsx`: imports EmployerPanel; reads live claimable for the connected wallet (useReadContract); passes claimable and onClaimSuccess to YourPayslips; passes state to EmployerPanel; handleActionSuccess refetches state + claimable after any employer/payee action
- `src/components/payroll/YourPayslips.tsx`: imports ClaimButton; accepts onClaimSuccess prop; renders ClaimButton when claimable > 0n
- `src/pages/NewPayrollPage.tsx`: imports factoryAbi, shortAddress, ARC_MAINNET, useAccount, useReadContract, Link, getAddress; adds YourPayrolls component above the form (calls factory.payrollsCreatedBy(wallet, 0, 20), renders short addresses as chips linked to /p/<address>)

### Test counts after turn 17b
- App tests: 213/213 pass (191 prior + 22 new employer panel tests)

## Turn 22 (release polish: dash sweep, tsconfig exclude, deleted placeholder files, agent-note comments, C8 sentence, Payroll.t.sol comment)

No contracts changed. No transactions. No deployments.

### Changes
- Long dashes (U+2014/U+2013) removed from: scripts/compass-deploy.ts, scripts/compass-deploy-helpers.ts, scripts/self-deploy.ts, scripts/fetch-abi.ts, scripts/check.sh, src/tracing.ts, src/onchain-money.ts, src/onchain-facts.ts, src/console-capture.ts, src/onchain-wait.ts. Each rewritten as a full stop, colon, or comma pair.
- tsconfig.json: added "exclude" for scripts/compass-deploy.ts (imports @circlefin/compass-chains, Studio-only). compass-deploy-helpers.ts does not import it, so excluded only compass-deploy.ts.
- .oxlintrc.json: added scripts/compass-deploy.ts to ignorePatterns so lint skips the Studio-only unsafe-member-access errors.
- Deleted: .agents/skills/example/ (placeholder skill), scripts/call-create-payroll.ts (one-shot script not imported anywhere).
- Integration test comments: rewrote "sandbox session", "(from task)", "as given in task", "per task", "task explicitly provides" in both integration test files.
- contracts/test/Payroll.t.sol line 1419: replaced "Create a payroll with tipPerRun = 0" with a why-comment explaining the no-zero-transfer path.
- AGENTS.md: an internal team name replaced with "reviewer"; the "unlock" sentence rewritten.
- src/pages/LabPage.tsx: "kitchen-sink" -> "design reference".
- src/proof/prove.ts C8 output: combined the two push() calls into one sentence per outcome; uses periodDisplayLabel() from payroll/format.ts for the period label.
- Uploaded files kept as uploaded: README.md, content/docs/limits.md, content/docs/judges.md, docs/security/threat-model.md.

### Test counts after turn 22
- Foundry (unit+invariant): 89/89 pass
- App tests: 228/228 pass
- bun run build: exit 0 (chunk-size warnings are pre-existing, not errors)

---

## Turn 25 (judge fixes: card off-by-one, clickable slips, live gas estimate, run counts, outside-run Hero line, Mermaid flowchart, prompts build log)

No contracts changed. No transactions. No deployments.

### Changes
- `src/components/Payslip.tsx`: added optional `onClick` prop; card inner div gains pointer cursor and hover lift when onClick is set.
- `src/components/PayrollCard.tsx`: fixed period prop passed to Payslip slips (uses the paid period index so periodDisplayLabel adds one exactly once); fixed status line and toast to use periodDisplayLabel; added `onSlipClick` prop; calls it when a paid slip is clicked.
- `src/components/DemoPayrollCard.tsx`: wires `onSlipClick` to navigate to `/p/<payroll>?slip=<txHash>-0`.
- `src/pages/PayrollPage.tsx`: `PayrollHeader` accepts `onSlipClick`; `PayrollPageInner` adds `handleCardSlipClick` that finds the matching DrawerRow and calls `openDrawer`.
- `src/components/create/CreateForm.tsx`: live `estimateContractGas` for createPayroll (debounced 600 ms); USDC = gas * gasPrice / 1e18; shows "Gas to create this payroll: about X USDC (live estimate)" when valid, else "The gas estimate appears when the form is valid."
- `src/components/proof/WalletList.tsx`: counts PaydayRun events per runner across all ledger histories; shows "OUTSIDE, N runs" / "OURS, N runs".
- `src/components/Hero.tsx`: uses useHistory + usePayrollState for demo payroll; renders outside-run proof line under the factory address, linking to /proof; reserves one line of height while loading.
- `src/components/docs/MermaidBlock.tsx`: flowchart.useMaxWidth false in mermaid.initialize; flowchart containers get minWidth: max-content inside a scrollable outer div.
- `AGENTS.md`: line 1 changed from "# [App Name]" to "# Ooyaa".
- `prompts/*.md` (55 files): Studio build log committed.

### Test counts after turn 25
- App tests: 231/231 pass (228 existing + 3 new gas estimate gate tests)
- bun run build: exit 0

---

## Turn 26 (Studio tracing confined to preview iframe)

No contracts changed. No transactions. No deployments.

### Edited files
- `src/tracing.ts`: added `IN_STUDIO_PREVIEW` guard at top; all side effects (fetch patch, ethereum defineProperty, EIP-6963 listener, message listener, setupTraceAPI, log init) only run when inside the preview iframe; `registerChain` is a no-op outside.
- `src/console-capture.ts`: added `IN_STUDIO_PREVIEW` guard; console patching loop and both window event listeners only run when inside the preview iframe.

### Why
tracing.ts called `Object.defineProperty(window, 'ethereum', ...)` on every page load, even on the public Vercel site. Console-capture wrapped every `console.*` call site-wide. Neither does anything useful outside the Arc Studio preview iframe, and the ethereum redefinition is a wallet-layer risk for public visitors.

### Test counts after turn 26
- App tests: 231/231 pass
- tsc: clean
- bun run build: exit 0

---

## Turn 29a (UX audit part 1: card truth, trust line, clearer copy)

No contracts changed. No transactions. No deployments.

### Edited files
- `src/components/PayrollCard.tsx`: `slipPeriodFor` -- due state now returns `nextUnpaid` (the period about to be run); idle state returns `lastPaidPeriod`; just-paid returns the paid period. `headerStatus` -- n>1 now says "N paydays waiting". `statusLine` -- waiting > 1 says "Nothing is skipped. Run one to pay the oldest waiting payday and keep the X USDC tip."
- `src/components/Hero.tsx`: button label changed to "Run a payday"; hero trust line replaced with Plex Sans 500 1.125rem --ink sentence + proof link; "Live on Arc mainnet" mono line kept below; `TEAM_WALLET_SET` imported and used to exclude team wallets from outside count.
- `src/deployments.ts`: `ARC_MAINNET.teamWallets` added.
- `src/proof/ourWallet.ts`: new file -- `TEAM_WALLET_SET` and `isOurWallet(address, ledger)` helper.
- `src/proof/checks.ts`: `buildLedger` excludes `TEAM_WALLET_SET` from `outsideRunners`.
- `src/components/proof/WalletList.tsx`: `collectRunners` uses `isOurWallet`; description text adds "or one of the team's own test wallets".
- `src/components/create/CreateForm.tsx`: summary box says "confirm 3 wallet prompts ... approve USDC"; fund section label changed to "Put in USDC for ... paydays (N USDC)"; fund-later checkbox says "Fund later (nothing is paid until you add USDC)"; unused `fundLine` removed.
- `src/pages/PayrollPage.tsx`: h1 shows "Demo payroll" for demoPayroll, "Payroll" for others; address row replaced with "Employer X, contract Y" mono line, both linked; `creationBlockData` query and `creationTime` helper removed.
- `src/components/payroll/EveryPayslip.tsx`: CSV button disabled (opacity 0.35) while history is loading; shows "Download CSV" (no row count) while loading.
- `src/components/payroll/SlipDrawer.tsx`: slip rendering area gets 24px padding on all sides; detail area top padding set to 0 (already has 24px from slip area below).

### Test counts after turn 29a
- App tests: 248/248 pass
- tsc: clean
- bun run build: exit 0

---

## Turn 29f (Run again starts from a clean proof sheet)

No contracts changed. No transactions. No deployments.

### Key changes
- `src/proof/useProofReport.ts`: `toProofStatus(status, fetchStatus)` now takes both query values. Returns 'loading' when `status === 'pending'` OR `fetchStatus === 'fetching'`, so a TanStack Query v5 refetch (status stays 'success', fetchStatus becomes 'fetching') maps to 'loading' and the whole UI resets correctly.
- `src/components/proof/ProofSheet.tsx`: `resetStamp()` exposed on the imperative handle. Calls `setStampShown(false)` and `stampControls.set(...)` to immediately hide the stamp and reset the framer animation position. Called from ProofPage's `handleRerun` before `rerun()`.
- `src/pages/ProofPage.tsx`: `handleRerun` calls `sheetRef.current?.resetStamp()` before `rerun()`.
- `src/proof/toProofStatus.test.ts`: updated with the four cases from the spec: ('success','fetching') -> 'loading'; ('pending','fetching') -> 'loading'; ('success','idle') -> 'success'; ('error','idle') -> 'error'.

### Test counts after turn 29f
- App tests: 266/266 pass (+2 from toProofStatus)
- tsc: clean
- bun run build: exit 0

---

## Turn 29e (UX audit part 5: steady proof sheet, honest stamp, read-so-far label)

No contracts changed. No transactions. No deployments.

### Key changes
- `src/components/proof/ProofSheet.tsx`:
  - Progress line always rendered; `visibility: hidden` (not removed) when the run ends, so the 34px box stays in layout and the sheet never jumps.
  - `stampShown` state added. `stampVerified()` sets it to true before animating. Until it fires, the stamp has `visibility: 'hidden'` and `aria-hidden={true}`, so "VERIFIED" is absent from screen readers and copy-paste before it is earned.
- `src/pages/ProofPage.tsx`:
  - Snapshot line gets class `proof-snapshot-line`, `lineHeight: 1.5`, `minHeight: '1.5em'` (3em on mobile via CSS).
  - Attribution line gets class `proof-attribution-line`, `lineHeight: 1.5`, `minHeight: '3em'` (4.5em on mobile via CSS).
  - `running={isLoading}` passed to TotalsBand.
- `src/index.css`: `@media (max-width: 767px)` block for `proof-snapshot-line` (3em) and `proof-attribution-line` (4.5em).
- `src/components/proof/TotalsBand.tsx`: `running` prop added. Caption uses `running` for the "Read so far: k of n" vs "Across n" toggle (previously used `loading`, which became false as soon as data streamed).

### Test counts after turn 29e
- App tests: 264/264 pass (unchanged)
- tsc: clean
- bun run build: exit 0

---

## Turn 29d (UX audit part 4: VERIFIED across payrolls, full pending rows, streaming totals)

No contracts changed. No transactions. No deployments.

### Key changes
- `src/proof/mergeChecks.ts`: `isVerified(checks)` exported. True when all 8 merged rows are PASS; a SKIP from any payroll stays SKIP in the merged row and blocks the stamp. The 1 Nov payroll SKIPs C8 (no paydays), so the real factory verdict is unverified until a second payroll PASSes C8.
- `src/proof/mergeChecks.test.ts`: 6 new `isVerified` tests (all PASS, demo PASS + other SKIP, FAIL blocks, standalone SKIP blocks, missing id, empty).
- `src/pages/ProofPage.tsx`: stamp effect uses `isVerified(checks)` instead of `checks.every(c => c.status === 'PASS')`.
- `src/components/proof/ProofSheet.tsx`: `CheckRow` gains `rowId` prop. Pending rows now show their id and title at the same `padding: '14px 0'` height as completed rows, eliminating the 26px growth per row on arrival.
- `src/pages/ProofPage.tsx`: `loading={isLoading && displayLedgers === undefined}` so TotalsBand switches from skeleton to live numbers as soon as the first payroll streams.
- `src/components/proof/TotalsBand.tsx`: `useCountUp` stores the live on-screen value in `screenRef` and starts each new animation from wherever the counter is, not from the last finished target. `SkeletonBar` accepts a `height` prop; skeleton columns match BandItem's 12px label + 6px gap + 40px number = 58px so the skeleton-to-live swap shifts nothing.
- `src/index.css`: tap-target additions for `.every-payslip-link`, `.copy-address-btn` 44x44, `.period-btn` height 44px, `.footer-link` min-width 44px.
- `src/components/PayrollCard.tsx`: `every-payslip-link` class on the "Every payslip from this payroll" link.

### Test counts after turn 29d
- App tests: 264/264 pass (+6 from isVerified)
- forge tests: 89/89 pass (unit only, no fork)
- tsc: clean
- bun run build: exit 0

---

## Turn 29c (UX audit part 3: one proof verdict, loading state, layout shift, tap targets)

No contracts changed. No transactions. No deployments.

### Key changes
- `src/proof/mergeChecks.ts`: new. Collapses per-payroll C4..C8 results into one row per id. FAIL beats SKIP beats PASS. Lines from multiple payrolls prefixed with short address.
- `src/proof/checks.ts`: `CheckResult` gains optional `payroll?: Address`.
- `src/proof/prove.ts`: C4..C8 results tagged with payroll address via `taggedCheck()`. `onPayrolls` callback fires once payrolls are enumerated.
- `src/proof/useProofReport.ts`: `toProofStatus()` maps TanStack Query v5 'pending' to 'loading'; removes the `as ProofStatus` cast. Exposes `payrollCount`.
- `src/components/proof/ProofSheet.tsx`: renders from `mergeChecks(checks)`. `allDone = status === 'success'`. Footer always in layout (visibility:hidden until done). Stamp never toggles display. Progress uses "Check N of 8: ..." (no &mdash;).
- `src/pages/ProofPage.tsx`: stamp fires on `status === 'success'`, not count. Passes `payrollCount` to TotalsBand.
- `src/components/proof/TotalsBand.tsx`: shows "Read so far: k of n payrolls..." while loading. `useCountUp` never decreases.
- `src/pages/PayrollPage.tsx`: employer+contract line is an inline `<p>` sentence (no flex-gap before comma). CopyButton gets `copy-address-btn` class.
- `src/index.css`: tap-target rules for logo links, footer links, badge, copy button, secondary buttons, mobile tx links, period buttons, docs controls.
- `src/components/Nav.tsx`: `nav-logo-link` class.
- `src/components/Footer.tsx`: `footer-logo-link` and `footer-factory-link` classes.
- `src/components/create/CreateForm.tsx`: `period-btn` class.
- `src/pages/DocsPage.tsx`: `docs-otp-toggle` class on MobileOnThisPage button.
- ~50 ` -- ` comment dashes replaced across src/, scripts/, contracts/test/, contracts/test-helpers/.
- `scripts/gen-abi.ts` and `src/proof/abi.ts` header updated to remove ` -- `.

### Test counts after turn 29c
- App tests: 258/258 pass (+10 from mergeChecks.test.ts and toProofStatus.test.ts)
- forge tests: see commit
- tsc: clean
- bun run build: exit 0

---

## Turn 29b (UX audit part 2: contrast, focus, tap targets, docs, proof layout, link previews)

No contracts changed. No transactions. No deployments.

### Edited files
- `src/index.css`: --ink-3 changed to #666975; :focus-visible rule added; #root gets 72px bottom padding at >=768px; tap-target CSS classes.
- `tailwind.config.js`: comment updated to record new --ink-3 value.
- `src/components/Hero.tsx`: word spans now include literal space for screen reader / copy-paste; hero-text-link class added to /new and /proof links.
- `src/components/Nav.tsx`: mobile Connect and menu button raised to 44px.
- `src/components/Payslip.tsx`: entrance animation opacity removed; only y and rotate animate.
- `src/components/payroll/SlipDrawer.tsx`: close button raised to 44px.
- `src/components/payroll/EveryPayslip.tsx`: filter chips get filter-chip class; payslip rows get role+tabindex+keyboard+chevron; fmtTime always includes date.
- `src/components/proof/LedgerTable.tsx`: payslip rows get role+tabindex+keyboard+chevron; formatUtcTime always includes date.
- `src/components/create/CreateForm.tsx`: Add a payee add-payee-btn class; fund-later-label class; formatUsdc double-USDC fixed.
- `src/components/PayrollCard.tsx`: formatUsdc double-USDC fixed (underfunded line, refused-underfunded, waiting status tip).
- `src/pages/DocsPage.tsx`: Footer removed (App.tsx already provides it); h1 shown on all viewports.
- `src/components/docs/MermaidBlock.tsx`: flowchart useMaxWidth: true; minWidth max-content removed.
- `src/pages/ProofPage.tsx`: snapshot + attribution lines reserved at first paint (minHeight 1.3em).
- `src/components/proof/ProofSheet.tsx`: progress shows "Check N of 8 -- ...".
- `index.html`: og:* and twitter:* meta tags added.
- `src/pages/PayrollPage.tsx`: employer+contract line uses comma separator.

### Test counts after turn 29b
- App tests: 248/248 pass
- tsc: clean
- bun run build: exit 0

---

## Turn 28 (C3 accepts payrolls made after launch by code identity)

No contracts changed. No transactions. No deployments.

### Edited files
- `src/proof/prove.ts`: exported `buildC3` pure helper; C3 block now calls it; four fixed addresses (mainnet factory, demo payroll, testnet factory, testnet reference) still use Sourcify; every other factory payroll is evaluated by runtime equality against `trRuntime` (testnet reference); FAIL beats SKIP beats PASS across all lines.
- `src/proof/proveC3.test.ts`: new test file; 5 tests covering equal-runtime PASS, different-runtime FAIL, demo 404 FAIL, FAIL-beats-SKIP, and no-extra-payrolls PASS.

### Test counts after turn 28
- App tests: 241/241 pass
- tsc: clean
- bun run build: exit 0
- bun run prove: C3 PASS; 0x153E...EbAEa shows code-identity line

---

## Turn 27 (hero button runs payday)

No contracts changed. No transactions. No deployments.

### Edited files
- `src/components/PayrollCard.tsx`: added `press()` and `highlight()` to `PayrollCardHandle`; `handlePress` is a no-op when `runState.kind` is checking/signing/pending; `highlightCard` pulses a 2px `--ink` outline that fades over 900 ms; `cardDivRef` attached to card root div; all three exposed via `useImperativeHandle`.
- `src/components/Hero.tsx`: replaced `scrollToCard` with `handleHeroButton`; scrolls only when button not fully in view; calls `cardRef.current.press()` and `cardRef.current.highlight()` immediately; focus move kept.
- `src/components/payrollCardPress.test.ts`: new test file; 5 tests covering the busy guard (isBusy for checking/signing/pending, and that a second click while pending does not start a second run).

### Test counts after turn 27
- App tests: 236/236 pass
- tsc: clean
- bun run build: exit 0

---

## Turn 21 (final polish: footer, C8, creation fast-path, card state, privacy disclosure, C2 empty-code fix, docs overflow, Foundry tests)

No contracts changed. No transactions. No deployments.

### Edited files
- `src/App.tsx`: added shared Layout component; Footer rendered on every page except /lab
- `src/proof/prove.ts`: C8 rewritten to find most recent caught-up run from history.blockTimes only (no extra RPC per candidate); removed "last 5 runs" window; captured history as resolvedHistory const to satisfy TypeScript narrowing
- `src/proof/creation.ts`: short-circuit for the demo payroll address (known creation block, zero network calls); 8-parallel forward scan (parallel arg changed from 1 to 8)
- `src/proof/creation.test.ts`: added two tests for the demo payroll fast-path
- `src/proof/code.ts`: runtimeEquals returns false when either side is empty or "0x" sentinel
- `src/proof/code.test.ts`: added runtimeEquals describe block (7 tests)
- `src/proof/c8CaughtUp.test.ts`: 5 tests for the isCaughtUp helper
- `src/payroll/cardState.ts`: underfunded condition now uses onePeriodCost = totalDeferred + periodTotal + tipPerRun (contract's exact requirement); due state gains optional partialNote{funded,total} when balance covers some but not all owed paydays; underfunded gains shortfall field
- `src/payroll/cardState.test.ts`: underfunded test updated for shortfall field; 3 new tests for partialNote and exact contract condition
- `src/components/PayrollCard.tsx`: underfunded info line shows shortfall; due info line shows partial funding note
- `src/components/create/CreateForm.tsx`: summary box has second paragraph disclosing that payee addresses and amounts are public on Arc
- `src/components/docs/DocReader.tsx`: inline code style adds overflowWrap:anywhere and wordBreak:break-all for phone layout
- `contracts/test/Payroll.t.sol`: added tests 33-36 (AlreadyClosed double-close, Funded event, Withdrawn event, Claimed event via blocklist-based deferral)
- `contracts/test/PaydayFactory.t.sol`: added tests 31-32 (payrollAt out-of-range reverts OffsetOutOfRange, allPayrolls offset-at-end returns empty)
- `src/generated/build-facts.json`: regenerated via bun run facts
- `README.md`: test counts updated (89 Foundry, 228 app)
- `AGENTS.md`: this entry

### Test counts after turn 21
- Foundry (unit+invariant): 89/89 pass
- App tests: 228/228 pass
- New tests: c8CaughtUp.test.ts (5), code.test.ts runtimeEquals (7), creation.test.ts fast-path (2), cardState.test.ts (3 new + 1 updated), Foundry x6 (3 Payroll.t.sol, 2 PaydayFactory.t.sol)
