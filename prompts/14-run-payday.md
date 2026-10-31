STUDIO PROMPT 14: Run payday, for real

GOAL: The demo card's button pays real people on Arc Mainnet. A visitor connects any wallet, presses Run payday, signs once, and watches each payslip get stamped PAID as the receipt lands, with their 0.01 USDC tip. When nothing is due, pressing the button lets the contract refuse a second run, with no wallet and no signature needed. That is the exactly-once promise, shown rather than told.

The attached prompts/14-spec.md is the full spec: the state machine, every line of copy, every error and the tests. It builds on turn 13's components, and prompts/13-design.md still governs every visual.

PRESET: max preset (full audit and tests).

FILES
- Create: src/payroll/runMachine.ts, src/payroll/runMachine.test.ts, src/payroll/runErrors.ts, src/payroll/runErrors.test.ts, src/payroll/useRunPayday.ts, src/payroll/lastPaidRun.test.ts.
- Edit: src/components/DemoPayrollCard.tsx, src/components/Payslip.tsx (only if the held and paid rows need it), src/payroll/lastPaidRun.ts, src/main.tsx, src/index.css, AGENTS.md.
- The spec's last section, "ADDED AFTER THE TURN 13 REVIEW", lists the work in lastPaidRun.ts, main.tsx and index.css.
- Every other file stays unchanged.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction yourself: the page sends only what the visitor signs.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data, and no optimistic success: a slip is stamped PAID only for a PayslipIssued event in a successful receipt.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test (names and count), bun run check and bun run build output.
- In your preview, if it reaches Arc Mainnet: the refusal path (press the button when nothing is due, with no wallet). It must show the ALREADY PAID stamp and request no signature.
- Confirmation that every file outside the list is unchanged.
