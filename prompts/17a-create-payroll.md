STUDIO PROMPT 17a: create your own payroll (part 1 of 2)

GOAL: A visitor creates their own payroll at /new: payees, a schedule, a tip and funding, with a live draft payslip beside the form. They sign create, allow and fund, each simulated first and explained in plain words when the contract would refuse, and land on the new payroll's page. Build section 17a of the attached prompts/17-spec.md. Visuals follow prompts/13-design.md.

PRESET: max preset (full audit and tests).

FILES
- Create: src/pages/NewPayrollPage.tsx, src/components/create/ (the form, draft and step list), src/payroll/createMachine.ts, src/payroll/createMachine.test.ts, src/payroll/draft.ts, src/payroll/draft.test.ts, and a test for the errorName map and PayrollCreated parsing.
- Edit: src/App.tsx (the /new route), src/components/Nav.tsx (Create), src/components/Hero.tsx (the text link only), src/pages/PayrollPage.tsx (only the ?created=1 toast), src/payroll/runErrors.ts (only to export what the create flow reuses), README.md, AGENTS.md.
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
- In your preview: /new with no wallet (the button opens ConnectKit, and nothing is signed); validateDraft errors shown for a duplicate payee and for USDC as payee; the draft updating as you type.
- Confirmation that every file outside the list is unchanged.
