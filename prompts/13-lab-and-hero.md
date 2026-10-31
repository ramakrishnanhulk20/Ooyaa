STUDIO PROMPT 13: the hero, the live demo payroll card, and /lab

GOAL: The first screen a judge sees. In five seconds they should know what Ooyaa does, and they should see a real payroll live on Arc Mainnet: its payees, its next payday and its runway, all before connecting a wallet. The PAID stamp is the signature moment. This turn builds the look and the live reads. The Run payday transaction comes next turn.

The contracts are deployed on Arc Mainnet and verified. The attached prompts/13-design.md is the full design spec (every token, size, line of copy, motion and state), and prompts/13-spec.md is the build spec (files, data, tests). Follow both exactly. Do not invent copy, colours or extra sections. Anything not specified there is not built this turn.

PRESET: max preset (full audit and tests).

FILES: only those listed in 13-spec.md under FILES. Do not touch contracts/, contracts/test*, scripts/, src/proof/, src/tracing.ts, src/console-capture.ts or the src/onchain-*.ts files.

DO NOT
- Do not change any contract. Do not deploy anything. No transactions.
- Do not send or sign anything from the page this turn: the Run payday button calls an onRun prop that turn 14 implements.
- Do not create any Circle API key, entity secret, wallet or other credential.
- No fake data: every figure on the home page comes from Arc Mainnet. No hardcoded sample payees, amounts or hashes in components.
- No default SaaS look: no centred hero, no feature-card row, no gradients beyond the specified dot field, no pill buttons, no system fonts.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit, in code, comments or copy.
COMMENT RULE: comments explain why, never what.

REPORT BACK
- bun test (names and count), bun run check, and bun run build output.
- Whether your preview reached Arc Mainnet, and which card state it showed.
- The scrollWidth check at 375px.
- Confirmation that every file outside the list is unchanged.
