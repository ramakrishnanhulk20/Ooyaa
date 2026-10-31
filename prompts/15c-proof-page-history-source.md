STUDIO PROMPT 15c: the proof page loads in seconds

GOAL: /proof finishes all eight checks within 15 seconds, at every history length, by reading logs through Blockdaemon's public Arc node (100,000-block queries) with Arc's own node as the fallback, and by taking creation blocks from factory events. The attached prompts/15c-spec.md has the measurements and the exact changes. This is the last review round on the proof page.

PRESET: max preset (full audit and tests).

FILES: edit only src/proof/clients.ts, src/proof/history.ts, src/proof/history.test.ts, src/proof/prove.ts, src/proof/useProofReport.ts, src/pages/ProofPage.tsx, src/components/proof/ (only if the snapshot line lives there), src/deployments.ts (factoryBlock only), README.md, AGENTS.md. Every other file stays unchanged; scripts/prove-it.ts must not change.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential. Blockdaemon's endpoint here needs no key; if it ever asks for one, stop and report.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- From your preview: the seconds to the first row, to the totals, and to all eight, plus the requests per host.
- `bun run prove`, to show the CLI is unchanged.
- Confirmation that every file outside the list is unchanged.
