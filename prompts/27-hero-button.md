STUDIO PROMPT 27: "Run today's payday" actually runs payday

WHY: The owner pressed the hero button "Run today's payday" and "nothing happens". Measured on the live site, it only scrolls (263px at 1440, 828px at 375) and moves focus to the card's Run payday button. On desktop the card is already beside the headline, so nothing visible happens. A button with that label must start the run.

CHANGE (src/components/Hero.tsx, src/components/DemoPayrollCard.tsx, src/components/PayrollCard.tsx)
1. Add press() to the card's forwarded handle (PayrollCardHandle, passed through by DemoPayrollCard). It calls the same press function as the card's own Run payday button, with the same simulate-first flow. Nothing is signed or sent unless the visitor approves in their wallet.
2. The hero button's onClick:
   - if the card's Run payday button is not fully in view, smooth-scroll it into view (offset -120), as today;
   - call cardRef.current.press() at once; do not wait for the scroll;
   - give the card a short highlight: a 2px --ink outline that fades out over 900 ms, so the visitor sees where the action happened;
   - keep the focus move to the card button.
3. When the card is already busy (checking, signing or pending), the hero button does nothing more than scroll and highlight.
4. Remove any comment or test that says the hero never presses the card.
5. Tests: the handle's press calls the card's press once; a second click while pending does not start a second run.
6. Checks:
   - the dash grep over the repository is clean;
   - bun test src passes;
   - tsc --noEmit is clean;
   - bun run build succeeds;
   - the two contract files are byte-identical.
7. Commit as ramakrishnanhulk20 with exactly this message and no trailers: Hero button runs payday
   DO NOT PUSH.

DO NOT: change any other file except AGENTS.md turn notes, deploy anything, send any transaction, create any credential, print any token, or push.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
