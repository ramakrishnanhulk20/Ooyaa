STUDIO PROMPT 02: factory and full payroll rules

GOAL: Replace the turn 01 Payroll with the full Ooyaa design: an ownerless PaydayFactory that creates one Payroll per employer, plus payee changes, deferred claims for a payee whose transfer fails, close, and a two-step employer handover. All of it tested against our threat-model rules and deployed to Arc Testnet.

PRESET: max preset (full audit and tests).

BUILD

Implement exactly the spec in the attached reference file 02-spec.md (uploaded under context/): every function, signature, event, error rule and view it lists, and nothing more.
- Files: contracts/PaydayFactory.sol and contracts/Payroll.sol.
- Delete the turn 01 test file and write the new tests below.
- SafeERC20.trySafeTransfer is in OpenZeppelin 5.6.1; use it for the per-payee transfer inside run().

RULES

Uphold C1 to C15 as written at the end of the spec. Your report must name, for each one, the file and function that enforces it.

TESTS TO WRITE (forge-std, in contracts/test/)

Put a mock ERC-20 at 0x3600000000000000000000000000000000000000 with vm.etch. Give it a switch that makes transfers to one chosen address revert, to stand in for Circle's blocklist. Each test file opens with a short comment saying what it does not cover.

Payroll.t.sol: unit and fuzz tests.
1. test_RunPaysEveryPayeeOnce, test_SecondRunSamePeriodReverts, test_RunBeforeStartReverts, test_RunsGoInOrder, test_TipGoesToCaller, test_UnderfundedRunReverts.
2. test_EmployerCannotWithdrawOwed: fund three periods, warp past three starts without running, withdraw(freeBalance()), then all three runs succeed.
3. test_WithdrawLeavesTipCovered: fund exactly one period plus tip, warp in, freeBalance() is 0, withdraw(1) reverts, run succeeds.
4. test_BlockedPayeeDoesNotBlockOthers (C5): block payee B, run. A and C are paid with PayslipIssued, B gets PayoutDeferred and claimable[B] equals B's amount. The employer cannot withdraw it. claim() by B reverts while blocked and succeeds after unblocking. Nobody else can claim it.
5. test_DeferredClaimStaysOwedAfterClose: a deferred claim, then close. freeBalance excludes the claim, and B can still claim.
6. test_ScheduleLockedWhileStartedPeriodUnpaid (C3): add, update and remove each revert ScheduleLocked while a started period is unpaid.
7. test_ScheduleChangeAppliesFromNextPeriod (C3):
   - create with amount A;
   - run periods 0 to 2 in period 2, then updatePayee to B;
   - warp into period 5, run 3 to 5, then removePayee;
   - warp into period 7 and run 6 and 7.
   Expected: periods 0 to 2 paid A, periods 3 to 5 paid B, and the removed payee nothing after.
8. test_RemoveLastPayeeReverts, test_AddPayeeRejectsBadInputs, test_UpdatePayeeRejectsBadInputs, test_HundredPayeeLimit.
9. test_ConstructorRejects..., one per constructor rule in the spec.
10. test_CloseStopsFuturePeriods (C10, C11):
    - fund, warp three periods without running, close;
    - warp ten more periods;
    - owed covers only the three, all three run, a fourth run reverts NothingDue;
    - fund and payee changes revert Closed;
    - withdraw releases exactly the rest.
11. test_CloseAfterLongBacklog (C6): warp 10,000 periods unpaid, then close succeeds, and owed and views do not revert.
12. test_EmployerHandover (C9, C15): after transferEmployer and acceptEmployer, the old employer reverts on withdraw, close and payee changes, the new employer succeeds, and only pendingEmployer can accept.
13. test_OnlyEmployerFunctions: every employer function reverts for a random caller.
14. test_DirectTransferOnlyRaisesFreeBalance (C8).
15. test_ViewsNeverRevert (C13): getState() and every view, before start, with a shortfall, with a deferred claim, and after close.
16. test_RunEventsMatchTransfers (C12): sum the PayslipIssued and PayoutDeferred amounts from the logs and compare them with PaydayRun's paid and deferred and with the balance changes.
17. test_GasHundredPayees (C6): a run with 100 payees, each paid for the first time. Log the gas and assert it is under 10,000,000.
18. testFuzz_NeverPaysAPeriodTwice (C4): random warps, runs, funds and schedule changes. Per (period, payee), the total paid plus deferred never exceeds the amount scheduled for that period.

PaydayFactory.t.sol:
19. test_CreateSetsCallerAsEmployer, test_IsPayrollOnlyForFactoryPayrolls (C14: a Payroll deployed directly with new is not isPayroll, nor is a random address), test_ListsAreCapped (allPayrolls and payrollsCreatedBy return at most 100), test_ListsAreHistoryNotAuthority (C15: after a handover, payrollsCreatedBy still lists the payroll under the creator, and employer() is the new employer).

PayrollInvariant.t.sol: a handler calls fund, run, withdraw, claim, add, update and remove payee, close and handover from random senders, and warps time.
20. invariant_MoneyOnlyLeavesByRules (C1): a ghost ledger shows that every USDC decrease is a payee payment, a claim, a tip or an employer withdrawal from free.
21. invariant_BalanceCoversOwedOrRunBlocked (C2): either balance >= owed, or the shortfall existed before any withdraw (no withdraw ever succeeded while it would leave balance below owed).
22. invariant_PaidNeverExceedsSchedule (C4): total paid plus deferred equals the sum, over every period paid, of that period's schedule.
23. invariant_DeferredMatchesClaims: totalDeferred equals the sum of claimable over all payees the handler has used.

Run every test in the sandbox with forge test and report the count, including the logged gas from test 17.

DO NOT
- Do not build or change the web app in this turn. Leave src/ as it is.
- Do not add anything the spec does not list: no fees, no admin, no pause, no owner, no extra roles, no new events or functions beyond the spec.
- Do not use immutables in either contract, or constructor arguments in PaydayFactory.

DEPLOY
1. Deploy PaydayFactory to Arc Testnet.
2. From your managed wallet, call createPayroll through the factory with:
   - payees: [your managed wallet's address, 0x1111111111111111111111111111111111111111]
   - amounts: [10000, 10000]
   - startTime: now + 120 seconds
   - periodLength: 120
   - tipPerRun: 1000
3. Report the factory address and the address of the payroll it created.

TRANSACTION HONESTY
In your report, list as Arc Testnet transactions only the ones actually broadcast to Arc Testnet. Label anything run against a local fork or in an integration harness as "fork", and do not mix the two lists.

REPORT BACK
- The test count, the name of each test, and the gas from test 17.
- The audit and review findings, with their severity.
- For each of C1 to C15, the file and function that enforces it.
- The factory and payroll addresses on Arc Testnet, and the hashes of the transactions you actually broadcast there.
- Anything in the spec you could not do exactly as written, and why.
