STUDIO PROMPT 25: fixes from the first-time judge walk, and the build log

GOAL: A first-time judge walked the live site and a clean clone. Fix what they hit, put the "runs without us" proof on the first screen, and add the Studio prompts as the public build log. Commit, but do not push: the owner approves the file list first.

1. Card payslip period, off by one. On /p/<demo>, the card's paid payslips read "PERIOD 0072 ... Paid, tx 0x22e2...0f0e". The line under the button reads "Period 0071 is paid", and the ledger lists the same tx as Period 0071. The card adds one twice.
   - Make the card's slips use the contract index of the run with the shared periodDisplayLabel, which adds one exactly once.
   - Test: idle after contract index 70 is paid, the slips read PERIOD 0071.
2. Card payslips open the payslip.
   - On /p/:address, clicking one of the card's paid slips opens the same SlipDrawer as a ledger row.
   - On the home page, clicking one navigates to /p/<payroll>?slip=<tx>-<logIndex>.
   - Cursor pointer, and the same hover lift the ledger rows have.
3. A live gas estimate on /new. Today the summary box says "Keep about 0.02 USDC extra on Arc for gas", but creating a 3-payee payroll used 2,057,305 gas on mainnet, about 0.043 USDC.
   - Replace that sentence with a live line: estimateContractGas for createPayroll with the draft's args (the account is the wallet, or 0x000000000000000000000000000000000000dEaD with no wallet), times the current gas price.
   - Native USDC pays gas with 18 decimals, so USDC = gas x gasPrice / 1e18.
   - Text: "Gas to create this payroll: about <x> USDC (live estimate). Allowing and funding cost a few thousandths more."
   - While the draft is invalid: "The gas estimate appears when the form is valid." Never a made-up number.
4. Runs per wallet on /proof. Each wallet in "Who pressed the button" shows its run count: "0xABE1...976E OUTSIDE, 70 runs". Count PaydayRun events by runner, across all ledgers.
5. The proof on the first screen (Hero). Under the "Live on Arc mainnet, factory ..." line, add one Plex Mono 0.8125rem --ink-2 line, from the demo payroll's history through the shared useHistory cache:
   "<k> of the <n> paydays so far were run by wallets we do not control, for the 0.01 USDC tip."
   - k counts PaydayRun events whose runner is neither the employer nor a payee ever named; n counts all PaydayRun events. The tip amount comes from the payroll state.
   - The line links to /proof, with an underline drawing on hover.
   - While loading, render nothing in its place, with no layout jump: reserve one line of height. Never show a guessed number.
   - At 375px it wraps; no element wider than the viewport.
6. Docs diagrams. The system overview flowchart on /docs/architecture renders tiny.
   - Render Mermaid flowcharts at their natural size (flowchart useMaxWidth false), centred, inside a box that scrolls sideways on narrow screens.
   - Sequence diagrams keep fitting the column.
7. AGENTS.md: the first line is the template header "# [App Name]". Make it "# Ooyaa". Change nothing else in AGENTS.md except your turn notes.
8. Uploaded in place, keep the words exactly:
   - prompts/*.md (54 files: the build log of every Studio turn);
   - README.md;
   - content/docs/overview.md, content/docs/wallet.md, content/docs/create-payroll.md, content/docs/limits.md;
   - docs/security/threat-model.md.
9. Checks:
   - the dash grep over the repository (excluding node_modules, lib, cache and out) prints nothing;
   - bun test src passes;
   - tsc --noEmit is clean;
   - bun run build succeeds;
   - contracts/Payroll.sol and contracts/PaydayFactory.sol are byte-identical.
10. Commit, with git user ramakrishnanhulk20 as already configured, using exactly this message and no trailers: Judge fixes, live outside-run count, and the Studio build log
    DO NOT PUSH.

DO NOT: change any contract source, deploy anything, send any transaction, create any credential, print any token, or push.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.
COMMENT RULE: comments explain why, never what.

REPORT BACK: the check results, `git show --stat HEAD` (every changed path), the commit hash, and confirmation that nothing was pushed.
