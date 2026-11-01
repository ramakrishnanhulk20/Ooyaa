STUDIO PROMPT 29e: a steady proof sheet and an honest stamp (part 5)

Part 4 works: VERIFIED appears at the end of a full run, the pending rows have full height, and the totals stream. Four small things are left on /proof, measured locally on commit f474cdb. Fix exactly these and nothing else.

1. The progress line under PROOF SHEET unmounts when the run ends, so the whole sheet jumps up 34px. This is the last big layout shift: 0.146 at the end of the run, at 1440x900.
   - Always render the line's box at the same height. While the run is going it shows "Check <n> of 8: <progress>". When the run is over it keeps its height, with visibility hidden.
2. The two lines under the headline wrap onto more lines than they reserve. Each reserves 1.3em (20px) today, so the column below moves when they fill in. Measured final heights:
   - at 1440, the "Snapshot at block ..." line is 1 line and the "Read through ..." line is 2 lines (39px);
   - at 375, the snapshot line is 2 lines (39px) and the "Read through ..." line is 3 lines (59px).
   Give both lines line-height 1.5, with these min-heights:
   - the snapshot line: 1.5em at 768px and wider, 3em under 768px;
   - the "Read through ..." line: 3em at 768px and wider, 4.5em under 768px.
3. "Read so far" never shows. TotalsBand picks its label from the loading prop, and that is false as soon as the first payroll streams. Add a separate prop, running={isLoading}, used only for the label:
   - while the run is going: "Read so far: <k> of <n> payrolls made by the factory <link>";
   - when it is done: "Across <n> payrolls made by the factory <link>".
4. The VERIFIED stamp is now always in the page at opacity 0, so screen readers and copy and paste get "VERIFIED" before anything is verified (document.body.innerText contains it from first paint).
   - Until stampVerified runs, the stamp has visibility hidden and aria-hidden="true". After that it is visible, and aria-hidden is removed.
   - It stays position absolute, so nothing moves.

Target: CLS under 0.1 for a full run at 1440x900.

Checks:
- grep -rnE " -- |&mdash;|&ndash;|\\u2014|\\u2013" src scripts contracts/test contracts/test-helpers prints nothing, and the byte grep for U+2014 and U+2013 prints nothing;
- bun test src passes (report the count);
- tsc --noEmit is clean;
- bun run build succeeds;
- the two contract files are byte-identical.
Commit as ramakrishnanhulk20, with exactly the message "UX audit part 5: steady proof sheet, honest stamp, read-so-far label" and no trailers. DO NOT PUSH.

DO NOT: change any contract, deploy anything, send any transaction, create any credential, print any token, or push. Change only the files these items need, plus AGENTS.md turn notes and test files.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
