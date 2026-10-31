STUDIO PROMPT 09: tests whose oracle is independent of the code they check

GOAL: An independent review of turn 08 found no contract bugs. It found test checks that ask the code under test for the expected answer, or pin a literal instead of the contract, so two real regressions pass the suites unseen. This turn changes tests only. Fix exactly what the attached reference file 09-spec.md (uploaded under context/) lists, and prove it.

PRESET: max preset (full audit and tests).

Implement every numbered item in 09-spec.md (1 to 18) and nothing else. Follow its WRITE RULE for every file.

DO NOT
- Do not change contracts/Payroll.sol or contracts/PaydayFactory.sol in any way, not even comments. Their bytecode is deployed and verified.
- Do not deploy anything. No transactions this turn.
- Do not change anything 09-spec.md does not list.
- Do not build or change the web app. Leave src/ as it is.
- Do not create any Circle API key, entity secret, wallet or other credential.

TRANSACTION HONESTY
This turn makes no Arc Testnet transactions. Label anything run on a local fork as "fork".

REPORT BACK
- The test count.
- The result at each seed, and the sc_* log at each.
- Which invariant failed under M02 (item 18).
- The two scratch-copy results for item 9 (pass at 110,000, fail at 100,000).
- Whether the fork tests ran in your sandbox, and against which network.
- The audit findings, with their severity.
- Confirmation that Payroll.sol and PaydayFactory.sol are byte-identical to the start of the turn.
