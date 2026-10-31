STUDIO PROMPT 19: payroll history that loads, everywhere

GOAL: The proof page and every payroll page load their full history in seconds, through the site's private Arc node (QuickNode, set by VITE_ARC_RPC_URL), with Arc's public node as the fallback. Two honesty fixes come along: a closed payroll can still pay what it owes from the card, and the C8 copy says exactly what was checked. The attached prompts/19-spec.md has the measurements and the exact changes.

PRESET: max preset (full audit and tests).

FILES
- Edit:
  - src/proof/clients.ts, src/proof/history.ts, src/proof/history.test.ts, src/proof/prove.ts, src/proof/useProofReport.ts;
  - src/pages/ProofPage.tsx, src/components/proof/ProofSheet.tsx;
  - src/components/payroll/EveryPayslip.tsx, src/components/payroll/YourPayslips.tsx, src/payroll/lastPaidRun.ts;
  - src/payroll/cardState.ts, src/payroll/cardState.test.ts, src/components/PayrollCard.tsx;
  - .env.example, README.md, AGENTS.md.
- Every other file stays unchanged. scripts/prove-it.ts keeps reading Arc's public node.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any API key or credential. VITE_ARC_RPC_URL is set by the owner outside the repo, and there is no real value in your sandbox. Build so the app works with it unset (Arc's node only) and with it set.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- `bun run prove`, to show the CLI is unchanged apart from the C8 line.
- Confirmation that every file outside the list is unchanged.
