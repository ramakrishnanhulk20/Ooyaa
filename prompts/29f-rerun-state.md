STUDIO PROMPT 29f: "Run again" starts from a clean sheet

Part 5 works: a first run is clean (CLS 0.014, VERIFIED only after it is earned, "Read so far: 1 of 2" while streaming). Pressing "Run again" is wrong, measured locally on commit b47e01a. Fix exactly this and nothing else.

1. The cause: TanStack Query v5 keeps status 'success' while it refetches after invalidateQueries, and only fetchStatus becomes 'fetching'. So during a re-run:
   - the old VERIFIED stamp stays visible (visibility visible, opacity 1) before anything is re-checked;
   - the summary shows live counts ("0 passed, 0 failed, 0 skipped", then "3 passed, ...") as if the run were done;
   - the totals band keeps the old "Across 2 payrolls" label.
2. The fix:
   - In src/proof/useProofReport.ts, toProofStatus takes both values: toProofStatus(status, fetchStatus). It returns 'loading' when status is 'pending' or fetchStatus is 'fetching'; otherwise it returns status. Pass fetchStatus from useQuery.
   - In ProofSheet, when status becomes 'loading', reset the stamp: setStampShown(false), and stampControls.set({ opacity: 0, scale: reducedMotion ? 1 : 1.6 }).
   - Everything else already follows status: the progress line, the pending rows, the summary, Run again, the band label and the stamp effect.
3. Tests (src/proof/toProofStatus.test.ts):
   - ('success', 'fetching') gives 'loading';
   - ('pending', 'fetching') gives 'loading';
   - ('success', 'idle') gives 'success';
   - ('error', 'idle') gives 'error'.

Checks:
- grep -rnE " -- |&mdash;|&ndash;|\\u2014|\\u2013" src scripts contracts/test contracts/test-helpers prints nothing, and the byte grep for U+2014 and U+2013 prints nothing;
- bun test src passes (report the count);
- tsc --noEmit is clean;
- bun run build succeeds;
- the two contract files are byte-identical.
Commit as ramakrishnanhulk20, with exactly the message "Run again starts from a clean proof sheet" and no trailers. DO NOT PUSH.

DO NOT: change any contract, deploy anything, send any transaction, create any credential, print any token, or push. Change only the files this needs, plus AGENTS.md turn notes and test files.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
