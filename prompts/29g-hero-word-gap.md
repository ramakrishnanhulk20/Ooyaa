STUDIO PROMPT 29g: restore the hero word gaps

Part 2 item 3 gave the hero h1 real spaces, but the words now look glued: "Paydaythat nevermisses." Fix exactly this and nothing else.

- Measured gap between word boxes, live site (before part 2): 28px at 1440 (0.25em of 112px) and 14px at 375 (0.25em of 56px).
- Measured locally on commit 66c8a4c: 5.6px and 2.8px.
- The cause: in src/components/Hero.tsx each word span is inline-block with marginRight '0.05em'. The added space sits inside the span, at its end, where the browser collapses it to zero width.
- The fix: set the word span's marginRight back to '0.25em'. Keep the space inside the span, so textContent stays "Payday that never misses." and the visible gap is exactly 0.25em, as on the live site.

Checks:
- bun test src passes (report the count);
- tsc --noEmit is clean;
- bun run build succeeds;
- the dash grep is clean;
- the two contract files are byte-identical.
Commit as ramakrishnanhulk20, with exactly the message "Restore the hero word gaps" and no trailers. DO NOT PUSH.

DO NOT: change any contract, deploy anything, send any transaction, create any credential, print any token, or push. Change only src/components/Hero.tsx, plus AGENTS.md turn notes.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
