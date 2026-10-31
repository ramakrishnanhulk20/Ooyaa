RUN PAYDAY FIXES (turn 14b, review round 2 of 3 on turn 14)

Turn 14 works end to end: with no wallet, pressing Run payday sends one eth_call, shows "Connect a wallet to run payday. You will sign once." and opens ConnectKit. The fixes below are about what the visitor is told when something goes wrong. Fix every instance of each class, not only the line named.

CLASS 1. Errors are classified by the outermost error instead of walking the cause chain.
- Evidence, executed: a real walletClient.writeContract through viem, with a wallet that answers code 4001, throws ContractFunctionExecutionError > TransactionExecutionError > UserRejectedRequestError. `err instanceof UserRejectedRequestError` is false, and classifyRunError returns kind 'other'. The visitor reads "Something went wrong: User rejected the request." instead of "You cancelled. Nothing was sent." InsufficientFundsError is missed the same way, so no_gas never shows.
- Today's tests pass only because they build bare errors that the app never sees.
- Fix (src/payroll/runErrors.ts): for a BaseError, walk the chain in this order:
  1. UserRejectedRequestError gives cancelled.
  2. InsufficientFundsError gives no_gas.
  3. ContractFunctionRevertedError gives reverted, with data.errorName.
  4. Anything else gives other.
- The hook uses classifyRunError for every error. Delete isNothingDue, isUnderfunded, getRevertName and the hook's own instanceof checks. There is one classifier.
- Tests (src/payroll/runErrors.test.ts): build every error the way the app meets it.
  - Cancel and no gas: createWalletClient({ chain: arc, transport: custom({ request }) }). request answers eth_chainId with '0x13b2'. For any other method it throws { code: 4001, message: 'User rejected the request.' } (cancel), or { code: -32000, message: 'insufficient funds for gas * price + value' } (no gas). Call writeContract with the RUN_ABI fragment, account 0xd57D8F8A615F35133D8121e58F4ed778A4F612E9 and gas 300000n. Classify what it throws.
  - Reverts: createPublicClient with a custom transport whose eth_call throws { code: 3, message: 'execution reverted', data: toFunctionSelector('NothingDue()') }. Call simulateContract for run(). Do the same for Underfunded and InsufficientGasForRun. If viem needs the revert data in a different place to decode it, put it there and say so in the report.
  - A transport that throws an HTTP 429-style error gives other.

CLASS 2. Something that happened before sending is described as a contract refusal or an on-chain event.
- The simulation catch sends every error to SIM_REVERT. An RPC timeout or rate limit therefore reads "The contract would refuse this run (unknown)". The contract said nothing.
- A revert from estimateContractGas (someone ran payday between the check and the estimate) goes to failed reverted: "Arc refused the run on chain ... Only the gas was spent." Nothing was sent and no gas was spent.
- Fix: every check happens inside `checking`, and signing starts only when the wallet is about to be asked. On PRESS:
  1. checking. Simulate from the wallet address, or 0x...dEaD with no wallet. A decoded revert gives SIM_REVERT (refused). Any other error gives ERROR other.
  2. No wallet: NO_WALLET from checking, and open the modal.
  3. Wrong chain: WRONG_CHAIN from checking.
  4. Wallet client not ready: ERROR other.
  5. estimateContractGas from the wallet. A decoded revert gives SIM_REVERT, with the same refused copy as step 1. Any other error gives ERROR other.
  6. SIM_OK moves checking to signing, immediately before writeContract.
- Reducer (src/payroll/runMachine.ts): NO_WALLET and WRONG_CHAIN are accepted only from checking.
- Replace the turn 14 test "PRESS, SIM_OK, NO_WALLET" with these:
  - PRESS then NO_WALLET gives needs_wallet.
  - PRESS then WRONG_CHAIN gives wrong_chain.
  - NO_WALLET while signing leaves the state unchanged.
  - SIM_REVERT after PRESS still gives refused, and that covers the estimate step too.

SMALL FIXES IN THE SAME FILES
- RECEIPT_OK is built from summarizeRunReceipt alone. Drop the second PaydayRun parse in the hook.
- Comments explain why, never what. Delete these from useRunPayday.ts:
  - "// Step 1: simulate." through "// Step 6: ...";
  - "// Simulate from the connected address, or from DEAD when no wallet.";
  - "// Any other revert.";
  - "// 60 second receipt timeout.";
  - "// Invalidate payroll state so the card refreshes."
  Keep the RUN_ABI and WalletClient-cast comments. In index.css, delete "/* Desktop: fixed bottom-right */" and "/* Mobile: static, centred below the page content */".
- README: the test counts must match `bun test src/payroll` and `bun test src/proof` after this turn. src/proof has 35 today, not 31.
