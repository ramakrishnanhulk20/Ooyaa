PROOF PAGE, ROUND 3 (turn 15c): read history through a node that allows 100,000-block log queries

WHY (all measured by the reviewer on 30 Oct, 13:10 to 13:30 UTC)
- 15b stalls. After 3 minutes only C1 to C4 had landed, with no totals and no ledger.
  - The trace shows rpc.mainnet.arc.io rate-limits each call inside a JSON-RPC batch. A batch of 18 eth_getLogs came back mostly "-32005 rate limit exceeded". viem retried the whole batch on back-off, and it never got through.
  - About 25 sequential eth_getCode calls (findCreationBlock) spent 6 s finding a block we can read from one event.
- rpc.mainnet.arc.io caps eth_getLogs at 10,000 blocks. Arc adds about 165,000 blocks a day, so the history costs 3 filters times (age / 10,000) calls: about 115 today and about 270 by 2 Nov.
- https://rpc.blockdaemon.mainnet.arc.io is listed on Arc's own RPC endpoints page.
  - It answers CORS with "*" and allows 100,000-block eth_getLogs.
  - 60 parallel calls took 0.8 s, none refused.
  - Its head matched rpc.mainnet.arc.io exactly.
  - The full demo history took 13 calls and 1.9 s: 154 payroll events, 152 USDC out, 2 USDC in. That equals the 154-row CSV from turn 15 (152 out, 2 in).

FIX
1. src/proof/clients.ts (browser only):
   - mainnetClient = createPublicClient({ chain: arc, transport: fallback([http(BLOCKDAEMON, { retryCount: 4, retryDelay: 500 }), http(ARC_RPC, { retryCount: 6, retryDelay: 1000 })]) }).
   - No JSON-RPC batching anywhere in the browser clients.
   - Export LOG_SOURCES = [{ name: "Blockdaemon", url: BLOCKDAEMON, chunk: 100_000n }, { name: "Arc", url: ARC_RPC, chunk: 10_000n }].
   - BLOCKDAEMON = "https://rpc.blockdaemon.mainnet.arc.io".
   - testnetClient is unchanged.
2. src/proof/history.ts: getLogsChunked and fetchPayrollHistory take an optional `chunk` (default 10_000n, today's value) and keep `parallel`.
3. src/proof/prove.ts:
   - Add `logSources?: { name: string; client: PublicClient; chunk: bigint }[]`. History reads use the first source.
   - If any window fails with a non-rate-limit error, the whole history for that payroll is read again from the next source. onProgress says "Blockdaemon refused a log query, reading Arc's node instead".
   - Add `creationFromEvents?: boolean`. When true, creation blocks come from the factory's PayrollCreated logs (payroll is an indexed topic), read through the log source from the factory's deploy block (add ARC_MAINNET.factoryBlock = 28261674n to src/deployments.ts). findCreationBlock is not called.
   - The CLI passes neither option, so its output is unchanged.
4. useProofReport passes logSources, creationFromEvents true, parallel 6, recentRunsOnly 12 and onLedger.
5. The ProofPage snapshot line gets a second line, Plex Mono --ink-3:
   - "Read through Blockdaemon's public Arc node, listed in Arc's docs. bun run prove reads Arc's own node, so the two cross-check."
   - If the fallback was used: "Read through Arc's public node."
   - Link "Arc's docs" to https://docs.arc.io/arc/references/rpc-endpoints if that page exists, otherwise to https://docs.arc.io.

ACCEPTANCE, in your preview against Arc mainnet:
- first check row within 3 s;
- totals visible before C8 lands;
- all eight within 15 s;
- report the measured times and the request count per host.
- Tests: a history.test.ts case where the first source throws a non-rate-limit error and the second source's rows are returned, plus a prove option test if one is practical without network. Everything else stays green.
