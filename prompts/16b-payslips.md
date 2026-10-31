STUDIO PROMPT 16b: payslips you can open (part 2 of 2)

GOAL: On /p/<address>, every payslip the payroll ever issued is listed and filterable. Any payslip opens like a real piece of paper, stamped PAID, with its transaction. A connected payee sees just their own payslips and downloads them as a CSV, with no signature needed. Two small Run payday fixes from turn 14 come along. The attached prompts/16-spec.md is the full design. Turn 16a already built sections A, B, C.1, C.2 and E. Build these now:
- C.3 (Your payslips);
- C.4 (Every payslip);
- C.5 (open a payslip, the drawer and the ?slip= link);
- C.6 (mobile, for these parts);
- D (the late-receipt fix and the double full stop).

PRESET: max preset (full audit and tests).

FILES
- Create: src/components/payroll/ (the section and drawer components), plus test files for the payee filter and the CSV builders.
- Edit:
  - src/pages/PayrollPage.tsx;
  - src/components/proof/LedgerTable.tsx (only a row click hook and the filter input);
  - src/payroll/useRunPayday.ts, src/payroll/runMachine.ts, src/payroll/runMachine.test.ts;
  - src/components/PayrollCard.tsx (only for the copy fix in D.2, if the line is composed there);
  - README.md and AGENTS.md.
- Every other file stays unchanged. scripts/prove-it.ts, src/proof (apart from reading its exports) and the hero must not change.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- In your preview, on /p/0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A:
  - the row count;
  - what the drawer shows for the newest payslip;
  - the ?slip= link opening the drawer on load.
- Confirmation that every file outside the list is unchanged.
