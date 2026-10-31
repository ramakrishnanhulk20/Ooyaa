STUDIO PROMPT 17b: create your own payroll (part 2 of 2)

GOAL: On /p/<address>, the employer can fund more, withdraw what is free and close the payroll, a payee can claim held pay, and /new lists the wallet's own payrolls. Every action is simulated first and explained in plain words. Build section 17b of the attached prompts/17-spec.md. Visuals follow prompts/13-design.md.

PRESET: max preset (full audit and tests).

FILES
- Create: src/components/payroll/EmployerPanel.tsx, src/components/payroll/ClaimButton.tsx, and tests for the visibility rules, the withdraw max and its copy, and the close gate.
- Edit: src/pages/PayrollPage.tsx, the Your payslips component from 16b (only to place the Claim button), src/pages/NewPayrollPage.tsx (Your payrolls), README.md, AGENTS.md.
- Every other file stays unchanged. scripts/prove-it.ts and the contracts must not change.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction yourself: the page sends only what the visitor signs.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data. Approvals are for the exact amount, never unlimited.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- In your preview: /p/<demo> as a stranger (no panel), and the rendered panel and the close gate in a unit or component test.
- Confirmation that every file outside the list is unchanged.
