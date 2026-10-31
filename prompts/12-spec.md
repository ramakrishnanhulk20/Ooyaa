PROVE-IT SPEC (turn 12)

FACTS (measured by us on 28 Oct)
- Mainnet: viem `arc` (5042). PaydayFactory 0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b, deploy block 28261674, explorer https://explorer.arc.io. Demo payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A.
- Testnet: viem `arcTestnet`. Your factory 0xb32feb10b48d753dee8938435ebe1c303ce6955b, your reference Payroll 0x1b31ea6ce9c6ad70444c476166eb219026e6c1d3, explorer https://explorer.testnet.arc.io.
- All four are Sourcify exact_match. Payroll has no immutables, so every factory-made payroll's runtime equals contracts/out/Payroll.sol/Payroll.json deployedBytecode.object.
- eth_getLogs on both public RPCs: at most 10,000 blocks per call (toBlock - fromBlock <= 9,999). Over that: error code -32012, "requested range too large". Blocks are about 0.5 s apart.
- Historical state works: eth_call at an old blockNumber is served.
- Every USDC transfer logs Transfer twice: once from 0xffff...fffe (18 decimals) and once from 0x3600000000000000000000000000000000000000 (6 decimals). Use only logs whose address is 0x3600...0000.
- Payroll has no setter for startTime, periodLength or tipPerRun, so period n starts at startTime + n * periodLength.
- As of block 28281438: payrollCount 1; one PaydayRun (period 0, runner 0xd57D...12E9, paid 30000, deferred 0, tip 10000, tx 0x0692c42d...7fec); 3 PayslipIssued at 10000; Funded 1500000; balance 1460000; nextUnpaid 1. The runner is also a payee, so that tx holds two separate 10000 transfers to the same address.

FILES AND INTERFACES
1. src/deployments.ts: `ARC_MAINNET = { chainId: 5042, factory, factoryDeployBlock: 28261674n, explorer }`, `ARC_TESTNET = { chainId: 5042002, factory, referencePayroll, explorer }`, `USDC_ADDRESS`. All `as const`.
2. src/proof/abi.ts: `payrollAbi` and `factoryAbi`, the full `abi` arrays copied verbatim from contracts/out/Payroll.sol/Payroll.json and contracts/out/PaydayFactory.sol/PaydayFactory.json, `as const`. For USDC, use viem's `erc20Abi`.
3. src/proof/history.ts (I/O only, no Node APIs):
   - `type UsdcTransfer = { txHash: Hex; blockNumber: bigint; logIndex: number; from: Address; to: Address; value: bigint }`
   - `type PayrollHistory = { payroll: Address; fromBlock: bigint; toBlock: bigint; events: <viem parseEventLogs result for payrollAbi>; usdcOut: UsdcTransfer[]; usdcIn: UsdcTransfer[]; blockTimes: Map<bigint, bigint> }`. Every list is sorted by (blockNumber, logIndex).
   - `getLogsChunked(client, filter, fromBlock, toBlock)`: chunks of 10,000 blocks, at most 4 in flight. On -32012 or "range too large", halve that chunk and retry it. On any other error, retry 3 times (500, 1000, 2000 ms), then throw. Never return a partial result.
   - `findCreationBlock(client, address, lo, hi)`: binary search on getCode (empty before creation, non-empty from it on).
   - `fetchPayrollHistory(client, payroll, fromBlock, toBlock, onProgress?)`: three chunked queries: (a) every log from the payroll; (b) USDC Transfer with topic1 = payroll; (c) USDC Transfer with topic2 = payroll. blockTimes holds the timestamp of every PaydayRun block: use log.blockTimestamp when the RPC returns it, otherwise getBlock, cached.
4. src/proof/checks.ts (pure, no I/O): `type CheckStatus = 'PASS' | 'FAIL' | 'SKIP'`, `type CheckResult = { id: string; title: string; status: CheckStatus; lines: string[] }`, and the C5, C6 and C7 functions below, plus `summarizeLedger`.
5. src/proof/code.ts: `runtimeEquals(a, b)` (lowercase hex compare), `sourcifyStatus(chainId, address, fetchImpl = fetch)` returning 'exact_match' | 'match' | 'not_verified' | { unreachable: string }. It uses GET https://sourcify.dev/server/v2/contract/{chainId}/{address}; a null match or HTTP 404 is not_verified; network errors and 5xx are retried 3 times, then unreachable.
6. src/proof/prove.ts: `prove(opts: { mainnet: PublicClient; testnet: PublicClient; payrolls?: Address[]; localRuntime?: { factory: Hex; payroll: Hex }; onProgress? }): Promise<ProofReport>`. It runs C1 to C8 and builds the ledger.
7. scripts/prove-it.ts: the CLI, the only file that uses node:fs.
   - Flags: `--payroll <address>` (repeatable; default: every payroll the factory made), `--json <path>`, `--rpc <url>` (overrides the mainnet RPC).
   - It reads the two contracts/out artifacts when they exist.
   - Each client's getChainId must be 5042 and 5042002; otherwise exit 2 with the reason.
   - Exit 0 when no check FAILs; 1 on any FAIL or fetch failure; 2 on a usage or config error.
8. package.json: `"prove": "bun run ./scripts/prove-it.ts"`.

SNAPSHOT RULE: read the mainnet block number once at the start (toBlock). Every mainnet read uses `blockNumber: toBlock`, so the report is one consistent picture.

CHECKS (keep these ids and titles)
- C1 "local build": with artifacts, the factory runtime and every checked payroll's runtime must equal deployedBytecode.object exactly. Print keccak256 of each. Without artifacts: SKIP, "run bun run contracts:build first (needs Foundry)".
- C2 "same code on mainnet and testnet": the mainnet factory runtime equals the testnet factory's; every mainnet payroll runtime equals the testnet reference Payroll's. Print the keccaks.
- C3 "verified source": Sourcify exact_match for the mainnet factory, every checked payroll, the testnet factory and the testnet reference Payroll. Partial match or not verified: FAIL. Unreachable: SKIP with the reason.
- C4 "made by the factory": for each payroll, isPayroll is true, and a PayrollCreated log naming it exists in its creation block (findCreationBlock, then getLogs for that one block). That block is the history's fromBlock. If it fails, report the FAIL and build no ledger for that payroll.
- C5 "paid exactly once, in order": the PaydayRun periods, sorted, are exactly 0, 1, ..., k-1, with no repeat and no gap, and nextUnpaid() equals k.
- C6 "every payslip is a real USDC transfer": for each PaydayRun in tx T:
  - the PayslipIssued amounts in T for that period sum to paid, and the PayoutDeferred amounts sum to deferred;
  - each PayslipIssued(payee, period, amount) consumes one unused USDC transfer in T from the payroll to payee with that value;
  - if tip > 0, one more unused transfer to the runner with value tip;
  - a transfer is consumed at most once.
- C7 "every cent accounted for":
  - every transfer in usdcOut is consumed exactly once by a payslip, a tip (C6), a Claimed(payee, amount) in the same tx, or a Withdrawn(to, amount) in the same tx. List any unexplained outflow by tx hash.
  - Every Funded(from, amount) consumes one transfer in usdcIn from `from` with that value in the same tx. Other inflows are listed as direct deposits, which are not a failure.
  - balanceOf(payroll) at toBlock minus balanceOf at fromBlock - 1 equals sum(usdcIn) - sum(usdcOut).
- C8 "a second run is refused":
  - Walk back from the latest PaydayRun, at most 5 runs, to the first block B where nextUnpaid() >= startedPeriods() at B. eth_call run() at B from 0x000000000000000000000000000000000000dEaD must revert with error NothingDue. No run yet, or no such B: SKIP with the reason.
  - At toBlock: if dueNow() is false, run() must revert NothingDue. If it is true, simulate run(). Success prints "payday N is due now; anyone can run it for X USDC". Underfunded prints owed and balance as an info line, not a FAIL.

LEDGER (per payroll, events only, every amount realised)
- Header: payroll, employer, payee count, tip, period length.
- Table of the most recent 20 paydays (period, paid at UTC, late = block time - period start, runner, paid, deferred, tip, short tx), then "(N earlier paydays in the JSON report)". Then explorer links for the 10 most recent paydays.
- Totals: paydays, payslips, paid to payees, tips, deferred, claimed, funded, withdrawn, direct deposits.
- From getState at toBlock: balance, owed, runway, next payday (UTC).
- Distinct wallets:
  - runners;
  - outside runners: not the employer, not any past employer (EmployerTransferred), not any address ever named as a payee (PayslipIssued, PayoutDeferred, PayeeAdded, or getPayees at toBlock);
  - payees paid; funders;
  - all wallets that sent or received USDC through the payroll.
- When there is more than one payroll, add grand totals.
- Amounts use formatUnits(value, 6) plus " USDC". Show addresses as 0x1234...abcd in tables, and in full in the header and the JSON.

OUTPUT
- Line 1: `Ooyaa prove-it`. Line 2: `Network: Arc Mainnet (chain 5042), snapshot block <n> (<UTC ISO time>)`. Line 3: the factory address and its explorer link.
- Then one line per check: `PASS  C1 local build: <detail>`, followed by its indented lines.
- Then each ledger. Last line: `RESULT: <p> passed, <f> failed, <s> skipped`.
- Progress goes to stderr: "scanning blocks a to b (n chunks)".
- Plain ASCII text, no colours, no emoji.
- `--json` writes the whole ProofReport, with bigints as decimal strings.

TESTS (src/proof/checks.test.ts, bun:test, synthetic histories)
1. A clean history passes C5, C6 and C7. It has one run, three payslips, a tip, and the runner is also a payee.
2. A payslip with no matching transfer fails C6.
3. Two payslips to one payee in one tx, with only one transfer, fails C6.
4. Payslip amounts that do not sum to PaydayRun.paid fail C6.
5. A repeated period fails C5.
6. A gap (periods 0, 2) fails C5.
7. nextUnpaid not equal to the run count fails C5.
8. An outflow with no event fails C7.
9. A Funded event with no matching inflow fails C7.
10. A balance delta that does not match fails C7.
11. A direct deposit is listed and still passes C7.
