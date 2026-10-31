PROVE-IT FOLLOW-UP SPEC (turn 12c, small, src/proof and scripts/prove-it.ts only)

F10. Rate limits crash the run.
- Evidence (29 Oct): the public Arc RPC answered "rate limit exceeded" ("Request exceeds defined limit") after heavy traffic. prove then died on its first eth_getCode, and on dueNow in another run, with "fatal".
- A judge on a busy RPC would see a crash instead of a slow, correct result.
- Fix:
  - Create the clients with http(url, { retryCount: 6, retryDelay: 1000 }).
  - Wrap every single read (getCode, readContract, getBlock, getBlockNumber, simulateContract) in one helper, withRetry(fn, label).
    - On rate-limit errors (HTTP 429, or a message containing "rate limit" or "exceeds defined limit"), back off 1, 2, 4, 8, 16 s with jitter, then fail with the reason.
    - Never retry a contract revert.
  - Lower getLogsChunked to 2 chunks in flight.
  - Print one progress line when backing off: "Arc RPC is rate limiting, waiting 4 s".

NITs from the 12b review, fix while in these files:
- C7 prints the equation it checks: "balance at snapshot 6.46 - balance before creation 0 = in 6.5 - out 0.04".
- The ledger totals include "direct deposits".
- The ledger's state section says "oldest unpaid payday due <UTC>" when paydays are waiting, and "next payday <UTC>" otherwise.
- Replace the `history.events as AnyParsedEvent[]` casts with viem's typed narrowing by eventName where tsc allows, so a wrong arg name fails tsc.

TESTS
- withRetry: a fake fn that throws a rate-limit error twice then succeeds returns the value. A revert error is thrown at once.
- C7's line contains the equation.
