STUDIO PROMPT 12c: make prove-it survive a busy RPC

GOAL: A judge runs `bun run prove` on a day the public Arc RPC is busy. Today a rate limit kills the run with "fatal". After this turn it waits, says so, and finishes with the same correct result. The attached prompts/12c-spec.md lists the fix (F10) and four small cleanups from our review of 12b.

PRESET: max preset (full audit and tests).

FILES: edit only src/proof/history.ts, src/proof/prove.ts, src/proof/checks.ts, src/proof/code.ts, src/proof/checks.test.ts and scripts/prove-it.ts. Create src/proof/retry.ts and src/proof/retry.test.ts. Add your turn notes to AGENTS.md. Every other file stays unchanged, including everything turn 13 built (src/components, src/pages, src/payroll, src/config.ts).

DO NOT
- Do not change any contract. Do not deploy anything. No transactions.
- Do not create any Circle API key, entity secret, wallet or other credential.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit.
COMMENT RULE: comments explain why, never what.

REPORT BACK: bun test src/proof (names and count), bun run check, and, if your sandbox reaches Arc Mainnet, the full `bun run prove` output. Confirm that every file outside the list is unchanged.
