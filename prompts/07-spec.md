# Ooyaa spec for Studio turn 07: gas ceiling, return-data rule, and tests that prove what they claim

This changes contracts/Payroll.sol, the tests and the test helpers. PaydayFactory.sol has no source changes, but its bytecode changes because it embeds Payroll. Everything in 02-spec.md and 05-spec.md, plus the turn 03 and turn 06 changes, still holds unless a line below replaces it.

CLASS 1: CONTRACT (contracts/Payroll.sol only)
1. PAYEE_TRANSFER_GAS becomes 110_000. Why, in two rules:
   - C6, worst case. If every payee's transfer burns its whole budget, a 100-payee run must still fit in one transaction under Arc's per-transaction gas limit. Arc follows the Osaka baseline, so EIP-7825's cap of 16,777,216 gas likely applies. At 150,000 the worst case is about 19.6M gas and would not fit. At 110,000 it is about 100 x (111,746 + 44,000) plus fixed costs, about 15.7M.
   - C35, margin. The budget stays at least twice the measured cost of a real Arc USDC transfer to a fresh address. That is about 53,000 of execution, so 110,000 keeps the 2x margin.
2. _tryPayUsdc treats malformed return data as a refusal, never as a revert, matching SafeERC20:
   - no return data: keep today's rule (accepted only when the token has code);
   - 1 to 31 bytes: return false;
   - 32 bytes or more: decode the first word as uint256 and return true only when it equals 1. Any other word returns false.
   Today abi.decode(data, (bool)) reverts on 1 to 31 bytes or on a word other than 0 or 1, so the "Never reverts" NatSpec is false. After this change it is true.
3. NatSpec corrections, comments only:
   - PAYEE_GAS_RESERVE (lines 25 to 28): it does not cover the tip. It is extra gas required before each payee attempt so that a payee whose transfer fails can still be recorded as deferred. About 3,000 is left after a deferral that burned the full budget. If the rest of the run (the tip, the final event) then runs short, the whole run reverts, which rule C35 allows.
   - PAYEE_TRANSFER_GAS: state the C6 worst case and the C35 margin from point 1 in one or two lines each.
   - run(): keep the description accurate for the new budget.
4. No other change to Payroll.sol. No change at all to PaydayFactory.sol.

CLASS 2: TESTS THAT CLAIM MORE THAN THEY PROVE (contracts/test/PayrollInvariant.t.sol)
The class of bug: a check that cannot fail. Fix every instance in this file, including any not listed here.
5. withdraw handler: the `if (shortAfter > shortBefore)` block is empty. Make it count a violation in a dedicated counter, employerGrewShortfall. Do the same in addPayee, updatePayee, removePayee and close, which today count shortfall growth in forbiddenSucceeded: move them to employerGrewShortfall too.
6. invariant_EmployerNeverGrowsShortfall asserts `bal + freeBalance >= bal`, which is always true. Replace its body with assertEq(handler.employerGrewShortfall(), 0, ...).
7. invariant_BalanceCoversOwed: delete `assertGe(payroll.freeBalance(), 0, ...)`, which is always true for a uint. In its place assert the real definition: freeBalance() equals balance minus owed() when balance is above owed(), and 0 otherwise.
8. Eight valid-path handlers swallow failures with an empty catch: fund, addPayee, updatePayee, removePayee, close, startTransfer, acceptTransfer, cancelTransfer. Each must count unexpectedRevert in its catch, like run, withdraw and claim do.
   - Where a valid call can legitimately revert, the handler's preconditions are incomplete. Add the missing precondition and return early. Never swallow.
   - One likely case: fund from an employer the mock has blocklisted (the fuzzer can add the employer as a payee and then block it). The token correctly refuses it under rule C34, so return early.
   - Check every handler's preconditions against the contract's revert list for that function.
9. Assert the per-handler success counters. Add afterInvariant() and assert each of these is above 0: sc_fund, sc_run, sc_withdraw, sc_claim, sc_addPayee, sc_updatePayee, sc_removePayee, sc_close, sc_startTransfer, sc_acceptTransfer, sc_cancelTransfer, sc_blockPayee. If one cannot reach 0 < count at the configured runs and depth, fix the handler or the setup so it does, and say what you changed. Also log every sc_* value once, so the run output shows them.
10. Proof the suite now bites. On a scratch copy, in Payroll.sol freeBalance(), replace `_owed()` with `_owed() - (_startedPeriodsCapped() > nextUnpaid ? (_startedPeriodsCapped() - nextUnpaid) * tipPerRun : 0)`. That lets the employer withdraw the tips of unpaid periods. `forge test --match-contract PayrollInvariantTest` must FAIL on that copy. Today it passes. Report the failing invariant, then discard the copy.

CLASS 2, CONTINUED (contracts/test/Payroll.t.sol and contracts/test-helpers/)
11. Delete or rewrite the asserts that are always true after a revert: "nextUnpaid unchanged on revert" (around lines 898 and 1618). A reverted call rolls back every state change, so it proves nothing.
12. Wrong comments, fix the words to match what the code does:
    - Around line 278: the "Fix:" comment on test_DeferredClaimStaysOwedAfterClose describes a change that is not in this test.
    - Around line 846: test_LowGasRunRevertsNeverDefers_Realistic does not fail when the gas-left check is removed. Under the 63/64 rule a starved run reverts anyway. Say what the test does prove: no gas limit makes run defer a payee.
    - Around line 871: the threshold arithmetic counts the 50,000 reserve twice.
13. RealisticERC20.sol: a first transfer to a fresh payee costs about 140,000 today, which would exceed the new 110,000 budget. Retune it so every transfer, including the first to a fresh address, costs between 45,000 and 65,000 gas, close to Arc USDC's real cost. Add a test that measures one first transfer and one repeat transfer and asserts both fall in that range. Fix its header comment.

CLASS 3: NUMBERS TIED TO THE OLD BUDGET
14. Find every test, mock and comment that encodes 150,000 or a number derived from it (202,380, 202,381, 252,381, and gas-limit arrays sized around them, around lines 870 to 880, 945 and 1593). Recompute each for 110,000 and update it. Every gas test from turn 06 must still fail when its guard is removed, as before.

CLASS 4: MISSING PROOF
15. New unit test, test_WorstCaseHundredBurningPayeesFitsTxCap (rule C6):
    - Extend GasBurningERC20 so a set of addresses burn gas, not just one (for example a mapping and setGasBurner(address, bool)).
    - Etch it at the USDC address. Create a payroll with 100 payees, every one a gas burner, funded for one period plus tip. The runner is not a burner, so the tip succeeds.
    - Call payroll.run{gas: 16_700_000}(). It must succeed, defer all 100 payees (100 PayoutDeferred events, totalDeferred equals the period total) and pay the tip.
    - Measure the gas the run used and assert it plus 21,000 is below 16,777,216. Report the measured number.
16. New unit tests for point 2, with a mock at the USDC address:
    - test_ShortReturnDataIsDeferred: transfer returns 1 to 31 bytes. The payee is deferred, the run does not revert, the others are paid.
    - test_NonBooleanWordIsDeferred: transfer returns the word 2. Same expectations.
    Both must fail against today's _tryPayUsdc.
17. contracts/test/PayrollFork.t.sol (Arc's real USDC):
    - test_fork_SelfdestructCredit never selfdestructs; it makes a plain ERC-20 transfer. Replace it with a real one. Fund the test with real USDC, then deploy a small contract with value 5e12 + 7 wei whose constructor selfdestructs to the payroll. On Arc, native USDC has 18 decimals and the ERC-20 view has 6, so this credit is 5 units plus 7 wei of dust. Assert balanceOf(payroll) and freeBalance() each rise by exactly 5 and owed() is unchanged. Then run(), withdraw(freeBalance()) and close() must all succeed.
    - test_fork_SinglePayeeTransferGas and test_fork_HundredPayeeRunGas never assert that anyone was paid, so an all-deferred run passes both. Assert the payee balances rose and the PayslipIssued count (1, and 100), with 0 PayoutDeferred.
    - New test_fork_TransferCostHasTwoXMargin (rule C35): measure one real USDC.transfer to a fresh address, with gasleft() before and after, and assert 2 x that cost is at most 110_000. Report the measured cost.
    - test_fork_BlocklistedPayeeDeferred returns early, and passes, when it cannot blocklist. Make it fail with a clear message instead.
    These need Arc's USDC precompile. If your sandbox cannot run them against Arc Testnet, say so plainly; we run them ourselves with Arc Foundry.

SEEDS
18. Run the full suite, then the invariant suite at the default seed and at --fuzz-seed 1, 2, 3 and 4. Report each result and the sc_* counts from one run.

KEEP
- Every existing test that is not named here. Do not weaken any assertion that is not named here.

