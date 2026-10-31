RUN PAYDAY SPEC (turn 14)

FACTS
- A run on the demo payroll used 185,555 gas on mainnet. eth_estimateGas gives about 290,000, because run() checks that the per-payee budget is left before each payee.
- Gas on Arc is paid in USDC: a run costs the runner about 0.004 USDC and pays back a 0.01 USDC tip.
- Payroll custom errors include NothingDue, Underfunded and InsufficientGasForRun. Decode them with viem: BaseError.walk to ContractFunctionRevertedError, then data.errorName. Never match on message text.
- eth_call works from any address, so the refusal path needs no wallet. Simulate from the connected account, or from 0x000000000000000000000000000000000000dEaD when none is connected.

STATE MACHINE (src/payroll/runMachine.ts, a pure reducer: runReducer(state, event))
- States:
  - ready;
  - checking;
  - refused { reason: 'already_paid' | 'underfunded' | 'other', detail };
  - needs_wallet; wrong_chain;
  - signing; pending { hash }; paid { hash, period, paid, deferred, tip, count };
  - failed { reason: 'cancelled' | 'reverted' | 'no_gas' | 'other', hash?, detail }.
- Events:
  - PRESS;
  - SIM_OK; SIM_REVERT(name, detail);
  - NO_WALLET; WRONG_CHAIN;
  - SIGNED(hash); REJECTED;
  - RECEIPT_OK(summary); RECEIPT_REVERTED(hash);
  - ERROR(kind, detail);
  - RESET.
- Flow on PRESS:
  1. Simulate run().
  2. NothingDue goes to refused already_paid; Underfunded to refused underfunded; any other revert to refused other. None of these asks for a signature.
  3. If the simulation succeeds and no wallet is connected: needs_wallet. Open the ConnectKit modal (useModal().setOpen(true)). After connecting, the visitor presses again; never send automatically.
  4. Connected on another chain: wrong_chain. The button reads "Switch to Arc" and calls switchChain({ chainId: 5042 }).
  5. Otherwise: estimateContractGas, then writeContract with gas = estimate * 13n / 10n. The state is signing until the wallet returns a hash, then pending.
  6. Wait for the receipt (1 confirmation).
     - Status success: parse its logs with parseEventLogs(payrollAbi), keeping only logs whose address is this payroll: PayslipIssued, PayoutDeferred and PaydayRun. Go to paid.
     - Status reverted: failed reverted.
  7. UserRejectedRequestError gives failed cancelled. InsufficientFundsError gives failed no_gas.
- Pending lasts until the receipt or a 60 s timeout. On timeout: failed other, "Still waiting for Arc. Check the tx link."

COPY AND VISUALS (the line goes under the card button, Plex Mono 0.8125rem; the colour is noted where it is not --ink-2)
- checking: button "Checking with the contract...", disabled.
- refused already_paid: grey ALREADY PAID stamp on every slip (stampAll('already')).
  - Line: "Refused by the contract: this payday is already paid. Nothing was signed."
  - After 4 s the stamps fade out over 300 ms, and the state returns to ready.
- refused underfunded: "This payroll owes <owed> USDC and holds <balance> USDC. Nothing was sent."
- refused other: "The contract would refuse this run (<errorName>). Nothing was sent."
- needs_wallet: "Connect a wallet to run payday. You will sign once."
- wrong_chain: button "Switch to Arc". Line: "Your wallet is on another network."
- signing: button "Waiting for your wallet...", disabled. Line: "Approve the transaction in your wallet."
- pending: button "Paying <n> people...", disabled, with an indeterminate 2px bar across the button's bottom edge (--paper at 50%, sweeping left to right every 900 ms). Line: "tx 0x1234...abcd", linked to the explorer.
- paid:
  - Slips for the paid period show "Paid, tx ..." rows. stampAll('paid') stamps only slips with a PayslipIssued event. Slips with PayoutDeferred show "Held for claim", unstamped.
  - Line, in --paid: "Period 0001 paid: 0.03 USDC to 3 people, and your 0.01 USDC tip." Plus a sonner toast with the same text and the explorer link.
  - Refetch the payroll state. After 2,500 ms the stack moves to the new card state with turn 13's entrance motion: the next due period's unstamped slips, or the idle state.
- failed:
  - cancelled: "You cancelled. Nothing was sent."
  - reverted: "Arc refused the run on chain, probably because it was paid a moment earlier. Only the gas was spent." Plus the tx link, and the grey stamp.
  - no_gas: "Your wallet needs a little USDC on Arc for gas, about 0.004 USDC."
  - other: "Something went wrong: <short detail>. Nothing was paid." with a "Try again" text button that sends RESET.
- The hero's primary button only scrolls to and focuses the card's button. It never presses it.

ERROR MAPPING (src/payroll/runErrors.ts)
- classifyRunError(err) returns { kind, name, detail }, built from viem error classes and the decoded errorName. detail is at most 80 characters, with no stack.

TESTS
- runMachine.test.ts covers every transition in the flow:
  - PRESS then SIM_REVERT NothingDue gives refused already_paid;
  - PRESS, SIM_OK, NO_WALLET gives needs_wallet;
  - SIM_OK then WRONG_CHAIN gives wrong_chain;
  - SIM_OK, SIGNED and RECEIPT_OK give paid, with the summary;
  - SIGNED then RECEIPT_REVERTED gives failed reverted;
  - REJECTED gives failed cancelled;
  - RESET from every terminal state gives ready;
  - no transition from checking straight to signing without SIM_OK.
- runErrors.test.ts: a ContractFunctionRevertedError for each of the three error names, UserRejectedRequestError, InsufficientFundsError, and an unknown Error.

ADDED AFTER THE TURN 13 REVIEW

R1. Find a paid run from its receipt, and never swallow an RPC error (src/payroll/lastPaidRun.ts).
- Today the binary search catches every error and moves on (catch { lo = mid + 1n }). When the RPC throttles, the PAID slips silently never appear.
- Keep the exported name, the arguments and PaidRunResult. Add `deferred: Array<{ payee: Address; amount: bigint }>` to PaidRunResult.
- New body:
  1. latest = getBlockNumber().
  2. Walk back from latest in 10,000-block windows, newest first: [max(fromBlock, hi - 9999n), hi], then hi = lo - 1n, until the window would start below fromBlock. Each window is one getLogs for PaydayRun on this payroll with args { period } (period is indexed). Stop at the first window with a log.
  3. No log in any window: return null.
  4. Found: getTransactionReceipt(log.transactionHash), then summarizeRunReceipt(receipt, payroll).
- Export summarizeRunReceipt(receipt, payroll): parseEventLogs(payrollAbi) on the receipt logs whose address equals the payroll, case-insensitively. Return txHash, blockNumber, payslips from PayslipIssued, deferred from PayoutDeferred, and the PaydayRun fields (period, paid, deferred total, tip).
- useRunPayday uses the same summarizeRunReceipt for RECEIPT_OK. There is one receipt parser, not two.
- No try/catch inside lastPaidRun. Errors reach the caller.
- DemoPayrollCard: call lastPaidRun through useQuery, with queryKey ['lastPaidRun', payroll, period], retry 4, and the default backoff. While it loads or after it fails, the idle slips render unstamped with no tx row. Nothing false is ever shown. Remove the paidRunData state and its effect.
- Tests (src/payroll/lastPaidRun.test.ts, with a fake client object):
  - Run in the newest window: exactly one getLogs call.
  - Run three windows back: windows are contiguous, never overlap, and stop at the hit.
  - The oldest window starts exactly at fromBlock.
  - getLogs throws: lastPaidRun rejects, and does not return null.
  - No run anywhere: null.
  - summarizeRunReceipt ignores a PayslipIssued log from another address.

R2. On phones, the Studio badge must not cover the card (src/main.tsx, src/index.css).
- At 375px the fixed "Built with Arc Studio" badge sits on the payslip amount on first load.
- Keep the badge. Move its inline position styles into a class, studio-badge, in index.css.
  - At 768px and wider: unchanged (fixed, bottom 16px, right 16px).
  - Below 768px: position static, display flex, width fit-content, margin 32px auto 24px, so it sits centred at the end of the page.
- Everything else about the badge stays the same.

R3. Loading slip (src/components/DemoPayrollCard.tsx).
- While loading, the placeholder slip shows the zero address as text. Instead render the same slip frame with no text: two --rule bars, 8px tall with radius 2px, 40% and 60% wide, where the address and amount go. Pass no payee.

REPORT BACK, in addition
- The R1 test names. A note that the idle state's PAID slips load from one receipt.
- The scrollWidth at 375px, and the badge's bottom edge against the card's bottom edge at 375px.
