STUDIO PROMPT 20: fast history within the node's limits, one period numbering, correct due times

GOAL: Payroll pages and the proof page read history once, stay under the private node's 50-per-second limit, and show it within seconds on any screen. Every page numbers periods the same way, and a payslip's due time is right. The attached prompts/20-spec.md has the measurements, fixes and tests. A .gitignore for the repository is uploaded with this turn.

PRESET: max preset (full audit and tests).

FILES
- Edit:
  - src/proof/clients.ts, src/proof/history.ts, src/proof/history.test.ts, src/proof/rows.ts, src/proof/rows.test.ts, src/proof/useProofReport.ts;
  - src/components/proof/LedgerTable.tsx;
  - src/components/payroll/ (any file);
  - src/payroll/lastPaidRun.ts, src/payroll/format.ts, src/payroll/format.test.ts;
  - src/pages/PayrollPage.tsx, src/pages/ProofPage.tsx;
  - README.md, AGENTS.md.
- Create: src/proof/useHistory.ts.
- Uploaded, keep as is: .gitignore.
- Every other file stays unchanged. scripts/prove-it.ts and the contracts must not change.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any API key or credential. VITE_ARC_RPC_URL has no value in your sandbox, and the app must work with it unset.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- Confirmation that every file outside the list is unchanged, and that .gitignore is in the workspace root.
