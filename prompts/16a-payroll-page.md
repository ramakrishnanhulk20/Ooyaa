STUDIO PROMPT 16a: a page for every payroll (part 1 of 2)

GOAL: Any payroll made by Ooyaa's factory gets its own page at /p/<address>, with its live card and Run payday. The demo card becomes one use of a general PayrollCard. The attached prompts/16-spec.md is the full design. Build only these sections this turn:
- A (PayrollCard and the DemoPayrollCard wrapper; include the "Every payslip from this payroll" link);
- B (creation.ts);
- C.1 (guards);
- C.2 (header and card);
- C.6 (mobile, for these parts only);
- E (the two proof page fixes).
Sections C.3, C.4, C.5 and D come in turn 16b. Do not start them. The link from the card may point at /p/<payroll> before the payslip list exists.

PRESET: max preset (full audit and tests).

FILES
- Create: src/components/PayrollCard.tsx, src/pages/PayrollPage.tsx, src/proof/creation.ts, src/proof/creation.test.ts.
- Edit:
  - src/components/DemoPayrollCard.tsx;
  - src/App.tsx (the route);
  - src/proof/prove.ts (creationBlockOf and the archive reads);
  - src/proof/clients.ts (archiveClient);
  - src/proof/useProofReport.ts (only if the archive client must be passed in);
  - src/components/proof/ProofSheet.tsx (the stamp position);
  - README.md and AGENTS.md.
- Every other file stays unchanged. scripts/prove-it.ts and src/payroll must not change. The hero must look and behave as today.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- In your preview:
  - /p/0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A: the header lines;
  - /p/0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b: the not-a-payroll message;
  - /p/nonsense;
  - and /proof: the time to all eight checks.
- `bun run prove`, to show the CLI is unchanged.
- Confirmation that every file outside the list is unchanged.
