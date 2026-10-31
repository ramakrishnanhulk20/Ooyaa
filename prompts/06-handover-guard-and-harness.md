STUDIO PROMPT 06: handover guard and invariant harness fixes

GOAL: Running your turn 05 invariant suite on our machine, with different random seeds, found one small contract gap and three bookkeeping bugs in the test harness. The contracts are otherwise correct. Fix exactly these, prove them across several seeds, and redeploy to Arc Testnet.

PRESET: max preset (full audit and tests).

CONTRACT CHANGE (contracts/Payroll.sol only)
1. transferEmployer(newEmployer) must also revert InvalidNewEmployer when newEmployer is address(this) or the USDC address.
   - Why: if the payroll becomes its own employer, or the token becomes the employer, nobody can ever again withdraw the free balance, close the payroll or change payees. That breaks rule C10.
   - Our run reached it through startTransfer(payroll), then acceptTransfer, then withdraw.
   - Keep the existing ZeroNewEmployer and SameEmployer checks.
   - Update the NatSpec.
   - No other change to either contract.

HARNESS FIXES (contracts/test/PayrollInvariant.t.sol)
The class of bug: the ghost ledger and the handler preconditions do not model every path. Fix every instance in one pass. Concretely:
2. withdraw handler: when the current employer is blocklisted in the mock, the token correctly refuses to pay it (rule C34). That is not a guaranteed success, so return early instead of counting unexpectedRevert. Apply the same reasoning to every handler that pays an address the blocklist may hold:
   - claim already does this;
   - check run's tip to the handler as runner;
   - check withdraw.
3. invariant_PaidNeverExceedsSchedule: a claim moves money out of totalDeferred, so the ledger must count it. The formula becomes `handler.totalPaid() + handler.totalClaimed() + payroll.totalDeferred() == handler.sumScheduledPeriods()`.
4. startTransfer handler: skip targets equal to the payroll or the USDC address. After change 1 these revert anyway. Then add a forbidden-call handler, transferToSelfOrToken, that tries both and counts any success in forbiddenSucceeded.
5. invariant_MoneyOnlyLeavesByRules must never count a payroll-to-payroll transfer as an outflow. After change 1 this cannot happen; assert it anyway, by checking that the employer is never the payroll.

NEW AND STRENGTHENED UNIT TESTS (contracts/test/Payroll.t.sol)
6. test_TransferEmployerRejectsSelfAndToken: transferEmployer(address(payroll)) and transferEmployer(USDC) both revert InvalidNewEmployer.

Our break-it checks (we removed one guard at a time and re-ran your tests) found three guards that no test notices. Strengthen these tests so each one fails without its guard:
6a. The gas-left check (rule C35).
   - test_LowGasRunRevertsNeverDefers must run against a mock token whose every successful transfer costs about 60,000 gas, for example by writing several storage slots. Arc's real USDC costs about 50,000 per transfer.
   - With cheap transfers, a low gas limit never starves a payee, so today the test passes even with the gas-left check deleted.
   - With realistic transfers, removing the check would make a low gas limit defer payees instead of reverting the run, and the test must then fail.
6b. The per-payee gas cap (rule C35).
   - test_GasBurningPayeeIsDeferredOthersPaid must call run() with a realistic gas limit, for example 2,000,000, through a helper that calls payroll.run{gas: 2_000_000}().
   - Today the test has almost unlimited gas, so even an uncapped gas-burning transfer leaves plenty for the other payees.
   - With the realistic limit, removing the {gas: PAYEE_TRANSFER_GAS} cap must make the test fail.
6c. The first period's boundary (rule C38).
   - test_ExactBoundary must also cover period 0.
   - At block.timestamp == startTime: startedPeriods() == 1 and dueNow() is true.
   - At startTime - 1: startedPeriods() == 0 and dueNow() is false.
   - Today only the period 1 boundary is tested, so changing `block.timestamp < startTime` to `<=` goes unnoticed.

SEEDS
7. Run the invariant suite at four fuzz seeds, plus the default: forge test --match-contract PayrollInvariantTest --fuzz-seed 1, then 2, 3 and 4. Report each run's result. Every invariant must hold at every seed.

KEEP
- Keep the fork test file contracts/test/PayrollFork.t.sol as it is. We ran it ourselves with Arc Foundry against Arc Testnet's real USDC, and all 5 passed: the blocklisted payee was deferred and the other 9 paid; the 100-payee run took 4,512,108 gas; a 1-payee run took 92,333 gas.

DO NOT
- Do not change anything not listed here.
- Do not build or change the web app. Leave src/ as it is.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No immutables in either contract, and no constructor arguments in PaydayFactory.

DEPLOY (no credentials needed)
Redeploy to Arc Testnet:
1. PaydayFactory.
2. One standalone reference Payroll, with your deploy tool:
   - employer_: your managed deployer wallet
   - payees: [your managed deployer wallet, 0x1111111111111111111111111111111111111111]
   - amounts: [10000, 10000]
   - startTime_: now + 600
   - periodLength_: 120
   - tipPerRun_: 1000

TRANSACTION HONESTY
List as Arc Testnet transactions only the ones actually broadcast to Arc Testnet. Label anything run on a local fork as "fork".

REPORT BACK
- The test count.
- The result at each seed.
- The exact lines changed in Payroll.sol.
- The audit findings, with their severity.
- The new PaydayFactory and reference Payroll addresses on Arc Testnet, with their deploy transaction hashes.
