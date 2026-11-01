STUDIO PROMPT 29d: finish part 3 (VERIFIED, pending rows, streaming totals)

Part 3 works: the progress line ticks, and the verdict appears only at the end and stays. Four things are still off, measured locally on commit 69919e9. Fix exactly these and nothing else. Visuals follow prompts/13-design.md.

1. VERIFIED never appears.
   - The cause: ProofPage's stamp effect still checks the raw list, `checks.every(c => c.status === 'PASS')`. That is false whenever any payroll SKIPs. The 1 Nov test payroll honestly SKIPs C8, so the summary reads "8 passed, 0 failed, 0 skipped" while the stamp's opacity stays 0.
   - Add isVerified(checks: CheckResult[]): boolean to src/proof/mergeChecks.ts. It is true when mergeChecks(checks) has all 8 ids and every merged row is PASS.
   - ProofSheet and ProofPage both use it. ProofPage's effect fires when status is 'success' and isVerified(checks) is true.
   - Tests:
     - all PASS for the demo, plus a C8 SKIP for a second payroll, gives true;
     - a FAIL from any payroll gives false;
     - a missing id gives false.
2. Pending rows are blank.
   - The cause: ProofSheet maps CHECK_IDS but passes CheckRow only check and pending. With check null, CheckRow shows the id '' and the title CHECK_TITLES[''], so a pending row is an empty 29px strip. It grows to 55px when its result arrives.
   - Those growths are the layout shift that is left: 0.268 at about 32 s, where rows C6, C7 and C8 each grow 26px and push the totals band down 78px.
   - Pass id to CheckRow. A pending row shows its id and title, with the sweep bar, at its full height from first paint.
3. The totals band does not stream.
   - ProofPage now passes loading={isLoading}, so the band shows its skeleton for the whole run, and the "Read so far" line never renders.
   - Pass loading={isLoading && displayLedgers === undefined}. The band then fills from the first finished payroll with "Read so far: <k> of <n> payrolls made by the factory", then "Across <n> payrolls made by the factory" when done.
   - useCountUp: when the target changes in the middle of an animation, start from the value on screen at that moment. Keep the shown value in a ref that updates every frame, never only the last finished target.
   - The skeleton has the same height as the filled band at 1440 and at 375, so the swap moves nothing.
4. Tap targets still under 44px at 375px:
   - the hero link "Every payslip from this payroll" (19 tall): min-height 44px with inline-flex;
   - the copy button on /p/:address (34x42): 44x44;
   - on /new, the "In 2 minutes", "In 1 hour" and "Pick a time (UTC)" buttons (40 tall): 44px;
   - the footer links narrower than 44px (33 and 36 wide): min-width 44px.
   The look stays the same.

Checks:
- grep -rnE " -- |&mdash;|&ndash;|\\u2014|\\u2013" src scripts contracts/test contracts/test-helpers prints nothing, and the byte grep for U+2014 and U+2013 prints nothing;
- bun test src passes (report the count);
- tsc --noEmit is clean;
- bun run build succeeds;
- the two contract files are byte-identical.
Commit as ramakrishnanhulk20, with exactly the message "UX audit part 4: VERIFIED across payrolls, full pending rows, streaming totals" and no trailers. DO NOT PUSH.

DO NOT: change any contract, deploy anything, send any transaction, create any credential, print any token, or push. Change only the files these items need, plus AGENTS.md turn notes and test files.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
