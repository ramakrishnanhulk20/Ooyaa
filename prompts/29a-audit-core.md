STUDIO PROMPT 29a: what a judge sees first (UX audit, part 1 of 2)

A senior UX audit of the live site (1 Nov) found these. Fix exactly these and nothing else. Visuals follow prompts/13-design.md.

1. The card's period is one behind while paydays are waiting (src/components/PayrollCard.tsx, src/payroll/cardState.ts). It is a real bug.
   - Evidence: the home card shows "PAYSLIP, PERIOD 0079 ... Due 16:00 UTC, 31 Oct" unpaid, while the drawer and history show Period 0079 "Due 15:00, Paid 06:32 UTC, 1 Nov". Period 0079 is contract index 78, due 15:00. Index 79 (Period 0080) is due 16:00.
   - Fix:
     - In the due state, the slips show the next unpaid period: index = nextUnpaid, label periodDisplayLabel(nextUnpaid), due = startTime + nextUnpaid * periodLength.
     - In the idle state (all paid), the slips show the last paid run, as today.
   - Test: due with nextUnpaid 79 gives PERIOD 0080 and the 16:00 due time; idle after index 78 gives PERIOD 0079 PAID.
2. "15 paydays due" reads as 15 missed paydays, right next to "Payday that never misses."
   - The card header becomes "<n> paydays waiting" (and "1 payday waiting"; keep "Payday due" for exactly one).
   - When more than one is waiting, the line under the button reads: "Nothing is skipped. Run one to pay the oldest waiting payday and keep the <tip> USDC tip."
3. The hero button label becomes "Run a payday". Its behaviour stays as today: it presses the card.
4. Our own wallets are counted as outside. 0x209AC4703EaDcfDee399E4542c81394366b4b9a6 is the owner's test wallet, and it has run 6 demo paydays.
   - Add ARC_MAINNET.teamWallets = ['0x209AC4703EaDcfDee399E4542c81394366b4b9a6'] in src/deployments.ts.
   - A wallet is "ours" when it is the employer, a payee ever named, or in teamWallets, everywhere this is decided: the hero count, /proof's wallet list and counts (OURS and OUTSIDE), and the ledger's outsideRunners. Use one helper, isOurWallet(address, ledger), and nothing else.
   - The /proof sentence that explains "ours" adds: "or one of the team's own test wallets".
   - Test: a run by a teamWallets address counts as ours, case-insensitive.
5. The hero trust line (src/components/Hero.tsx). Today it is a 13px grey mono line that is easy to miss.
   - Replace it with Plex Sans 500 1.125rem in --ink: "<k> of <n> paydays were run by wallets we do not control."
   - On the next line, an underlined link to /proof, Plex Sans 500 1rem --ink: "Re-check every cent live on the proof page".
   - Keep the "Live on Arc mainnet, factory ..." mono line, below both.
   - Keep the reserved height while loading, and no guessed numbers.
6. /new summary box copy (src/components/create/):
   - "You will confirm 3 wallet prompts: create the payroll, approve <amount> USDC, fund it." Never print "..."; if the amount is not known yet, say "approve USDC".
   - The "FUND NOW" label becomes "Put in USDC for", then the paydays input, then "paydays (<total> USDC)".
   - "Fund later" becomes "Fund later (nothing is paid until you add USDC)".
   - Input placeholder colour #6B7280.
7. The /p/:address header (src/pages/PayrollPage.tsx):
   - h1: "Demo payroll" for ARC_MAINNET.demoPayroll, and "Payroll" for any other.
   - The mono line under it: "Employer 0xd57D...12E9, contract 0xf037...717A", both linked to the explorer.
   - Remove the stray "|" after the copy icon in the address row.
   - "Download CSV (0 rows)" while loading becomes a disabled "Download CSV" until rows load.
8. Payslip drawer: 24px inner padding around the slip, and "Open on explorer" underlined like "Copy link".

Checks:
- the dash grep is clean;
- bun test src passes;
- tsc --noEmit is clean;
- bun run build succeeds;
- the two contract files are byte-identical.
Commit as ramakrishnanhulk20, with exactly the message "UX audit part 1: card truth, trust line, clearer copy" and no trailers. DO NOT PUSH.

DO NOT: change any contract, deploy anything, send any transaction, create any credential, print any token, or push. Change only the files these items need, plus AGENTS.md turn notes and test files.
WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
REPORT BACK: the check results, `git show --stat HEAD`, the commit hash, and confirmation that nothing was pushed.
