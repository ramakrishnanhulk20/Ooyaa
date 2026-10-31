STUDIO PROMPT 14b: Run payday tells the truth when something goes wrong

GOAL: When a visitor cancels in their wallet, runs out of gas money, hits a busy RPC, or loses a race with another runner, the card says exactly what happened, and never claims the contract refused or that gas was spent when neither is true. The attached prompts/14b-spec.md has the two classes of bug, with the evidence and the tests.

PRESET: max preset (full audit and tests).

FILES: edit only src/payroll/useRunPayday.ts, src/payroll/runErrors.ts, src/payroll/runErrors.test.ts, src/payroll/runMachine.ts, src/payroll/runMachine.test.ts, src/index.css (two comment lines only), README.md (test counts only) and AGENTS.md. Every other file stays unchanged.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count.
- tsc --noEmit output, leaving out the known scripts/compass-deploy.ts template error.
- bun run build: the last line.
- What classifyRunError returns for the wrapped cancel, the wrapped no-gas, and the NothingDue revert.
- Confirmation that every file outside the list is unchanged.
