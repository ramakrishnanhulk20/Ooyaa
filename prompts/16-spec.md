PAYROLL PAGE SPEC (turn 16). Visual system: prompts/13-design.md. Every figure from Arc mainnet at view time.

WHAT IT IS: /p/:address shows any payroll made by Ooyaa's factory: its live card with Run payday, every payslip it ever issued, a payslip you can open like a real one, and, when your connected wallet is a payee, just your payslips with a CSV. The demo payroll becomes one example of this page.

A. Generalise the card (src/components/PayrollCard.tsx).
- Move DemoPayrollCard's body into PayrollCard, with props { payroll: Address; fromBlock: bigint; label: string }, and the same forwarded handle.
- Every use of the PAYROLL constant and ARC_MAINNET.demoPayrollBlock becomes the props.
- DemoPayrollCard stays as a three-line wrapper: payroll = ARC_MAINNET.demoPayroll, fromBlock = ARC_MAINNET.demoPayrollBlock, label "DEMO PAYROLL". The hero must look and behave exactly as today.
- Under the card's run line, add a text link, Plex Sans 500 0.875rem --ink with underline drawing on hover: "Every payslip from this payroll". It goes to /p/<payroll>. Hide it on /p/:address itself.

B. Creation block. Export `creationBlockOf(payroll: Address): Promise<bigint>` from src/proof/creation.ts. Use the PayrollCreated lookup that prove.ts already uses with creationFromEvents, and move that code there so both use one function. Cache per payroll with react-query (staleTime Infinity).

C. Page /p/:address (src/pages/PayrollPage.tsx, route in src/App.tsx).
1. Guards, in order. Each is a centred message block in the page container, h2 Fraunces 2rem --ink, body --ink-2:
   - not isAddress: "That is not an address." Link "Go to the demo payroll".
   - factory.isPayroll(address) false: "This address is not a payroll made by Ooyaa's factory." Body "Ooyaa only shows payrolls it can prove. Check it on the explorer:", then an explorer link.
   - Loading: the card skeleton plus "Reading Arc mainnet...".
2. Header, desktop: 12 columns, the hero's container and paddings.
   - Left, columns 1 to 6:
     - label "PAYROLL";
     - h1, Fraunces clamp(2.5rem, 5vw, 4rem), line-height 1, --ink: "Payroll of 0xd57D...12E9", the employer in short form;
     - sub, 1.125rem --ink-2: "<n> payees, <amount> USDC each, every <cadence>. <tip> USDC tip for whoever runs it." Use the existing format helpers. For mixed amounts: "<n> payees, <periodTotal> USDC per payday, every <cadence>."
     - a Plex Mono 0.8125rem --ink-3 line: the full payroll address with a copy button, then "Created <UTC time, date>, block <n>", linked to the explorer tx.
   - Right, columns 7 to 12: PayrollCard (label "PAYROLL").
3. Your payslips. Only when a wallet is connected and it is in the payee list, now or in the history.
   - A band with 1px --rule top and bottom.
   - h2 "Your payslips." Fraunces 2rem.
   - Figures, like the proof page's totals band: "PAYSLIPS <count>", "PAID TO YOU <sum> USDC", "HELD FOR CLAIM <claimable> USDC" (claimable from the contract; show it only when above 0).
   - Button "Download my payslips (CSV)". Columns when_utc, period, amount_usdc, tx, payroll.
   - No signature is ever needed for this section.
4. Every payslip.
   - h2 "Every payslip." Sub, Plex Mono --ink-3: "<n> rows, newest first."
   - Filter chips: All, Payslips, Tips, Funding. 8px radius, Plex Mono 0.75rem uppercase, active chip --ink with --paper text.
   - Download CSV.
   - Reuse LedgerTable for one payroll, with rows from fetchPayrollHistory plus buildLedgerRows through the same log source as /proof (Blockdaemon first, Arc as fallback).
   - Each Payslip row is clickable and opens the payslip.
5. Open a payslip: a right-side drawer, 440px wide on desktop and full screen under 768px.
   - Backdrop rgba(18,25,63,.32). Slides in 280 ms cubic-bezier(.2,.8,.2,1).
   - Inside: the existing Payslip component at full size, for that row: period, payee, amount, the paid row "Paid, tx 0x...".
   - The PAID stamp plays once, 150 ms after the drawer settles.
   - Below the slip, a Plex Mono list: "Due <UTC> (start + period x length)", "Paid <UTC> (block time)", "Block <n>", "Run by <runner short>", and "Tip <tip> USDC" from the same tx's PaydayRun.
   - Links: "Open on explorer", and "Copy link to this payslip", which copies /p/<payroll>?slip=<tx>-<logIndex>.
   - Opening that URL opens the drawer on load.
   - Close on Escape, on a backdrop click and with the close button. Focus is trapped while open and returns to the row on close.
6. Mobile, under 768px:
   - one column: header, card, your payslips, every payslip;
   - the ledger uses its stacked mini-slip form;
   - the drawer is full screen;
   - no element wider than the viewport. Check with element rectangles at 375px.

D. Carried from turn 14 (src/payroll):
1. A receipt that lands after the 60 s message is thrown away today.
   - After the message, keep waiting: waitForTransactionReceipt({ hash, timeout: 600_000 }).
   - runReducer accepts RECEIPT_OK and RECEIPT_REVERTED from failed with reason 'other' when the event hash equals state.hash.
   - A receipt for another hash changes nothing.
   - Tests: SIGNED(h), ERROR(other, h), RECEIPT_OK(h) gives paid; RECEIPT_OK(other hash) leaves the state unchanged.
2. The "other" failure line adds a full stop after a detail that already ends in one ("limit.."). Strip one trailing full stop from the detail before composing the line. Add a test.

TESTS
- creation.ts against a fake client: the block of the PayrollCreated log whose payroll topic matches; null when there is none.
- The payee filter: rows for one payee only, case-insensitive.
- The CSV builders: header and one row, exact strings.
- The two runMachine cases and the copy test above.

E. Small fixes found on the proof page after turn 15c (src/proof/clients.ts, src/proof/prove.ts, src/components/proof/ProofSheet.tsx)
1. Blockdaemon does not keep old state. A historical eth_call answers "-32603 state at block #28272851 is pruned", and only then does the fallback reach Arc's node.
   - Every read with a blockNumber more than 1,000 blocks behind the snapshot goes straight to Arc's node, through a separate archiveClient (Arc RPC only, retryCount 6, retryDelay 1000).
   - Everything else keeps today's fallback order.
2. The VERIFIED stamp now covers C8's PASS mark. Move it to right 112px, so it sits in the empty space between the C7 and C8 titles and their marks and covers no mark, title or button.
