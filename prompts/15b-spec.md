PROOF PAGE FIXES (turn 15b, review round 2 of 3 on turn 15)

Turn 15 works: on Arc mainnet all eight checks PASS, VERIFIED stamps, totals read 6.5 in, 1.14 paid, 0.38 tips, 38 runs, 114 payslips, and the CSV downloads with 154 rows. The fixes below are what a judge would hit. Fix every instance of each class.

CLASS 1. The page is too slow, and it gets slower every hour.
- Measured in headless Chrome: first check row at 18 s, last at 152 s on desktop (119 s on mobile), 538 RPC requests, many answered 429.
- The work grows with chain age (eth_getLogs is capped at 10,000 blocks per call, and Arc adds about 165,000 blocks a day) and with runs: an outside wallet now runs about 24 paydays a day.
- Measured on the node: 120 calls sent as 6 JSON-RPC batches of 20 took 2.4 s, against 7.2 s as single calls.
- Fix:
  1. src/proof/clients.ts: the browser clients use http(url, { batch: { batchSize: 20, wait: 16 }, retryCount: 6, retryDelay: 1000 }). scripts/prove-it.ts keeps its own clients unchanged.
  2. src/proof/history.ts: getLogsChunked and fetchPayrollHistory take an optional `parallel` (default 2, today's value). The browser passes 6. The CLI passes nothing.
  3. src/proof/prove.ts:
     - Add `onLedger?: (l: { payroll: Address; ledger: Ledger; history: PayrollHistory }) => void`, called once per payroll as soon as summarizeLedger returns, before any later check.
     - Add `recentRunsOnly?: number`. When set, every check that makes RPC calls per run looks only at the newest N runs. Its CheckResult lines then end with "Checked the N most recent of M runs here. `bun run prove` checks all M."
     - The CLI passes neither, so its output is unchanged.
  4. ProofPage:
     - Sections 2 to 4 (totals, wallets, ledger) render from onLedger, not from the finished report.
     - The browser passes recentRunsOnly 12 and parallel 6.
- Acceptance, in your preview against Arc mainnet:
  - the first check row within 6 s of load, all eight within 30 s;
  - the totals band visible before C8 finishes.
  - Report the times you measured.

CLASS 2. Content is wider than a 375px phone. The page hides it instead of fitting it.
- At 375px the header column and the proof sheet are 382px wide, right edge at 402. html and body have overflow-x hidden, so the PASS marks and the end of the snapshot line are cut off. scrollWidth looks fine only because of that.
- Fix:
  - every grid or flex child on /proof gets min-width 0;
  - mono lines wrap with overflow-wrap anywhere;
  - the sheet uses 20px padding under 768px.
- Acceptance at 375px: no element's getBoundingClientRect().right is beyond the viewport width. Check with element rectangles, not scrollWidth.

CLASS 3. Visual collisions.
- The VERIFIED stamp sits on top of "Run again" and covers it.
  - Anchor the stamp over the last two check rows: right 24px, bottom 64px from the sheet's bottom.
  - pointer-events none. It never overlaps the footer line or the button.
- The ledger's margin line runs through the WHEN text ("22:00 | UTC, 29 Oct").
  - Keep the line at 56px.
  - Every cell in the first column, header included, starts at 72px.
  - No text crosses the line.
- The wallet list prints lowercase addresses (0xabe1...976e), while the ledger prints checksummed ones. Use getAddress everywhere on /proof.
- The Proof nav link sits in the middle of the nav. Move it into the right group, 24px left of Connect, as the spec said.

CLASS 4. The Studio panel hides failing tests.
- build-facts.json says foundry passed 83, failed 6, and the page shows only "83 passing".
- The 6 are the real-USDC fork tests in contracts/test/PayrollFork.t.sol. They need Arc's Foundry and a live Arc fork, and they cannot run in this sandbox. They passed on 28 Oct, against testnet and mainnet state, with Arc's Foundry outside Studio.
- Fix scripts/gen-build-facts.ts:
  - run `forge test --no-match-path contracts/test/PayrollFork.t.sol --json` for the unit and invariant count;
  - count the test functions in PayrollFork.t.sol for the fork number.
- Write: { foundry: { suite: "unit and invariant", passed, failed }, fork: { tests, ranHere: false }, app: { passed, failed }, generatedAt }. Re-run it.
- The Studio panel shows these rows:
  - "Foundry unit and invariant tests: <passed> passing, <failed> failing". The failing number is styled like a FAIL mark when it is above 0.
  - "Real-USDC fork tests: <tests>, run against Arc state with Arc's Foundry, not counted here".
  - "App tests: <passed> passing, <failed> failing".

Tests: keep everything green. Add a history.test.ts case: with parallel 6 and 13 windows, at most 6 requests are ever in flight.
