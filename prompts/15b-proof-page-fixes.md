STUDIO PROMPT 15b: the proof page, fast and honest on every screen

GOAL: A judge opening /proof sees the first check within seconds and the whole sheet within half a minute. Nothing is cut off on a phone, nothing covers a button, and the Studio panel never hides a failing test. The attached prompts/15b-spec.md has the four classes of fix, with what was measured and how to accept each.

PRESET: max preset (full audit and tests).

FILES: edit only src/proof/clients.ts, src/proof/history.ts, src/proof/prove.ts, src/proof/useProofReport.ts, src/pages/ProofPage.tsx, src/components/proof/ (any file), src/components/Nav.tsx, scripts/gen-build-facts.ts, src/generated/build-facts.json (by re-running the script), README.md, AGENTS.md. Create src/proof/history.test.ts if it does not exist. Every other file stays unchanged; scripts/prove-it.ts must not change.

DO NOT
- Do not change any contract. Do not deploy anything. Do not send any transaction.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test src: names and count. tsc --noEmit. bun run build: the last line.
- The new build-facts.json.
- From your preview against Arc mainnet: the seconds to the first check row, the seconds to all eight, and the number of RPC HTTP requests, if you can count them.
- `bun run prove` output, to show the CLI is unchanged.
- Confirmation that every file outside the list is unchanged.
