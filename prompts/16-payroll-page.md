STUDIO PROMPT 16: a page for every payroll, and payslips you can open

GOAL: Any payroll made by Ooyaa's factory gets its own page at /p/<address>: its live card with Run payday, every payslip it ever issued, and a payslip you can open like a real piece of paper, stamped PAID, with its transaction. A connected payee sees just their own payslips and downloads them as a CSV, with no signature needed. The demo payroll on the home page links to its page. Two small Run payday fixes carried from turn 14 come along. The attached prompts/16-spec.md is the full spec, and prompts/13-design.md still governs every visual.

PRESET: max preset (full audit and tests).

FILES
- Create:
  - src/components/PayrollCard.tsx;
  - src/pages/PayrollPage.tsx;
  - src/components/payroll/ (as many components as the page needs, including the drawer);
  - src/proof/creation.ts, src/proof/creation.test.ts;
  - test files for the payee filter and the CSV builders.
- Edit:
  - src/components/DemoPayrollCard.tsx (it becomes the wrapper);
  - src/proof/prove.ts (only to call creationBlockOf);
  - src/App.tsx (the route);
  - src/components/proof/LedgerTable.tsx (only if a row click hook is needed);
  - src/payroll/useRunPayday.ts, src/payroll/runMachine.ts, src/payroll/runMachine.test.ts (part D);
  - README.md and AGENTS.md.
- Every other file stays unchanged; scripts/prove-it.ts must not change, and the hero must look and behave as today.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- In your preview against Arc mainnet:
  - /p/0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A: the header line and the row count;
  - /p/0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b: the factory, which must show the not-a-payroll message;
  - /p/nonsense.
- `bun run prove`, to show the CLI is unchanged.
- Confirmation that every file outside the list is unchanged.
