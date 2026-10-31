# Ooyaa spec for Studio turn 09: tests whose oracle is independent of the code they check

Tests only. contracts/Payroll.sol and contracts/PaydayFactory.sol do not change, so nothing is redeployed. Everything in the earlier specs still holds.

An independent review of turn 08, confirmed by our own break-it runs, found two gaps of one class: a check that cannot see the bug because it asks the code under test for the expected answer, or pins a literal instead of the contract.
- Mutation M02: owed() drops tipPerRun, so the employer can withdraw the tips of unpaid periods. Six unit tests catch it. `forge test --match-contract PayrollInvariantTest` passes. Every C2 check in the invariant suite reads payroll.owed() itself, and the run handler returns silently when the payroll looks underfunded.
- Mutation M38: PAYEE_TRANSFER_GAS lowered to 100,000. That is below 2 x 53,229 = 106,458, our measured cost of a real Arc USDC transfer to a fresh address (eth_estimateGas, 74,597 total on mainnet and testnet, minus 21,000 and 368 for calldata). Every unit and fork test still passes. test_fork_TransferCostHasTwoXMargin compares against the literal 110_000, not the contract's budget.

WRITE RULE: as in turn 08. Write large files in several smaller edits. After each write, no line may contain "(argument truncated)" and the line count must be what you expect.

CLASS 1: INVARIANT ORACLES (contracts/test/PayrollInvariant.t.sol)
Fix every instance of the class, including any not listed here.
1. New invariant_OwedMatchesModel. Compute owed from other state:
   (the item 2 started-period model - nextUnpaid(), or 0 if negative) x (periodTotal() + tipPerRun()), plus the sum of claimable over knownPayees.
   Assert payroll.owed() equals it. With M02 applied, this must fail.
2. New invariant_StartedPeriodsMatchesClock. Compute started periods from the clock:
   - 0 when block.timestamp < startTime;
   - otherwise (block.timestamp - startTime) / periodLength + 1;
   - after close, capped at the count the handler itself computed with this same formula at the moment its close() call succeeded. Store that in a ghost; do not read closedAt from the contract.
   Assert startedPeriods() equals it, and use this model (not startedPeriods()) inside item 1.
3. Run handler, at the early return when the balance is below totalDeferred + periodTotal + tipPerRun: if the balance is at least the item 1 model value, count runBlockedWhileFunded++. Add invariant_FundedDuePeriodAlwaysRuns, asserting it is 0. A due period on a payroll funded for everything it owes must never be refused.
4. Every other C2 check that compares against payroll.owed() (_shortfall, the freeBalance definition assert) uses the item 1 model value instead.
5. totalDeferred_ghost is updated but never asserted. Assert totalDeferred_ghost - totalClaimed == payroll.totalDeferred(), or delete it if that identity does not hold, and say why.
6. C12, events against money. In the run handler, for every PayslipIssued(payee, period, amount) in the recorded logs, require a token Transfer(payroll, payee, amount) log from the USDC address in the same call. For every PayoutDeferred, require no Transfer to that payee. When the tip is non-zero, require exactly one Transfer(payroll, runner, tipPerRun). Count any mismatch in eventMismatch and assert it is 0 in a new invariant.
7. updatePayee and removePayee handlers take a fuzzed address, so they almost never succeed (sc_updatePayee was 0 in every logged sequence on our runs). Choose the payee from knownPayees (index = a fuzzed uint modulo knownPayees.length), as claim already does. Keep payeeChangeWhileLocked and payeeChangeAfterClose as they are.
8. Comments: afterInvariant's comment must say Foundry calls it after every run (one sequence each). Remove the stale mention of seedGhost().

CLASS 2: TESTS PINNED TO A LITERAL (contracts/test/Payroll.t.sol, contracts/test-helpers/)
9. New test_BudgetCoversTwiceRealTransfer (rule C35). It pins the contract's real budget.
   - Add a mock token (a new helper, or a mode on an existing one) whose transfer to a chosen payee first burns gas until it has spent 106,500 gas since entry, then performs a normal transfer and returns true.
   - Etch it at the USDC address. Run a one-payee payroll with a normal gas limit.
   - Assert 1 PayslipIssued, 0 PayoutDeferred, and the payee balance rose by its amount.
   - With PAYEE_TRANSFER_GAS at 110,000 it passes. At 100,000 that transfer runs out of gas inside its budget and is deferred, so the test fails. Show both on a scratch copy, then discard the copy.
10. test_fork_TransferCostHasTwoXMargin: keep it. Rewrite its comment: the C35 rule is measured with eth_estimateGas on both networks before each deploy; this in-test figure (warm sender, through SafeERC20) is supporting evidence; the contract's real budget is pinned by test_BudgetCoversTwiceRealTransfer.
11. Around Payroll.t.sol lines 898 and 1618, the low-gas tests never assert that run succeeds at the highest gas level, so a run() that always reverts passes both. Assert ok at the top gas level in each.
12. New test_CloseBeforeStartOwesNothing (rule C11): close() before startTime. Then owed() is 0, startedPeriods() stays 0 after warping past startTime, run() reverts NothingDue, and withdraw(freeBalance()) returns the whole balance to the employer.

CLASS 3: FORK TESTS THAT ASSUME TESTNET STATE (contracts/test/PayrollFork.t.sol)
13. Fund through vm.deal instead of the testnet-only FUNDED_WHALE. On Arc the native balance is the USDC balance (18 decimals natively, 6 through the ERC-20 view): vm.deal(to, to.balance + amount * 1e12). The selfdestruct test already relies on this. Remove FUNDED_WHALE. The fork tests must then run against Arc Mainnet state as well as Arc Testnet.
14. test_fork_SinglePayeeTransferGas and test_fork_HundredPayeeRunGas: assert each payee's balance rose by its amount (after minus before), not an absolute balance. On testnet one of the addresses 0xF000 + i already holds 1 USDC, so the 100-payee test fails today with "payee not paid: 1000100 != 100".
15. test_fork_SelfdestructCredit comments: 5e12 / 1e12 = 5 (not 1e6), and the credit is 5 units in the 6-decimal view (not 5e6).

CLASS 4: DASHES
16. Remove every em-dash (U+2014) and en-dash (U+2013) from contracts/test-integration/*.ts. Rewrite the sentence; never swap in a hyphen. grep for both characters under contracts/ must return nothing.

SEEDS AND PROOF
17. Run the full suite, then the invariant suite at the default seed and at --fuzz-seed 1, 2, 3 and 4. Report each result and the last-sequence sc_* log.
18. On a scratch copy apply M02 (in owed(), return unpaid * periodTotal + totalDeferred). `forge test --match-contract PayrollInvariantTest` must FAIL. Name the failing invariant, then discard the copy.

KEEP
Every existing test and assertion not named here.
