FINAL FIX ROUND (turn 21). Measured by the reviewer on 31 Oct, 05:45 to 06:05 UTC, with the private node set.

1. The footer is not on any page.
- Footer.tsx exists, but no page renders it (headless check of /, /p/<demo>, /proof and /docs: no "Arc Studio project" text anywhere).
- Render it once, in the shared layout, so every route has it.

2. C8 skips while a backlog is being paid.
- Evidence: "C8 a second run is refused: SKIP, no block in last 5 runs where nextUnpaid >= startedPeriods". The detail line also says "Checked the 12 most recent of 53 runs", so the two numbers disagree. An outside wallet was paying 17 owed paydays back to back, so none of the last 5 runs left the payroll caught up.
- Fix (src/proof/prove.ts, shared with the CLI):
  - Find the most recent run after which the payroll was caught up. Use history alone, with no RPC per candidate: run period p at block B is caught up when p + 1 == floor((blockTime(B) - startTime) / periodLength) + 1.
  - Simulate run() at that block (one archive call). NothingDue gives PASS.
  - If no run was ever caught up, and nothing is due now, simulate at the latest block instead.
  - Otherwise SKIP: "Every run so far was followed by another owed payday, so there was no moment to test a second run."
  - The detail line names the block and the period it tested: "Tested right after period 0038 was paid, at block 28,543,924: run() reverted NothingDue."
  - Remove the "last 5 runs" limit and the mismatched counts.
- Tests: the caught-up finder on a fixture history (a backlog run is not caught up; the last of a burst is caught up).

3. The creation-block lookup makes /p slow.
- Evidence: one load of /p/<demo> made 209 requests in 17 s. For the first 12 s it ran at about 5 per second, walking factory logs one window at a time; then it ran at 40 per second.
- Fix creationBlockOf (src/proof/creation.ts):
  - When the payroll is ARC_MAINNET.demoPayroll, return ARC_MAINNET.demoPayrollBlock at once.
  - Otherwise scan forward from ARC_MAINNET.factoryBlock, 8 windows in flight, and stop at the first PayrollCreated whose payroll topic matches.
- Acceptance: /p/<demo> history visible within 7 s.

4. "Out of funds" shows too early.
- PayrollCard disables Run payday when balance < owed. But run() only needs balance >= totalDeferred + periodTotal + tipPerRun to pay the oldest owed period (Payroll.sol, run()).
- Use exactly the contract's condition.
- When the payroll can pay one or more paydays but not all, the card shows Run payday enabled and the line "Funded for <n> of the <m> owed paydays."
- Only below one period's cost does it show the underfunded state: "This payroll needs <x> more USDC to pay the next payday."
- Tests for all three cases.

5. Disclosure on /new.
- Add one line to the summary box, Plex Sans 0.875rem --ink-2: "Payee addresses and amounts are public on Arc. Anyone can see who you pay and how much."

6. The proof's C2 passes when both runtimes are empty.
- In prove.ts, C2 fails when either runtime is "0x" or empty: "No contract code at <address> on <network>."
- Add unit tests for runtimeEquals and for that case.

7. Phone layout and the closed drawer.
- At 375px, inline code holding a full address in /docs is 407px wide. Give inline code in the docs reader overflow-wrap anywhere.
- The closed SlipDrawer stays mounted off-screen, 440px wide, to the right of the viewport. Unmount it when closed, after its exit animation.
- Acceptance: no element's right edge beyond the viewport on /, /p/<demo>, /proof and /docs at 375px.

8. Contract tests: add only; never touch contracts/*.sol.
- Changing a .sol file changes the metadata and breaks the exact bytecode match with mainnet. Add tests in contracts/test/ only:
  - close() twice reverts AlreadyClosed;
  - payrollAt and allPayrolls out of range revert OffsetOutOfRange;
  - fund, withdraw and claim emit Funded, Withdrawn and Claimed with the right arguments.
- Then run `bun run facts` again.

9. Uploaded docs, keep the words:
- docs/security/threat-model.md (new, the public threat model);
- content/docs/threat-model.md (one sentence changed).
