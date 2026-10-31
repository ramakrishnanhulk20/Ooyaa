PROVE-IT FIX SPEC (turn 12b)

F1. Interface written from memory (class: any ABI entry, field or argument name not copied from contracts/out).
- Evidence: src/proof/abi.ts holds three entries the deployed Payroll does not have (unblockPayee, PayeeBlocked, PayeeUnblocked).
  - getState returns 17 fields instead of 16: it adds dueNow and nextPayday and drops closedAt.
  - PayeeAdded lacks fromPeriod, so its topic hash is wrong.
  - EmployerTransferred args are named previousEmployer and newEmployer; the real names are previous and current.
  - Nine entries differ from the artifact in total. Running prove fails with "Position 543 is out of bounds" decoding getState, then "Invalid argument type in ToBigInt" on state.nextPayday.
- Fix: scripts/gen-abi.ts reads contracts/out/Payroll.sol/Payroll.json and contracts/out/PaydayFactory.sol/PaydayFactory.json. It writes src/proof/abi.ts with `export const payrollAbi = <abi JSON> as const;` and `export const factoryAbi = <abi JSON> as const;`, plus the erc20Abi re-export. Add `"gen:abi": "bun run ./scripts/gen-abi.ts"` to package.json.
- Read nextPayday() and dueNow() as their own calls at toBlock.
- Fix every use of EmployerTransferred, PayeeAdded and periodStart to the real names.
- Test (src/proof/abi.test.ts): both exported ABIs deep-equal the artifact ABIs. If an artifact is missing, the test fails with "run bun run contracts:build first".

F2. Untyped event access hides wrong names (class: every `as` cast on events, event args, contract results or getLogs parameters, and every Record<string, unknown> accessor).
- Evidence: checks.ts AnyEvent with a(ev, key) and s(ev, key); prove-it.ts casts to `{ args: { previousEmployer } }`; prove.ts:239 casts the getLogs event, which is a tsc error.
- Fix: delete AnyEvent, a() and s(). Use viem's typed parseEventLogs results narrowed by eventName, so tsc catches any wrong name. No `as` on event or contract data anywhere in src/proof or scripts/prove-it.ts.
- Every raw payroll log must decode: if parseEventLogs returns fewer events than raw logs, C7 FAILs with "N logs the ABI cannot decode" and their tx hashes.

F3. Transfers matched more than once (class: any matching that is not one-to-one within a tx).
- Evidence:
  - C6 keeps a new consumed set per PaydayRun, so two runs in one tx can both consume the same transfers.
  - Funded matching uses .some(), so two Funded events of one amount pass with one inflow, and directDeposits miscounts.
  - Claimed and Withdrawn events with no transfer are never flagged.
- Fix: one pure function in checks.ts, matchTransfers(history). For each tx it builds one consumed set and consumes, in log order, the transfer of every PayslipIssued, every tip (tip > 0), every Claimed(payee, amount) and every Withdrawn(to, amount) from usdcOut, and every Funded(from, amount) from usdcIn. It returns unmatched events, unexplained outflows and direct deposits (unconsumed inflows). C6 and C7 both read its result.
  - Any event without its transfer is a FAIL in C6 (payslip, tip) or C7 (Claimed, Withdrawn, Funded).
  - Any unconsumed outflow is a FAIL in C7.

F4. "In order" means in time.
- Evidence: C5 sorts runs by period, so period 1 paid before period 0 would pass.
- Fix: sort PaydayRun by (blockNumber, logIndex); the run at position i must have period i.

F5. Raw topics ignored by viem.
- Evidence: viem's getLogs drops a raw `topics` field. Both USDC queries therefore download every USDC log on Arc: we measured 9,104 logs (5.7 MB) in one 10,000-block chunk, where the filtered query returns 4 logs (2.6 KB). After a week of demo this is hundreds of MB.
- Fix: query USDC through viem's typed filter: `event` set to the Transfer event from erc20Abi, with `args: { from: payroll }` for outflows and `args: { to: payroll }` for inflows. viem then encodes the topics, and the node returns only matching logs.
  - getLogsChunked takes those typed parameters.
  - Remove the TRANSFER_EVENT_TOPIC workaround and parseTransferLog.
  - Test: the parameters getLogsChunked sends include the from or to topic.

F6. Status precedence and Sourcify answers (class: a SKIP or unreachable hiding a FAIL, or an outage reported as not verified).
- Evidence:
  - C3 reports SKIP when one target is unreachable and another is not verified.
  - code.ts returns not_verified after repeated 5xx, on 429 and on bad JSON.
- Fix: combineStatus(list) in checks.ts, where FAIL beats SKIP beats PASS. Use it for every multi-part check.
  - sourcifyStatus returns not_verified only for HTTP 404, or HTTP 200 with match null.
  - 5xx after 3 retries, 429, any other 4xx, unparseable JSON and network errors are { unreachable: reason }.

F7. Spec items not built.
- C8 at toBlock: if dueNow() is false, run() simulated at toBlock must revert NothingDue, or C8 FAILs.
- Detect reverts by the decoded error name (BaseError.walk to ContractFunctionRevertedError, data.errorName), never by message text.
- Outside runners also exclude every PayeeAdded payee and every address in getPayees() at toBlock, and past employers come from EmployerTransferred(previous, current).
- Ledger totals include direct deposits.
- C7 prints amounts in USDC and the equation: balance at toBlock - balance before creation = in - out.
- C1 and C2 FAIL lines print the expected and the found keccak.

F8. Ledger logic in the CLI (class: any figure computed in scripts/prove-it.ts).
- Fix: summarizeLedger in src/proof returns a typed Ledger: payday rows, totals, direct deposits, distinct runners, outside runners, payees paid, funders, all wallets, and the state at toBlock. ProofReport carries it. The CLI only formats, so the M6 proof page can reuse src/proof unchanged.

F9. CLI edges.
- An invalid --payroll exits 2 with "not an address: <value>" (isAddress).
- Replace `void main()` with `main().catch(...)`, printing "fatal: <reason>" and exiting 1.
- Print the progress line once per query: full range and chunk count.
- Remove dead code (addrKeccak, `void addrKeccak`, unused imports).

TESTS TO ADD (keep the existing 13)
- checks.test.ts:
  - two PaydayRun in one tx with only one set of transfers fails C6;
  - a Claimed with no transfer fails C7, and so does a Withdrawn with no transfer;
  - two Funded of one amount with one inflow fails C7;
  - period 1 logged before period 0 fails C5;
  - an undecodable payroll log fails C7;
  - combineStatus: FAIL with SKIP is FAIL, and SKIP with PASS is SKIP;
  - outside runners exclude a PayeeAdded payee who was never paid, and a past employer.
- code.test.ts, with a fake fetch:
  - 200 with exact_match gives exact_match; 200 with null and 404 give not_verified;
  - 503 four times, 429, and bad JSON all give unreachable.
