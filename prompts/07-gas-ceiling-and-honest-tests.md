STUDIO PROMPT 07: gas ceiling, return-data rule, and tests that prove what they claim

GOAL: An independent review of turn 06 found no contract bugs. It found one gas ceiling to lower, one return-data case to handle, and a set of tests that claim more than they prove. This is the last fix round. Fix every instance of each class in the attached reference file 07-spec.md (uploaded under context/) in one pass, prove it, and redeploy to Arc Testnet.

PRESET: max preset (full audit and tests).

Implement every numbered item in 07-spec.md (items 1 to 18) and nothing else. Each class names a kind of bug: fix every instance of it, including any the spec does not list by line.

DO NOT
- Do not change anything 07-spec.md does not list.
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
- The result at each seed, and the sc_* counts.
- Which invariant failed under the point 10 mutation.
- The measured worst-case gas from point 15.
- Whether the fork tests ran in your sandbox, and their results if they did.
- The exact lines changed in Payroll.sol.
- The audit findings, with their severity.
- The new PaydayFactory and reference Payroll addresses on Arc Testnet, with their deploy transaction hashes.
