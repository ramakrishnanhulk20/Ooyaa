PROOF PAGE SPEC (turn 15). Visual system: prompts/13-design.md (tokens, type, stamp). Every figure comes from Arc mainnet at view time, or from a file a repo script generates from a real run. Nothing is typed in.

DATA
- src/proof/clients.ts: export mainnetClient and testnetClient, viem public clients built like scripts/prove-it.ts builds them (same RPC URLs, chains and retry settings).
- src/proof/prove.ts: add `onCheck?: (c: CheckResult) => void` to prove()'s options. Every CheckResult that ends up in report.checks is passed to onCheck once, in report order, at the moment it is pushed. Nothing else in prove.ts changes.
- scripts/gen-runtime.ts writes src/generated/runtime.ts: `export const LOCAL_RUNTIME = { factory: '0x...', payroll: '0x...' } as const`. It takes the values from the same place scripts/prove-it.ts reads them for C1. Add the package script "gen:runtime".
- scripts/gen-build-facts.ts runs `forge test --json` and `bun test src` and writes src/generated/build-facts.json: { foundry: { passed, failed }, app: { passed, failed }, generatedAt (ISO UTC) }. Add the package script "facts". Run both scripts this turn and keep the generated files.
- src/proof/useProofReport.ts:
  - useQuery(['proofReport'], ...) runs prove({ mainnet, testnet, localRuntime: LOCAL_RUNTIME, onProgress, onCheck }), with staleTime 300000, retry 0 (prove retries on its own) and refetchOnWindowFocus false.
  - It returns { report, checks (live list), progress (latest message), status, error, rerun }.
- src/proof/rows.ts: `buildLedgerRows(history: PayrollHistory, employer: Address): LedgerRow[]`.
  - LedgerRow = { kind: 'funded' | 'payslip' | 'tip' | 'claimed' | 'withdrawn' | 'direct' | 'unexplained', direction: 'in' | 'out', payroll, txHash, blockNumber, logIndex, time?: bigint (from history.blockTimes), period?: bigint, from, to, amount }.
  - Match one to one within each tx, the same way matchTransfers does. PayslipIssued, the PaydayRun tip, Claimed and Withdrawn consume usdcOut; Funded consumes usdcIn. An unconsumed in is 'direct', an unconsumed out is 'unexplained'.
  - Sort newest first, by block and then log index.
- src/proof/rows.test.ts, from a fixture history:
  - One run with 3 payslips and a tip gives 4 out rows, with the right kinds, periods and amounts.
  - Funded gives 1 in row.
  - A plain transfer in gives a 'direct' row.
  - For the same fixture, the row sums equal summarizeLedger's totalPaid, totalTips, totalFunded and directDeposits.

PAGE /proof (src/pages/ProofPage.tsx; route in src/App.tsx; it ships in production builds)

1. Header, desktop 1024px and up. 12-column grid, the hero's container and paddings.
- Left, columns 1 to 7:
  - Label "PROOF, LIVE FROM ARC MAINNET".
  - h1 "Every cent, on the record." Fraunces clamp(2.75rem, 6vw, 5rem), line-height 0.98, letter-spacing -0.025em, --ink.
  - Sub, 1.125rem, --ink-2, max-width 46ch: "This page reads Arc mainnet in your browser and runs the same eight checks as `bun run prove`. Nothing here is typed in by us."
  - Then a Plex Mono 0.8125rem --ink-3 line. While running: "Reading Arc mainnet...". When done: "Snapshot at block 28,438,092, 09:12 UTC, 29 Oct".
  - Below it, "Run it yourself: bun run prove" with a copy icon button. On copy the icon becomes a check for 1.5 s.
- Right, columns 8 to 12: THE PROOF SHEET, the signature moment of this page.
  - Card: --slip, 1px --rule, 8px radius, padding 28px, the hero card's shadow. Label "PROOF SHEET".
  - Under the label, the latest onProgress message in Plex Mono 0.75rem --ink-3, one line, ellipsis. It shows only while running.
  - Eight rows, 1px --rule between rows, 14px vertical padding. Left: the check id (C1) in Plex Mono 0.75rem --ink-3, then the title in Plex Sans 500 0.9375rem --ink. Right: the status mark.
  - Pending row: a 2px bar along the row's bottom edge, --rule at 60%, sweeping every 900 ms with the existing btn-sweep keyframes.
  - When onCheck delivers a row, its mark stamps in: scale 1.4 to 1 and opacity 0 to 1, 220 ms, cubic-bezier(.2,.8,.2,1).
    - PASS: "PASS", Plex Mono 500 0.75rem --paid, 1.5px --paid border, 4px radius, padding 2px 6px, rotate -4deg.
    - FAIL: "FAIL" in --paper on --ink, no rotation.
    - SKIP: "SKIP" in --ink-3, 1px dashed --ink-3 border.
  - Clicking a row toggles its detail lines (CheckResult.lines): Plex Mono 0.8125rem --ink-2, height animated over 200 ms.
  - When all are in, a footer line in Plex Mono: "8 passed, 0 failed, 0 skipped", plus a "Run again" text button.
  - If every check passed, 300 ms later the Stamp component stamps "VERIFIED" across the sheet's lower right: a new StampKind 'verified', --stamp red, -10deg, same motion as PAID. Only when all pass.
  - Error, when prove throws: "Could not finish reading Arc mainnet: <short reason>. This page never shows cached or made-up numbers, so it shows none." Below it a "Try again" button.

2. Totals band, full width, 1px --rule top and bottom, padding 40px 0. Five columns, each a Plex Mono label above a Fraunces 2.5rem --ink figure. Sums across report.ledgers:
- "USDC IN" (totalIn);
- "PAID TO PEOPLE" (totalPaid);
- "TIPS TO RUNNERS" (totalTips);
- "PAYDAYS RUN" (runCount);
- "PAYSLIPS" (payslipCount).
- Under the band, Plex Mono --ink-3: "Across <n> payroll(s) made by the factory 0x18C7...Dc9b", with the address linked to the explorer.
- Figures count up from 0 over 900 ms, ease-out, once, the first time they are in view.
- While loading: --rule skeleton bars 24px tall, and the line "Waiting for the proof sheet to finish reading Arc."

3. Who pressed the button.
- h2 Fraunces 2rem --ink: "<n> wallets have run payday. <m> of them are not ours."
- Sub, --ink-2: "A wallet counts as ours when it is the employer or a payee of that payroll. Anyone else is outside, drawn by the tip."
- List of every runner across all ledgers: the short address linked to the explorer, plus a tag in Plex Mono 0.75rem uppercase: OUTSIDE in --paid, OURS in --ink-3. Outside first. Two columns on desktop.
- If m is 0, say so plainly: "None yet. Run one from the home page and your wallet will be the first."

4. The ledger.
- h2 "Every USDC movement." Sub, in Plex Mono --ink-3: "<n> rows, newest first."
- A "Download CSV" secondary button on the right.
- Sheet: --slip, 1px --rule, 8px radius. A 1px vertical --stamp line at 35% opacity, 56px from the left edge, the full height, for the ledger margin.
- Columns: WHEN, WHAT, FROM, TO, AMOUNT, TX. Add PAYROLL only when there is more than one ledger.
  - WHEN: "09:02 UTC, 28 Oct" from time, else "block 28,272,851".
  - WHAT:
    - "Funded" (or "Funded by employer" when from equals the employer);
    - "Payslip, period 0002";
    - "Tip to runner, period 0002";
    - "Claimed, held pay";
    - "Withdrawn by employer";
    - "Direct deposit";
    - "Unexplained" in --stamp.
  - Addresses: short form, linked to the explorer.
  - AMOUNT: Plex Mono, right-aligned. In is "+0.01", out is "-0.01" (hyphen-minus), followed by " USDC".
  - TX: 0x1234...abcd, linked to the explorer tx page.
- Show 25 rows, then a "Show 25 more" button.
- Row hover: background --paper. Rows enter once in view: fade and rise 8px, 30 ms stagger, at most 25 animated at a time.
- CSV: columns when_utc, block, what, period, from, to, direction, amount_usdc, tx, payroll. File "ooyaa-ledger-<snapshotBlock>.csv". Built in the browser, with no new dependency.

5. Built in Arc Studio. Two columns.
- Left:
  - h2 "Built in Arc Studio."
  - Body: "Studio wrote and tested every contract and every screen on this site. The bytecode on Arc mainnet is byte for byte the code Studio deployed to testnet."
  - Link "Open the Studio project", to https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f.
- Right, a fact list in Plex Mono, rows split by --rule:
  - "Foundry tests: <passed> passing";
  - "App tests: <passed> passing";
  - "Counted <generatedAt as date> by bun run facts";
  - "Mainnet code equals Studio's testnet deploy: <C2 status>";
  - "Source verified: <C3 status>".
- The addresses, each linked: mainnet factory, demo payroll, testnet factory.

MOBILE (under 768px)
- One column, in the order: header, proof sheet, totals, wallets, ledger, Studio.
- Totals in a 2 by 2 grid plus one row.
- Ledger rows become stacked mini slips:
  - line 1, WHAT left and AMOUNT right;
  - line 2, WHEN;
  - line 3, FROM to TO;
  - line 4, the TX link.
- No horizontal scroll at 375px.

NAV (src/components/Nav.tsx)
- Add "Proof", linked to /proof, left of Connect: Plex Sans 500 0.9375rem --ink-2.
- Hover: --ink, with a 1px underline drawing left to right over 200 ms.
- On the active route it is --ink with the underline shown. It shows on mobile too.

/lab (src/pages/LabPage.tsx). Add a "PROOF SHEET STATES" block:
- one check row each: pending, PASS, FAIL, SKIP;
- a button that plays the VERIFIED stamp;
- one in and one out ledger row, in both the table and the mobile card form.
- Label it "EXAMPLE STATE", as the payslip block is.

REDUCED MOTION: no stamp motion, no count-up and no row stagger. Final states show at once.

TESTS: rows.test.ts as above. The existing tests still pass.
