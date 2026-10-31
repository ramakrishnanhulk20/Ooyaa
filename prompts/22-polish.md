STUDIO PROMPT 22: release polish before the public push

GOAL: The repository reads as clean, human-written work from the first file a stranger opens. There are no long dashes anywhere, no placeholder files, no agent-speak comments, typecheck passes outside Studio, and the docs carry the real test counts and the right fork-test command. Behaviour does not change, except the C8 sentence.

PRESET: max preset (full audit and tests).

CHANGES
1. Long dashes. Rewrite every em dash (U+2014) and en dash (U+2013) in:
   - scripts/compass-deploy.ts, scripts/compass-deploy-helpers.ts, scripts/self-deploy.ts, scripts/fetch-abi.ts, scripts/check.sh;
   - src/tracing.ts, src/onchain-money.ts, src/onchain-facts.ts, src/console-capture.ts, src/onchain-wait.ts.
   Rewrite each sentence with a full stop, a colon or a pair of commas. Never just swap the character for a hyphen. Change no code, only comments and string literals that are not read by code. If a string is shown in a UI or log, rewrite the sentence the same way.
2. Typecheck outside Studio: `tsc --noEmit` fails only because scripts/compass-deploy.ts imports a package that exists only in Studio's sandbox. Add scripts/compass-deploy.ts and scripts/compass-deploy-helpers.ts to "exclude" in tsconfig.json, but only if the helpers file also depends on that package; otherwise exclude only compass-deploy.ts. Do not delete them.
3. Delete:
   - .agents/skills/example/ (a placeholder skill that says "Not a real skill");
   - scripts/call-create-payroll.ts (a one-shot script imported by nothing and listed in no package script).
4. Comments that read like agent notes:
   - contracts/test-integration/PaydayFactory.integration.test.ts lines 5, 34 and 40 ("sandbox session", "(from task)", "as given in task");
   - contracts/test-integration/Payroll.integration.test.ts lines 4 and 14 ("per task", "task explicitly provides").
   Rewrite each as a plain why-comment, or delete it.
5. contracts/test/Payroll.t.sol line 1419: "// Create a payroll with tipPerRun = 0" narrates what the code does. Delete it, or say why tip 0 matters for that test. Change no test logic. NEVER edit contracts/Payroll.sol or contracts/PaydayFactory.sol.
6. AGENTS.md:
   - line 504 uses an internal team name: rewrite it as "the reviewer";
   - line 549 uses the word "unlock": rewrite the sentence.
7. src/pages/LabPage.tsx line 31: "kitchen-sink" becomes "design reference".
8. C8 sentence (src/proof/prove.ts), today "Tested right after 0069 was paid, at block 28,769,958: run() from dead address run() reverted NothingDue: correct". Make it read: "Tested right after Period 0069 was paid, at block 28,769,958: run() reverted NothingDue." Use the shared period label function.

UPLOADED IN PLACE (keep the words): README.md, content/docs/limits.md, content/docs/judges.md, docs/security/threat-model.md. They now say: 89 Foundry tests (77 on Foundry 1.8.6), 6 fork tests that need Arc's Foundry build (arc-forge), and 228 app tests.

FILES: only those named above, plus AGENTS.md turn notes. Every other file stays unchanged.

DO NOT
- Do not change any contract source. Do not deploy anything. Do not send any transaction.
- Do not create any credential. VITE_ARC_RPC_URL has no value in your sandbox.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: after this turn, `grep -rn $'\xe2\x80\x94\|\xe2\x80\x93'` over the whole repository (excluding node_modules, lib, cache and out) prints nothing.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- The dash grep output (it must be empty).
- tsc --noEmit (it must be clean).
- bun test src, and forge test --no-match-path contracts/test/PayrollFork.t.sol: the counts.
- bun run build: the last line.
- `bun run prove`: the C8 lines.
- Confirmation that contracts/Payroll.sol and contracts/PaydayFactory.sol are byte-identical, and that every other file outside the list is unchanged.
