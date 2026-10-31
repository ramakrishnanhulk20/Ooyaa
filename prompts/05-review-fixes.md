STUDIO PROMPT 05: fixes from the backend gate review

GOAL: Our independent code review found no way to lose money. It did find four real gaps:
- runway and nextPayday can overstate, and periodStart can revert;
- the invariant suite proves less than it claims;
- payee transfers need a fixed gas budget, so a token refusal that burns gas cannot starve the other payees;
- nothing is proven yet against Arc's real USDC.
Fix all four exactly as the attached reference file 05-spec.md (uploaded under context/) says, prove them with the tests and fork tests it lists, and redeploy to Arc Testnet.

PRESET: max preset (full audit and tests).

BUILD
Implement every change in 05-spec.md and nothing else:
- in contracts/Payroll.sol: withdraw pays the employer only; cancelEmployerTransfer; no zero tip transfer; per-payee transfers with a fixed gas budget and a gas-left check; runway, nextPayday and periodStart fixed; the NatSpec corrections;
- the scaffold step at the end of the spec.
PaydayFactory.sol keeps its source unchanged.

RULES
Uphold C1 to C15 (with C2 and C13 as clarified) and C34 to C38, as listed in 05-spec.md. Your report must name, for each one, the file and function that enforces it.

TESTS
Write tests 1 to 18 of 05-spec.md, and run fork tests 19 to 23. Run every test with forge test and report:
- the count;
- the invariant handler's success counts per handler;
- the forbiddenSucceeded and unexpectedRevert counts;
- the measured gas from fork tests 20 and 21;
- whether fork test 23 was possible.

DO NOT
- Do not change anything the spec does not list. No new roles, fees, pause, owner or admin.
- No immutables in either contract, and no constructor arguments in PaydayFactory.
- Do not build or change the web app. Leave src/ as it is.
- Do not create any Circle API key, entity secret, wallet or other credential.

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
List as Arc Testnet transactions only the ones actually broadcast to Arc Testnet. Label every fork result "fork", in a separate list. Do not mix the two.

REPORT BACK
- The test count, with the names of new and changed tests.
- The handler counts, forbiddenSucceeded and unexpectedRevert.
- The fork results for 19 to 23, labelled fork, with the measured gas.
- The audit findings, with their severity.
- For C1 to C15 and C34 to C38, the file and function that enforces each.
- The new PaydayFactory and reference Payroll addresses on Arc Testnet, with their deploy transaction hashes.
- What you did with the scaffold files, and why.
