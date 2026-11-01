STUDIO PROMPT 28: C3 must not fail when a visitor creates a payroll

WHY: The live proof page now shows "7 passed, 1 failed". C3 asks Sourcify for an exact_match on every payroll the factory has made. A visitor created a second payroll, 0x153EEF6d062037d55a192FE4474f8A07a90EbAEa, through /new. Nobody submitted it to Sourcify, so Sourcify answers 404 and C3 fails. Every judge who tries "create your own payroll" would turn the sheet red.
- But C2 already proves that every payroll's runtime is byte-identical to the testnet reference payroll, which Sourcify verifies as exact_match. Payroll.sol has no immutables.
- So identical runtime means identical verified source.

CHANGE (src/proof/prove.ts, shared by the page and the CLI)
1. C3 requires a Sourcify exact_match for exactly these four:
   - the mainnet factory;
   - the demo payroll (ARC_MAINNET.demoPayroll);
   - the testnet factory;
   - the testnet reference payroll.
   The rules for each stay as today: unreachable gives SKIP, anything not exact_match gives FAIL.
2. For every other factory payroll, do not ask Sourcify. Use the runtime comparison C2 already made against the testnet reference runtime; reuse it, do not fetch again.
   - Equal gives PASS, with the line: "mainnet payroll <short>: made by the factory after launch; its code is byte-identical to the Sourcify-verified reference payroll (see C2)."
   - Not equal gives FAIL: "mainnet payroll <short>: code differs from the verified reference payroll."
3. Keep "FAIL beats SKIP beats PASS" across all of C3's lines.
4. Tests, with a fake Sourcify fetch and fake runtimes:
   - an extra payroll that Sourcify answers 404 for, with an equal runtime, gives PASS;
   - the same with a different runtime gives FAIL;
   - the demo payroll answering 404 still gives FAIL.
5. Checks:
   - the dash grep over the repository is clean;
   - bun test src passes;
   - tsc --noEmit is clean;
   - bun run build succeeds;
   - the two contract files are byte-identical;
   - `bun run prove` against mainnet shows C3 PASS, and prints the new line for 0x153E...EbAEa.
6. Commit as ramakrishnanhulk20 with exactly this message and no trailers: C3 accepts payrolls made after launch by code identity
   DO NOT PUSH.

DO NOT: change any other file except AGENTS.md turn notes and the new test file, deploy anything, send any transaction, create any credential, print any token, or push.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, the `bun run prove` C3 lines, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
