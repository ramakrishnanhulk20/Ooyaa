HISTORY SOURCE AND FIX ROUND (turn 19)

WHY (measured by the reviewer on 31 Oct, 04:20 to 05:10 UTC)
- /p/<demo> "Every payslip" never loads ("Loading... No rows yet" after 60 s).
  - Blockdaemon now answers eth_getLogs older than about 2.5 days with code 4444 "pruned history unavailable". It worked on 30 Oct; our history ages every hour.
  - Arc's public node refuses eth_getLogs after 3 or 4 calls, even one at a time.
  - The proof page has the same dependency.
- The project now has a private Arc mainnet endpoint (QuickNode).
  - It answers 10,000-block eth_getLogs in about 0.2 s and historical eth_call (archive).
  - It serves about 45 parallel calls before refusing.
  - It caps eth_getLogs at 10,000 blocks.

A. One RPC setup for the whole browser app (src/proof/clients.ts)
1. PRIVATE_RPC = import.meta.env.VITE_ARC_RPC_URL (optional). ARC_RPC = "https://rpc.mainnet.arc.io".
2. mainnetClient and archiveClient both use fallback([http(PRIVATE_RPC, { retryCount: 3, retryDelay: 400 }), http(ARC_RPC, { retryCount: 6, retryDelay: 1000 })]) when PRIVATE_RPC is set, else Arc only. No batching.
3. LOG_SOURCES becomes [{ name: "QuickNode", client: private, chunk: 10_000n, parallel: 8 }, { name: "Arc", client: arc, chunk: 10_000n, parallel: 2 }], with the first entry only when PRIVATE_RPC is set. Remove Blockdaemon everywhere, because it prunes logs.
4. fetchPayrollHistory takes the parallel value from the source.
5. Every place that reads payroll history uses the same LOG_SOURCES and fallback logic as prove() (one helper, readHistory(payroll, fromBlock), exported from src/proof/history.ts):
   - the proof page;
   - EveryPayslip and YourPayslips on /p/:address;
   - lastPaidRun's window walk.
6. Proof page source line:
   - with the private node: "Read through the site's QuickNode Arc node. bun run prove reads Arc's public node, so the two cross-check.";
   - without it: "Read through Arc's public node.";
   - on fallback: "QuickNode refused, read through Arc's public node instead."
7. .env.example gains:
   `# Optional. A private Arc mainnet RPC URL (QuickNode or similar), domain-restricted, used by the browser. Without it the app reads Arc's public node, which is slower and rate-limited.`
   `VITE_ARC_RPC_URL=`
   Never commit a real value.

B. Fix: a closed payroll still pays what it owes (src/payroll/cardState.ts, src/components/PayrollCard.tsx)
- Today deriveCardState returns 'closed' before checking dueNow, so Run payday is disabled. But close() only stops new periods: periods that already started still run (Payroll.sol NatSpec on close).
- When closed and dueNow, the state is 'due', and the card adds one line: "This payroll is closed. Paydays that already started can still be run."
- Only closed with nothing due shows the closed state.
- Tests: closed plus due gives due with closed true; closed plus nothing due gives closed.

C. Fix: the C8 copy claims more than the code does (src/proof/prove.ts, src/components/proof/ProofSheet.tsx)
- The copy says `bun run prove` checks all runs for C8. prove.ts checks the newest few in both the CLI and the page.
- Make every C8 line state what was checked, using the real numbers: "Checked the <k> most recent of <n> runs."
- Delete any sentence that claims the CLI checks all runs.
- The CLI output keeps its format, plus that same line.

D. Tests: readHistory falls through to the second source on a non-rate-limit error, and uses parallel from the source (at most 8 in flight). Everything else stays green.
