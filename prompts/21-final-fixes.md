STUDIO PROMPT 21: the final fix round

GOAL: Every page has the footer. The proof stays VERIFIED while a backlog is being paid. Payroll pages load in seconds. The card never says "out of funds" while the contract would still pay. The create form says that salaries are public. The proof cannot pass on empty code. Nothing spills off a phone screen, and the contract tests cover the last untested reverts and events. The attached prompts/21-spec.md has the evidence, fixes and acceptance checks. The public threat model and one docs page are uploaded in place.

PRESET: max preset (full audit and tests).

FILES
- Edit:
  - src/App.tsx (footer in the layout);
  - src/proof/prove.ts, src/proof/creation.ts, src/proof/code.ts, and their tests;
  - src/payroll/cardState.ts, src/payroll/cardState.test.ts, src/components/PayrollCard.tsx;
  - src/components/create/ (the summary box line);
  - src/components/docs/ (the inline code style);
  - src/components/payroll/SlipDrawer.tsx;
  - src/generated/build-facts.json (by `bun run facts`);
  - README.md (counts only), AGENTS.md.
- Create: test files as needed, and new test functions in contracts/test/*.t.sol.
- Uploaded, keep as is: docs/security/threat-model.md, content/docs/threat-model.md.
- NEVER edit contracts/Payroll.sol or contracts/PaydayFactory.sol. Every other file stays unchanged. scripts/prove-it.ts must not change.

DO NOT
- Do not change any contract source. Do not deploy anything. Do not send any transaction.
- Do not create any credential. VITE_ARC_RPC_URL has no value in your sandbox, and the app must work with it unset.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src and `forge test --no-match-path contracts/test/PayrollFork.t.sol`: names and counts. tsc --noEmit. bun run build: the last line.
- `bun run prove`: the C8 lines.
- The new build-facts.json.
- Confirmation that contracts/Payroll.sol and contracts/PaydayFactory.sol are byte-identical to before, and that every other file outside the list is unchanged.
