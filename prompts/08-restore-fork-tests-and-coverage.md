STUDIO PROMPT 08: restore the fork tests, close the fuzz coverage gaps, remove dashes

GOAL: Turn 07's contract changes are right and match testnet byte for byte. Your file write for the fork tests was cut off, so that file was saved as one truncated line, and our re-run found two smaller test gaps. Fix exactly what the attached reference file 08-spec.md (uploaded under context/) lists, prove it, and redeploy to Arc Testnet.

PRESET: max preset (full audit and tests).

Implement every item in 08-spec.md (A1 to A6, B1 to B3, C1 to C6, D1 and D2) and nothing else. Follow its WRITE RULE for every file.

DO NOT
- Do not change contracts/Payroll.sol except the comment-only dash fixes in D2. Do not change contracts/PaydayFactory.sol.
- Do not change anything 08-spec.md does not list.
- Do not build or change the web app. Leave src/ as it is.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No immutables in either contract, and no constructor arguments in PaydayFactory.

DEPLOY (no credentials needed)
Redeploy to Arc Testnet:
1. PaydayFactory.
2. One standalone reference Payroll, with your deploy tool. First read the latest block's timestamp from Arc Testnet. In turn 07 you guessed the clock, the constructor reverted, and the reference was deployed with other settings. Use exactly:
   - employer_: your managed deployer wallet
   - payees: [your managed deployer wallet, 0x1111111111111111111111111111111111111111]
   - amounts: [10000, 10000]
   - startTime_: that block timestamp plus 600
   - periodLength_: 120
   - tipPerRun_: 1000

TRANSACTION HONESTY
List as Arc Testnet transactions only the ones actually broadcast to Arc Testnet. Label anything run on a local fork as "fork".

REPORT BACK
- The test count, and the output of the A6 list command.
- Your forge version and the two B3 gas values.
- The result at each seed, and the sc_* log at each.
- The exact lines changed in Payroll.sol.
- The audit findings, with their severity.
- The new PaydayFactory and reference Payroll addresses on Arc Testnet, with their deploy transaction hashes.
