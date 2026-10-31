STUDIO PROMPT 25b: two create-form fixes, taller diagrams, one notes line; amend the unpushed commit

Measured on the turn 25 build in a browser:
1. The live gas estimate never runs.
   - With a valid draft (payee 0x96E81DA285BB91B7D02eE3e6ad51Fa3cAf5daB75, amount 0.01, defaults for the rest, and no field errors shown), the summary box still says "The gas estimate appears when the form is valid". The page sent zero eth_estimateGas requests in 9 seconds.
   - The validity gate probably waits on chain time that is fetched only on submit.
   - Fix: fetch the latest block timestamp on mount, and again every 30 s. Run validateDraft with it, and when the draft is valid, run the debounced estimate.
   - Add a test for the gate: a valid draft with a known chain time enables the estimate.
2. The summary box reads "allow 0.1 USDC USDC". Remove the doubled unit, here and anywhere else the unit is appended twice.
3. Diagrams: content/docs/architecture.md, ARCHITECTURE.md and README.md are uploaded in place, with their flowcharts changed from LR to TB, so the system overview fits the docs column. Keep them as uploaded.
4. AGENTS.md line 572 quotes an internal team name. Rewrite that line as:
   - AGENTS.md: an internal team name replaced with "reviewer"; the "unlock" sentence rewritten.

Then run the checks: the dash grep is clean, bun test src passes, tsc --noEmit is clean, bun run build succeeds, and the two contract files are byte-identical.

Then amend the unpushed commit, keeping its message, with no trailers: `git commit --amend --no-edit`. The git user stays ramakrishnanhulk20. DO NOT PUSH.

DO NOT: change any contract source, deploy anything, send any transaction, create any credential, print any token, or push.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.

REPORT BACK: the check results, `git show --stat HEAD`, the new commit hash, and confirmation that nothing was pushed.
