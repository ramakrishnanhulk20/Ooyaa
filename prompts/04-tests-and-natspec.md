STUDIO PROMPT 04: close three test gaps, restore NatSpec

GOAL: The contracts are correct, but our break-it checks found three changes that no test would catch. Add those tests, make the invariant handler try forbidden calls, restore NatSpec on every public and external function, and redeploy both contracts to Arc Testnet.

PRESET: max preset (full audit and tests).

NO EXECUTABLE CHANGES
Do not change any executable line in contracts/Payroll.sol or contracts/PaydayFactory.sol. Only comments may change in those two files. After building, confirm that each contract's runtime bytecode is unchanged except for the trailing metadata hash.

CHANGE 1: NatSpec on every public and external function in both contracts, including every view and the internal helpers _owed, _startedPeriodsRaw and _startedPeriodsCapped. For each, write what it does, every revert it can raise, and every event it emits. Write it plainly, the way a protocol engineer would, without restating the function name.

CHANGE 2: new tests. Put them in contracts/test/Payroll.t.sol unless noted otherwise.

1. test_AcceptEmployerClearsPending: after acceptEmployer, pendingEmployer() is address(0) and so is getState().pendingEmployer. A second acceptEmployer from the new employer reverts NotPendingEmployer.

2. test_RemovePayeeUpdatesPeriodTotal: start with three payees, A, B and C, and pay every started period. Then:
   - removePayee(B). periodTotal now equals amountOf(A) + amountOf(C).
   - Warp into the next period and check owed(): it must equal amountOf(A) + amountOf(C) + tipPerRun, with no share for B.
   - Run that period. PaydayRun's paid plus deferred equals the new periodTotal.
   - After the run, freeBalance() equals the balance minus owed(), with no amount stuck for B.

3. test_RunKeepsDeferredClaimsCovered:
   - Block payee B and run one period, so B has a deferred claim D and totalDeferred is D.
   - Unblock B. Warp into the next period. Set the payroll's USDC balance to exactly D + periodTotal + tipPerRun - 1 (one unit short).
   - run() must revert Underfunded.
   - B's claim() must succeed and pay exactly D.
   - Fund what is missing. run() now succeeds.
   This proves a run can never spend money held for a deferred payee.

4. In contracts/test/PayrollInvariant.t.sol, add invariant_PeriodTotalMatchesAmounts: periodTotal always equals the sum of amountOf over the current payee list.

5. Strengthen the invariant handler, which today records 0 reverts. Alongside the valid calls, it must also attempt forbidden ones:
   - withdraw above freeBalance, from the employer and from random addresses;
   - run when nothing is due;
   - claim with nothing to claim;
   - payee changes while a started period is unpaid;
   - payee changes after close;
   - acceptEmployer from someone who is not pending.
   Each forbidden call must revert, and the handler counts the reverts. Every invariant must still hold. Report the call and revert counts.

Re-run every test with forge test and report the count.

DO NOT
- Do not change any executable line in either contract.
- Do not build or change the web app. Leave src/ as it is.
- Do not create any Circle API key, entity secret, wallet or other credential.

DEPLOY (no credentials needed)
The comments change the metadata hash, so redeploy both to Arc Testnet:
1. PaydayFactory.
2. One standalone reference Payroll, with your deploy tool:
   - employer_: your managed deployer wallet
   - payees: [your managed deployer wallet, 0x1111111111111111111111111111111111111111]
   - amounts: [10000, 10000]
   - startTime_: now + 600
   - periodLength_: 120
   - tipPerRun_: 1000

TRANSACTION HONESTY
List as Arc Testnet transactions only the ones actually broadcast to Arc Testnet. Label anything run on a local fork as "fork", in a separate list.

REPORT BACK
- The test count, with the names of the new tests.
- The invariant handler's call and revert counts.
- Confirmation that the runtime bytecode changed only in the metadata hash, and how you checked it.
- The audit findings, with their severity.
- The new PaydayFactory and reference Payroll addresses on Arc Testnet, with their deploy transaction hashes.
