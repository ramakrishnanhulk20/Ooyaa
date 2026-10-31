STUDIO PROMPT 03: no credentials, funding after close, testnet reference

ANSWER TO YOUR QUESTION: Deny. Do not create a Circle API key, an entity secret, a developer wallet or any other credential, in this turn or any later one. We do not call our contracts through Circle's Smart Contract Platform.

GOAL: Fix one rule in the spec that your functional auditor rightly flagged, re-run every test, and put a factory and one reference payroll on Arc Testnet without any credentials.

PRESET: max preset (full audit and tests).

CHANGE 1: fund() after close
- This supersedes the spec line "payee changes and fund revert Closed". fund() stays allowed after close, so anyone can top up a closed payroll and pay the periods it already owes.
- Payee changes still revert Closed. Everything else about close stays as specified: periods below closedAt still run, nothing later is ever owed, and withdraw releases only freeBalance.
- Update the NatSpec of fund and close to match.
- Update test_CloseStopsFuturePeriods: fund now succeeds after close.
- Add test_FundAfterCloseCoversOwed:
  - leave three started periods unpaid while the balance covers only one, then close;
  - fund the shortfall;
  - all three periods run;
  - withdraw then releases exactly the free balance and no more.

CHANGE 2: keep your payrollAt bounds fix from the last turn.

Re-run every test with forge test and report the count.

DO NOT
- Do not change anything else in either contract. No new functions, events or rules.
- Do not build or change the web app. Leave src/ as it is.
- No immutables in either contract, and no constructor arguments in PaydayFactory.

DEPLOY (no credentials needed)
1. Redeploy PaydayFactory to Arc Testnet. Payroll's code changed, so the factory's code changes with it.
2. Do not call createPayroll. Instead, use your deploy tool to deploy one standalone Payroll to Arc Testnet as a bytecode reference. Payroll has no immutables, so its runtime code is identical to every payroll the factory creates. Use these constructor arguments:
   - employer_: your managed deployer wallet's address
   - payees: [your managed deployer wallet's address, 0x1111111111111111111111111111111111111111]
   - amounts: [10000, 10000]
   - startTime_: now + 600 seconds
   - periodLength_: 120
   - tipPerRun_: 1000

TRANSACTION HONESTY
List as Arc Testnet transactions only the ones actually broadcast to Arc Testnet. Label anything run on a local fork as "fork", in a separate list.

REPORT BACK
- The test count and any new or changed test names.
- A short summary of the exact lines changed in Payroll.sol.
- The audit findings on this change, with their severity.
- The new PaydayFactory and reference Payroll addresses on Arc Testnet, with their deploy transaction hashes.
- For each of C1 to C15, the file and function that enforces it (repeat the table from last turn, updated).
