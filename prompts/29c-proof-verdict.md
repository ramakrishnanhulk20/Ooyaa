STUDIO PROMPT 29c: one proof verdict across every payroll, plus the last audit fixes (part 3 of 3)

Fix exactly these and nothing else. Visuals follow prompts/13-design.md.

1. The /proof verdict disappears. This is a real bug, and it is live now.
   - Evidence (1 Nov, live site and local): the factory has made 2 payrolls, the demo and 0x153EEF6d062037d55a192FE4474f8A07a90EbAEa.
     - At about 66 s the sheet shows "8 passed, 0 failed, 0 skipped" and VERIFIED, after the demo payroll alone.
     - At about 118 s the second payroll's checks arrive and checks.length becomes 13. allDone (checks.length === 8) turns false, and the summary, Run again and VERIFIED disappear for good.
     - The C8 row then shows the second payroll's SKIP, because checksMap keeps the last result per id.
   - Fix:
     - Add `payroll?: Address` to CheckResult. prove() sets it on every C4 to C8 result (one result per payroll). C1 to C3 have none.
     - New pure function mergeChecks(results: CheckResult[]): CheckResult[] in src/proof/mergeChecks.ts.
       - It returns one result per id, in the order C1 to C8, only for ids present.
       - Status: FAIL if any result for that id is FAIL. Otherwise PASS if at least one is PASS. Otherwise SKIP.
       - Lines: every result's lines, in arrival order. When an id has results from more than one payroll, the first line of each payroll's group starts with its short address and a colon ("0x153E...bAEa: "), unless that line already starts with "0x".
     - ProofSheet renders its 8 rows and the summary counts from mergeChecks(checks), never from the raw list.
     - The run is done only when the proof query has finished (status 'success'), never when a count of checks is reached. Only then do the summary line, Run again and VERIFIED appear.
     - VERIFIED means all 8 merged rows are PASS. ProofPage's stamp effect uses the same rule.
     - The CLI (scripts/prove-it.ts) keeps printing one result per payroll, as today.
   - Tests in src/proof/mergeChecks.test.ts:
     - C8 PASS for the demo plus C8 SKIP for a second payroll gives one C8 row: PASS, with the skip reason in its lines behind "0x153E...bAEa: ";
     - a FAIL from any payroll makes that row FAIL;
     - only SKIPs give SKIP;
     - the output order is C1 to C8.
2. The loading state never shows (src/proof/useProofReport.ts).
   - The cause: TanStack Query v5 reports 'pending', never 'loading' or 'idle', and the cast `status as ProofStatus` hides it. So:
     - the progress line under PROOF SHEET never renders;
     - the pending rows never show their sweep bar;
     - ProofPage's isLoading is never true.
   - Add toProofStatus(s: 'pending' | 'error' | 'success'): ProofStatus, which maps 'pending' to 'loading'. Remove the cast and test the function.
   - The progress line reads "Check <n> of 8: <progress message>". n is the number of merged rows that have a result, plus 1, at most 8. Remove the &mdash; entity.
3. The payroll count while the run streams.
   - prove() takes an optional onPayrolls(payrolls: Address[]) callback, called once right after the payrolls are listed. useProofReport exposes the count.
   - The line under the totals band reads:
     - while the run is going: "Read so far: <k> of <n> payrolls made by the factory <link>";
     - when it is done: "Across <n> payroll(s) made by the factory <link>", as today.
   - When the totals change after they first appear, the count-up animates from the numbers on screen to the new ones. It never restarts from a lower number. Evidence, live: paydays read 79, then 75, then 81 when the second payroll arrived.
4. The /proof layout shift.
   - Today: CLS 0.386 at 1440x900, from one jump of 0.346 when the run finishes.
     - The VERIFIED stamp switches from display none to display block in normal flow, so the C7 row grows from 29 to 55px.
     - The done footer mounts.
     - Together they push the totals band and the Studio section down 78px.
   - The fix:
     - The stamp is position absolute over the sheet. It appears with opacity and transform only, never display.
     - The footer row (the summary and Run again) renders from first paint with visibility hidden until done, so its height is always reserved.
   - Target: CLS under 0.1 for a full run at 1440x900.
5. The /p/:address line under the h1 is a flex row today, so a gap sits before the comma ("0xd57D...12E9 , contract").
   - Make it one inline sentence: "Employer 0xd57D...12E9, contract 0xf037...717A". Both addresses stay linked, the comma sits right after the first link, and the copy button follows.
   - On phones it wraps between words only.
6. Tap targets on phones (under 768px), measured at 375px after part 2. Each of these must be at least 44px tall, through padding or min-height with inline-flex. The look stays the same.
   - Every page:
     - the nav and footer logo links (89x22);
     - the footer links (29 tall) and the footer's 17px link;
     - the Studio badge (36 tall).
   - Home: the hero text link under the button (19 tall).
   - /p/:address:
     - the copy button (22x18): give it a 44x44 hit area with padding and a matching negative margin;
     - the secondary buttons (40 tall);
     - the tx links in the phone payslip list (15 tall, 25 of them).
   - /new: the 40px buttons.
   - /docs: the phone menu bar (41), the on-this-page button (38) and the heading anchors (34).
   - Links inside running text are exempt.
7. Dash stand-ins. The house rule is no em dashes, no en dashes, and no " -- " in their place.
   - About 50 comment lines use " -- " in src/, scripts/, contracts/test/ and contracts/test-helpers/. Rewrite each one as a real sentence with a full stop, a colon or a comma, never a single hyphen.
   - One is in generated output: scripts/gen-abi.ts writes "// Generated by scripts/gen-abi.ts -- do not edit by hand." Change it to "// Generated by scripts/gen-abi.ts. Do not edit by hand." and update the generated file to match.
   - Never touch contracts/Payroll.sol or contracts/PaydayFactory.sol. No code behaviour changes in this item.

Checks:
- grep -rnE " -- |&mdash;|&ndash;|\\u2014|\\u2013" src scripts contracts/test contracts/test-helpers prints nothing, and the byte grep for U+2014 and U+2013 prints nothing;
- bun test src passes (report the count);
- tsc --noEmit is clean;
- bun run build succeeds;
- forge test passes (report the count);
- the two contract files are byte-identical.
Commit as ramakrishnanhulk20, with exactly the message "UX audit part 3: one proof verdict across payrolls, loading state, layout shift, tap targets" and no trailers. DO NOT PUSH.

DO NOT: change any contract, deploy anything, send any transaction, create any credential, print any token, or push. Change only the files these items need, plus AGENTS.md turn notes and test files.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
