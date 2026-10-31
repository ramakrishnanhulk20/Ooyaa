FIX ROUND (turn 20). Measured by the reviewer on 31 Oct, 05:15 to 05:40 UTC, with the private node set.

1. Stay under the private node's rate limit, and read history once per page.
- Evidence: one load of /p/<demo> sent 192 requests to QuickNode. 42 were refused with 429 "-32007 50/second request limit reached". The fallback then sent 76 to Arc's node, which refused 18 with 429. History took 22 s on desktop and 64 s at 375px.
- Fix A, the limiter (src/proof/clients.ts): a small shared limiter in front of the private transport.
  - At most 8 requests in flight, and at most 40 request starts per rolling second. Implement it as a custom viem transport that wraps http(PRIVATE_RPC); no new dependency.
  - On a 429 or -32007 from the private node, wait 300 ms and retry there, up to 3 times, before the fallback moves to Arc.
- Fix B, one read per page (src/proof/history.ts, src/components/payroll/*, src/payroll/lastPaidRun.ts):
  - Every component that needs a payroll's history (EveryPayslip, YourPayslips, the card's lastPaidRun, the proof page) gets it from one react-query cache entry, queryKey ['history', payroll], through a hook useHistory(payroll, fromBlock).
  - staleTime 60 s. A refetch reads only blocks after the last cached block and appends them.
- Acceptance, measured in a browser on /p/<demo> with VITE_ARC_RPC_URL set:
  - history visible within 6 s at 1440 and at 375;
  - zero 429 responses;
  - no request to Arc's node unless the private one fails outright.

2. One period numbering everywhere.
- Evidence: the same run (tx 0x5266...695a, contract period index 37) shows as "period 0037" in the /proof ledger and as "#0038" on /p. The hero card and the drawer use index + 1.
- Fix: the label shown to people is always periodLabel(index + 1), written "Period 0038" (title case in running text, "PERIOD 0038" in Plex Mono labels).
  - Ledger WHAT texts become "Payslip, period 0038", "Tip to runner, period 0038" and so on, on /proof and /p alike. Replace the "#0038" form.
  - CSV files (both pages, and the payee CSV) get two columns, period_index (the contract value) and period_label, in place of the single period column.
  - Docs say: "Period 0038 is contract period index 37."
- Tests: the label function at 0, 37 and 9999; the CSV header for both files.

3. The payslip drawer's due time is one period late.
- Evidence: the drawer for period index 37 says "Due 23:00 UTC, 29 Oct 2026 / Paid 22:00 UTC, 29 Oct 2026", paid before due.
  - Per the contract, period i becomes payable at startTime + i * periodLength (startedPeriods = (now - startTime) / periodLength + 1). For the demo, i = 37 is due at 22:00.
- Fix: due = startTime + index * periodLength, everywhere a due time is shown for a period.
- Test: index 0 is due at startTime, and index 37 at startTime + 37 * periodLength.

4. The filter does not change the count.
- Evidence: with TIPS selected, the line still reads "154 rows, newest first".
- Fix: "<shown> of <total> rows, newest first" when a filter is active, "<total> rows, newest first" otherwise. The CSV still exports what the filter shows, and its button says so: "Download CSV (<shown> rows)".

5. Repository hygiene: a .gitignore is uploaded with this turn (the reviewer wrote it). Keep it as it is.

Tests: everything stays green, plus the tests named above.
