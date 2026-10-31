STUDIO PROMPT 12: the prove-it command

GOAL: A judge runs one command, `bun run prove`, and sees from the live Arc Mainnet that Ooyaa's contracts are exactly the code you wrote and tested, and that every payday paid each payee once, in order, with every cent accounted for. Read-only: no keys, no wallet, no transactions.

Where we are: we deployed your PaydayFactory to Arc Mainnet ourselves, outside Studio, as Circle's rules say. It is a byte-for-byte match of your testnet factory. A demo payroll made by it ran its first payday at 09:02 UTC on 28 Oct. The full specification is in the attached file prompts/12-spec.md. Follow it exactly, including the file layout, names and output format.

PRESET: max preset (full audit and tests).

FILES THIS TURN
- Create: src/deployments.ts, src/proof/abi.ts, src/proof/history.ts, src/proof/checks.ts, src/proof/code.ts, src/proof/prove.ts, src/proof/checks.test.ts, scripts/prove-it.ts.
- Edit: package.json (add one script line only), AGENTS.md (your turn notes).
- Every other file stays unchanged: contracts/, contracts/test*, src/App.tsx, src/config.ts and the other existing src and scripts files.

DO NOT
- Do not change any contract or contract test. Payroll.sol and PaydayFactory.sol are deployed and verified on two networks.
- Do not deploy anything. No transactions this turn.
- Do not import any @circle-fin package in the new files, and do not read any API key or secret.
- Do not create any Circle API key, entity secret, wallet or other credential.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
DASH RULE: no em dash (U+2014) and no en dash (U+2013) in any file you create or edit this turn. Use a colon, a comma or a new sentence.
COMMENT RULE: comments explain why, never what. No step comments, no banner comments, no comment that restates a name.

REPORT BACK
- `bun test src/proof` output (every test name and the pass count), and `bun run check` output.
- Whether your sandbox can reach https://rpc.mainnet.arc.io. If it can, the full output of `bun run contracts:build && bun run prove`. If not, say so. We will run it ourselves.
- Confirmation that every file outside the list above is unchanged.
