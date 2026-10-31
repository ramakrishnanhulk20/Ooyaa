# Ooyaa threat model

Ooyaa is a payroll on Arc. An employer lists the people to pay and what each gets per period, then funds a payroll contract with USDC. When a period starts, anyone can call `run()`. The contract pays every payee once, in order, and sends a small tip to whoever called. This document covers the two contracts, `PaydayFactory` and `Payroll`, and the parts of the web app and the `bun run prove` tool that sign transactions or make claims about the chain. It says what we trust, which rules the contracts must keep, which function keeps each rule, which test checks it, which attacks we considered, and what is not covered. It is dated 31 October 2026 and describes the code in this repository on that date. No external audit has been done.

The rules are called invariants. An invariant is a rule that must still be true after any sequence of calls. They are numbered C1 to C39. Some numbers are not used (C25, C26, C28 to C33) because they described things that are not in the shipped product. The numbers are kept as they are because comments in `Payroll.sol` and in the tests refer to them, for example C6, C10 and C35.

The proof page and `bun run prove` also have eight checks, labelled C1 to C8. That is a different list. In this document they are always called "proof check C1" to "proof check C8".

## 1. What is protected, and who acts

| Who | What they can do |
|---|---|
| Employer | The address that called `createPayroll`, or the address that later accepted the role. Adds, changes and removes payees between paydays. Withdraws the free balance. Closes the payroll. Hands the role to another address in two steps. |
| Payee | An address on the payroll's list with an amount per period. Is paid by `run()`. Collects pay that was held for them with `claim()`. |
| Runner | Any address that calls `run()`. Pays the gas and receives the tip. |
| Funder | Any address that calls `fund()` with its own USDC. |
| Visitor | Anyone reading the app or the chain. |
| Factory | `PaydayFactory`. Deploys payrolls and answers `isPayroll`. It has no owner, takes no fee and has no power over a payroll after creating it. |

What is worth attacking:

1. The USDC held by a payroll. It splits into owed money (pay for periods that have started and are unpaid, plus pay held for payees) and free money (everything else).
2. The employer role.
3. The factory's answer to the question "is this address one of your payrolls?"
4. What the app and the proof tool tell a reader about the chain.

Only three functions send USDC out of a payroll: `run`, `claim` and `withdraw`. Only `fund` pulls USDC in. The other state-changing functions (`addPayee`, `updatePayee`, `removePayee`, `close`, `transferEmployer`, `cancelEmployerTransfer`, `acceptEmployer`) change records and move no money.

## 2. What we trust

USDC. The contracts call exactly one other contract: USDC at `0x3600000000000000000000000000000000000000`, written into `Payroll.sol` as a constant. On Arc this is the 6-decimal ERC-20 face of the chain's native balance. The same balance also pays gas and shows 18 decimals there. We assume `transfer`, `transferFrom` and `balanceOf` behave like a normal ERC-20. Circle, the issuer, can blocklist any address, including a payroll's address. Transfers to or from a blocklisted address revert. We cannot prevent that. If Circle blocklisted a payroll, the money in it would be frozen.

Arc. Arc runs on a permissioned validator set. Validators can delay or censor transactions and can set a block timestamp within the protocol's limits. Timestamps have one-second granularity and can repeat across blocks. We assume a mined block is final. The tests assume a per-transaction gas cap of 16,777,216 (the cap in EIP-7825) and a block gas limit of 30,000,000. If Arc's real transaction cap is lower than 16,777,216, the 100-payee worst case in C6 would need to be re-measured.

No admin key, no upgrade. The factory has no owner. A payroll has no admin account. The only privileged addresses are the `employer` and `pendingEmployer` stored in each payroll. There is no proxy, no pause and no upgrade path. The code at each address is final. A bug found later means a new factory, and existing payrolls stay on the old code.

Tools. Solidity 0.8.28, the Cancun EVM version, the optimizer at 200 runs, OpenZeppelin 5.6.1 (`SafeERC20` and `ReentrancyGuard`), and Foundry for the tests.

Outside services for the app and the proof tool. Public Arc RPC nodes, Sourcify, and the visitor's own wallet. Nothing on this list is trusted by the contracts.

## 3. Out of scope

- Employment truth. A payslip proves that a payroll sent USDC to an address. It does not prove that the employer is a company or that the payee is an employee. Anyone can create a payroll and pay themselves.
- Future pay. Only started, unpaid periods are protected. An employer can stop funding, withdraw what is not owed, or close.
- What Circle and Arc's validators do (blocklists, freezes, delays, censorship, timestamp choices within protocol limits), and any future change to how USDC behaves.
- Privacy. Every payee address and amount is public.
- A stolen wallet, a malicious browser extension, a phishing copy of the site on another domain, and an RPC node that lies to the app.
- Spam. Anyone can create payrolls, list any address as a payee, and send it USDC. This inflates counts and can be used for address poisoning. Nothing in the contracts stops it.
- Other chains, other tokens, and any yield or vault feature. None is built.

## 4. Invariants

Each entry gives the rule, the code that keeps it, and the tests that check it. Test names are in `contracts/test/` unless a path is given. "Not covered" says what the listed tests do not show.

### Money

#### C1. Money leaves a payroll only by fixed rules

USDC leaves a payroll in four ways. `run` pays a payee the scheduled amount for a started period. `run` pays the tip to the caller of that run. `claim` pays a payee their own held pay. `withdraw` pays the employer out of the free balance. None of these functions takes a destination argument. Claims and withdrawals go to `msg.sender`.

- Upheld by: `Payroll.run`, `Payroll.claim`, `Payroll.withdraw`.
- Tests: `invariant_MoneyOnlyLeavesByRules` (after random call sequences, starting balance plus funded equals balance plus paid plus withdrawn plus claimed plus tips), `invariant_NoForbiddenCallSucceeds`, `test_WithdrawPaysEmployerOnly`, `test_OnlyEmployerFunctions`, `test_TipGoesToCaller`, `test_RunPaysEveryPayeeOnce`.
- Not covered: the invariant suite runs one payroll against a mock token. The real token is covered by the fork tests.

#### C2. One definition of owed

Owed is (started periods minus `nextUnpaid`) times (period total plus tip), plus all held pay. It is computed in one internal function, `_owed`. `freeBalance` is the balance minus owed, or 0 if the balance is short. `withdraw` can take at most `freeBalance`. `runway` counts only whole periods of free balance. So no employer call can push the balance below owed. The tip is inside owed, so withdrawing can never leave a due period unable to pay its tip.

`run` uses a smaller test on purpose. It needs the balance to cover held pay plus one period plus the tip. That way a partly funded backlog still pays its oldest period. `close` does not compute owed. It records `closedAt`, and `_startedPeriodsCapped` applies it.

- Upheld by: `_owed`, `freeBalance`, `withdraw`, `runway`, `getState`, and the balance check at the top of `run`.
- Tests: `test_EmployerCannotWithdrawOwed` (fund 3 periods, pass 3 period starts without running, withdraw fails, all 3 periods then run), `test_WithdrawLeavesTipCovered` (fund exactly one period plus tip, withdraw fails, the run succeeds), `test_RunKeepsDeferredClaimsCovered`, `test_UnderfundedRunReverts`, `test_FundAfterCloseCoversOwed`, `test_RemovePayeeUpdatesPeriodTotal`, `invariant_BalanceCoversOwed`, `invariant_OwedMatchesModel` (the expected value is computed from other state, not by calling `owed`), `invariant_EmployerNeverGrowsShortfall`, `invariant_FundedDuePeriodAlwaysRuns`.
- Not covered: owed protects only money that is in the contract. It cannot make an employer fund a payroll.

#### C3. A started period's schedule cannot change

`addPayee`, `updatePayee` and `removePayee` revert `ScheduleLocked` while any started period is unpaid. Once every started period is paid, a change takes effect from the next period that has not started. A removed payee is still paid for every period that started before the removal.

- Upheld by: the `nextUnpaid < _startedPeriodsCapped()` check in the three functions.
- Tests: `test_ScheduleLockedWhileStartedPeriodUnpaid`, `test_ScheduleChangeAppliesFromNextPeriod` (amount A for periods 0 to 2, amount B for periods 3 to 5, the payee removed from period 6), `test_ExactBoundary`, `test_ExactBoundaryPeriod0`, `invariant_NoForbiddenCallSucceeds`.
- Side effect: a started period that is unfunded keeps the schedule locked until it is paid.

#### C4. Each period is paid once, in order

There is one counter, `nextUnpaid`. `run()` takes no argument. It pays the period at `nextUnpaid` and adds one to the counter before any transfer. When `nextUnpaid` has caught up with the started periods, `run` reverts `NothingDue`. Two runs in the same block cannot pay the same period.

- Upheld by: `run`, with `nonReentrant`.
- Tests: `test_SecondRunSamePeriodReverts`, `test_RunsGoInOrder`, `test_RunBeforeStartReverts`, `testFuzz_NeverPaysAPeriodTwice`, `test_ExactBoundary` (two runs in one block), `invariant_PaidNeverExceedsSchedule` (paid plus claimed plus held equals the sum of scheduled periods).

#### C5. One payee cannot block the others

Each payee transfer goes through `_tryPayUsdc`, which never reverts. It forwards at most 110,000 gas. A revert, a `false`, malformed return data, or running out of that gas counts as a refusal. A refused amount is added to `claimable[payee]` and `totalDeferred`, `PayoutDeferred` is emitted, and the run goes on. Held pay counts as owed, so the employer cannot withdraw it. Only that payee can collect it, with `claim()`, and it is sent to that payee. Removing the payee from the list does not remove the claim.

- Upheld by: `_tryPayUsdc`, `run`, `claim`, `_owed`.
- Tests: `test_BlockedPayeeDoesNotBlockOthers`, `test_DeferredClaimStaysOwedAfterClose`, `test_GasBurningPayeeIsDeferredOthersPaid`, `test_GasBurningPayeeIsDeferredOthersPaid_Capped`, `test_ShortReturnDataIsDeferred`, `test_NonBooleanWordIsDeferred`, `invariant_DeferredMatchesClaims`, `invariant_GhostDeferredMatchesContract`, and on Arc's real USDC `test_fork_BlocklistedPayeeDeferred` (one payee really blocklisted on the token, the other nine paid).
- Not covered: there is no dedicated test that removes a payee who holds a claim. That behaviour is read from `claim`, which does not check the payee list.

#### C6. Bounded work

No function loops over periods. Payee loops cover at most 100 entries. Each payee transfer gets at most 110,000 gas. The factory's lists return at most 100 entries per call. A 100-payee run in which every payee burns its whole gas budget must still fit under 16,777,216 gas.

- Upheld by: `_startedPeriodsRaw` (plain arithmetic, no loop), the 100-payee limit in the constructor and `addPayee`, `PAYEE_TRANSFER_GAS`, and the 100-entry cap in `allPayrolls` and `payrollsCreatedBy`.
- Tests: `test_WorstCaseHundredBurningPayeesFitsTxCap` (limit 16,777,216), `test_GasHundredPayees`, `test_HundredPayeeLimit`, `test_CloseAfterLongBacklog` (`close`, `owed` and `getState` still work after 10,000 unrun periods), `test_ListsAreCapped`, and on Arc's real USDC `test_fork_HundredPayeeRunGas` and `test_fork_SinglePayeeTransferGas`.
- Measured: a 100-payee run on real USDC state took 4,512,108 gas in a fork run on 26 October 2026. The figure moves with how many payee addresses are new to USDC. The worst case, 100 payees that all burn their full budget, took between 13.7 and 14.1 million gas, depending on the Foundry build. The tests assert only upper bounds: 10 million gas for the 100-payee runs, 200,000 for the one-payee run, and 16,777,216 for the worst case.

#### C7. Bad inputs are rejected with a named error

The constructor, which `createPayroll` runs, and the payee functions revert unless all of this holds:

| Input | Rule |
|---|---|
| Employer | Not the zero address |
| Payees and amounts | Same length. 1 to 100 payees |
| Each payee | Not zero, not already listed, not the payroll, not USDC. Uniqueness uses the `indexPlusOne` mapping, not a loop |
| Each amount | From 1 unit to 1,000,000 USDC |
| First payday | From the current block time to 365 days ahead |
| Period length | From 60 seconds to 366 days |
| Tip | From 0 to 10 USDC |

`run` reverts `NothingDue` when no period is due. `removePayee` refuses to remove the last payee (`LastPayee`).

- Upheld by: the checks in the `Payroll` constructor, `addPayee` and `updatePayee`.
- Tests: one test per constructor error (`test_ConstructorRejects_ZeroEmployer`, `test_ConstructorRejects_LengthMismatch`, `test_ConstructorRejects_EmptyPayeeList`, `test_ConstructorRejects_TooManyPayees`, `test_ConstructorRejects_ZeroPayee`, `test_ConstructorRejects_DuplicatePayee`, `test_ConstructorRejects_PayeeIsThis`, `test_ConstructorRejects_PayeeIsUsdc`, `test_ConstructorRejects_ZeroAmount`, `test_ConstructorRejects_AmountTooLarge`, `test_ConstructorRejects_StartTimeTooEarly`, `test_ConstructorRejects_StartTimeTooLate`, `test_ConstructorRejects_PeriodLengthTooShort`, `test_ConstructorRejects_PeriodLengthTooLong`, `test_ConstructorRejects_TipTooLarge`), `test_AddPayeeRejectsBadInputs`, `test_UpdatePayeeRejectsBadInputs`, `test_HundredPayeeLimit`, `test_RemoveLastPayeeReverts`, `test_RunBeforeStartReverts`.
- Not covered: there is no fuzz test over the constructor arguments. No test calls `createPayroll` with bad inputs through the factory. The factory runs the same constructor.

#### C8. Surprise balances are harmless

Nothing depends on the balance equalling the books. USDC sent straight to a payroll, or forced in by a self-destructing contract, only raises `freeBalance`. `Payroll` has no `payable` function, no `receive`, no `fallback`, and sends no native value. Every USDC movement is a checked transfer: `SafeERC20` for `fund`, `claim`, `withdraw` and the tip, and `_tryPayUsdc` for payees.

- Upheld by: `freeBalance` reads `balanceOf` and subtracts `_owed`. No function needs the two to be equal.
- Tests: `test_DirectTransferOnlyRaisesFreeBalance`, and on Arc's real USDC `test_fork_SelfdestructCredit` (5e12 plus 7 wei forced in raises the balance by exactly 5 USDC units, because the 18-decimal amount is cut to 6 decimals; owed is unchanged and `run`, `withdraw` and `close` still work).

#### C9. Authority is a stored role

Every employer function compares `msg.sender` with the stored `employer`. There is no `tx.origin` and no assumption that the caller is a plain wallet. Control changes only when the pending address calls `acceptEmployer`, and the old employer loses every power in that same transaction. `createPayroll` always makes the caller the employer. `fund` pulls only from the caller.

- Upheld by: the first line of `withdraw`, `addPayee`, `updatePayee`, `removePayee`, `close`, `transferEmployer` and `cancelEmployerTransfer`; `acceptEmployer`; `PaydayFactory.createPayroll`; `fund`.
- Tests: `test_OnlyEmployerFunctions`, `test_EmployerHandover`, `test_AcceptEmployerClearsPending`, `test_CancelEmployerTransfer`, `test_CreateSetsCallerAsEmployer`, `invariant_NoForbiddenCallSucceeds` (random callers try `withdraw` and `acceptEmployer`).
- Note: `fund` is open to anyone. Whatever a stranger adds above owed becomes free balance that the employer can withdraw. `test_FundAfterCloseCoversOwed` funds from a non-employer address.

#### C10. No employer action traps money

There is no pause. Nothing the employer can call locks owed wages: `withdraw` is capped by the free balance, the schedule is locked while a started period is unpaid, and `close` only caps future periods. Nothing locks the employer's own free money either, because the role cannot be given to the payroll or to USDC (C39). After `close`, owed periods still run and the free balance can still be withdrawn.

- Upheld by: `withdraw`, `close`, `_startedPeriodsCapped`, `transferEmployer`.
- Tests: `test_CloseStopsFuturePeriods`, `test_FundAfterCloseCoversOwed`, `test_CloseBeforeStartOwesNothing`, `test_DeferredClaimStaysOwedAfterClose`, `test_TransferEmployerRejectsSelfAndToken`.
- Not covered: money held for a payee who stays blocklisted stays in the payroll (see C34 and the known limits).

#### C11. Close is final

`close()` fixes `closedAt` as the number of periods that have started at that moment. Those periods are still owed and still run. No period that starts later is ever owed. After close, payee changes revert `Closed`, `fund` still works so a closed payroll can be topped up to pay what it owes, and `withdraw` releases only the balance above owed. Close cannot be undone.

- Upheld by: `close`, `_startedPeriodsCapped`, the `closed` checks in the payee functions.
- Tests: `test_CloseStopsFuturePeriods`, `test_CloseBeforeStartOwesNothing`, `test_ExactBoundary` (closing at the exact second period 1 starts still owes period 1), `test_FundAfterCloseCoversOwed`, `test_RunwayZeroAfterClose`, `test_NextPaydayAfterClose`, `invariant_NoForbiddenCallSucceeds`.
- Not covered: closing a second time (`AlreadyClosed`) has no test.

### Outputs

#### C12. Events are receipts

`PayslipIssued` is emitted only when the USDC transfer to that payee succeeded in the same call. A payee whose transfer was refused gets `PayoutDeferred` and never `PayslipIssued`. In `PaydayRun`, paid plus deferred equals the period total, and the tip is what the runner received (0 when the tip is 0). `Funded`, `Withdrawn` and `Claimed` carry the same amount that is passed to the transfer on the line before.

- Upheld by: `run`, `fund`, `withdraw`, `claim`.
- Tests: `invariant_EventsMatchTransfers` (every `PayslipIssued` has a matching USDC `Transfer` from the payroll in the same call, `PayoutDeferred` has none, and the tip is exactly one transfer to the runner), `test_RunEventsMatchTransfers`, `test_RunPaysEveryPayeeOnce`, `test_RunsGoInOrder`, `test_BlockedPayeeDoesNotBlockOthers`.
- Not covered: no unit test matches `Funded`, `Withdrawn` or `Claimed` to a transfer log. Proof check C7 does that on live chain data.

#### C13. Views never overstate and never revert

`owed`, `freeBalance`, `runway`, `startedPeriods`, `dueNow`, `periodStart`, `nextPayday`, `getPayees` and `getState` all use the same period arithmetic. `freeBalance` is 0 in a shortfall. `runway` counts only whole periods of free balance beyond owed, and is 0 after close. `periodStart` returns `type(uint256).max` instead of overflowing. `nextPayday` returns `type(uint256).max` once the payroll is closed and fully paid. The views that read the balance rely on USDC answering `balanceOf`.

- Upheld by: the view functions in `Payroll.sol`.
- Tests: `test_ViewsNeverRevert`, `test_RunwayCountsOnlyFuturePeriods`, `test_RunwayZeroAfterClose`, `test_NextPaydayAfterClose`, `test_PeriodStartNeverReverts`, `testFuzz_PeriodStartNeverRevertsAndMonotonic`, `invariant_StartedPeriodsMatchesClock`.

### Provenance and the app

The web app is a set of static pages that read Arc directly. It can ask a wallet to sign only four things: `createPayroll`, an `approve` on USDC, `fund`, and `run`. It has no screens for `claim`, `withdraw`, `close` or payee changes. Those are contract calls made by other means. The entries below describe the app as shipped. They are checked by reading the code in `src/`, plus the tests named.

#### C14. An address is a payroll only if the factory says so

`PaydayFactory.isPayroll(address)` is set to true in one place, inside `createPayroll`, for the contract it has just deployed. It is never cleared. The app shows a payroll page, and a Run button, only when the factory answers yes. It does not ask a payroll to vouch for itself. A contract that copies every view of a payroll still gets the page "This address is not a payroll made by Ooyaa's factory." with no buttons. Proof check C4 makes the same check from a terminal.

- Upheld by: `PaydayFactory.createPayroll`, `PaydayFactory.isPayroll`, and the guard in `src/pages/PayrollPage.tsx`.
- Tests: `test_IsPayrollOnlyForFactoryPayrolls`, `test_CreateSetsCallerAsEmployer`.
- Not covered: there is no automated test of the page. It is checked by reading the code.

#### C15. The factory's list is history, not authority

`createdBy` and `payrollsCreatedBy` record who called `createPayroll`. They do not change when the employer role moves. Anything that needs the current employer reads `Payroll.employer()`. The app shows the employer from the payroll's own `getState()` and does not use the factory's per-employer list. The proof tool uses `payrollCount` and `payrollAt` only to list every payroll.

- Upheld by: `PaydayFactory.createdBy`, `PaydayFactory.payrollsCreatedBy`, `Payroll.employer`.
- Tests: `test_ListsAreHistoryNotAuthority`.

#### C16. Writes are built from checked parts

Every transaction the app asks a wallet to sign has one of four shapes:

1. `createPayroll` on the factory address fixed in `src/deployments.ts`.
2. `approve` on USDC, with the new payroll as spender and exactly the amount to be funded. Never an unlimited amount.
3. `fund` on the payroll that was just created. Its address is read from the `PayrollCreated` log of the creation receipt, taking only logs emitted by the factory address.
4. `run()` on a payroll page that passed the factory check (C14), or on the demo payroll constant.

The payees, amounts, start time, period and tip come from the create form. The form can restore the visitor's own earlier entries from the browser's saved draft (`ooyaa:draft:v1`). The form shows them and validates them before anything is signed. Nothing in the URL supplies an amount, a recipient or a payee. The `?slip=` and `?created=` query values only open a drawer or show a message. Creating a payroll takes three separate wallet signatures: create, approve, fund. There is no batched approve-and-fund. If the allowance is already enough, the approve is skipped. The form also lets the visitor create now and fund later.

- Upheld by: `src/payroll/useCreatePayroll.ts`, `src/payroll/useRunPayday.ts`, `src/payroll/parsePayrollCreated.ts`, `src/payroll/draft.ts`.
- Tests: `src/payroll/draft.test.ts` (validation and the fund amount), `src/payroll/createMachine.test.ts`. A search of `src/` finds no `maxUint256`, no `sendCalls` and no `dangerouslySetInnerHTML`.
- Not covered: the arguments of the signed transactions are not unit tested.

#### C17. Wrong chain or no wallet means no writes

The create flow checks for a connected account and chain id 5042 before it simulates or signs anything. The run flow simulates first, as the wallet or, with no wallet, as a dead address, then requires a wallet on chain 5042 before it asks for a signature. A wallet on another chain sees a "Switch to Arc" button instead. `createPayroll`, `fund` and `run` are simulated before signing, and the contract's error name is shown in plain words. `approve` is not simulated.

- Upheld by: `src/payroll/useCreatePayroll.ts`, `src/payroll/useRunPayday.ts`, `src/components/PayrollCard.tsx`.
- Tests: `src/payroll/createMachine.test.ts` and `src/payroll/runMachine.test.ts` (the wrong-chain and no-wallet states). The hooks themselves are not tested against a wallet.

#### C18. One parser each for addresses and amounts

Addresses from the URL and the create form go through viem's `isAddress` and then `getAddress` before they are shown, compared or used. A bad address in the URL shows "That is not an address." Duplicate payees are detected on the checksummed form. Amounts typed by a user go through `parseUsdcInput`, which allows at most 6 decimals. Amounts shown go through `formatUsdc`. The app reads the 6-decimal ERC-20 view of balances only. It never reads or adds in the 18-decimal native balance.

- Upheld by: `src/pages/PayrollPage.tsx`, `src/payroll/draft.ts`, `src/payroll/format.ts`.
- Tests: `src/payroll/draft.test.ts`, `src/payroll/format.test.ts`.
- Not covered: no test opens the route with a lowercase, bad-checksum or junk address.

#### C19. History is complete, or it is an error

The payslip list, the proof page and `bun run prove` read logs in block ranges, retry on rate limits, and halve the range if a node refuses it. If a range still fails after the retries and the fallback node, the whole read fails. The page shows an error ("Could not load ledger. Refresh to try again.") or the command stops. No total is shown for data that was not read. Logs come from the payroll's own address, and USDC `Transfer` logs are read only from the USDC address with the payroll as sender or receiver. Proof checks C6 and C7 match each payslip, tip, claim, withdrawal and funding to a transfer in the same transaction.

Countdowns on the page use a clock that is set from the latest block time every 15 seconds and then ticks with the browser. Whether a payday is due is decided by the contract: the Run button simulates `run()` first.

- Upheld by: `getLogsChunked` and `fetchPayrollHistory` in `src/proof/history.ts`, `src/proof/retry.ts`, `src/proof/checks.ts`, `src/payroll/useChainClock.ts`.
- Tests: `src/proof/history.test.ts`, `src/proof/retry.test.ts`, `src/proof/checks.test.ts`.
- Not covered: no test fails one log page and checks what the page then shows.

#### C20. Counts say what they count

The proof page lists each wallet that ran payday and marks it OURS or OUTSIDE. A wallet is ours when it has been the employer of that payroll, or has been a payee (paid, held, or added). Any other wallet is outside. The page prints this rule. `bun run prove` prints the same split, and also the funders and the payees paid.

- Upheld by: `buildLedger` in `src/proof/checks.ts` and `src/components/proof/WalletList.tsx`.
- Tests: `src/proof/rows.test.ts` covers ledger rows. The OURS and OUTSIDE split has no test of its own.
- Limit: OUTSIDE means "not the employer and not a payee". Anyone can make a new wallet, so OUTSIDE does not prove that a wallet belongs to an unrelated person.

#### C21. Text from outside is shown as plain text

Addresses, numbers and error names are rendered as React text. Error text from a wallet or an RPC node is cut to 80 characters and shown as text. No component uses `dangerouslySetInnerHTML`. Links to the explorer are built from a fixed base address plus a checksummed address or a transaction hash.

- Upheld by: `src/payroll/runErrors.ts` and the components under `src/`.
- Tests: `src/payroll/runErrors.test.ts`, `src/payroll/createErrors.test.ts`. The rest is a search of `src/`.

#### C22. A bytecode match is byte for byte

`runtimeEquals` in `src/proof/code.ts` compares two runtime codes as hex strings and ignores only letter case. No normalization step is used, because neither contract has immutable values: the factory's list and each payroll's settings live in storage, and USDC is a constant. So every payroll made by the factory has the same runtime code, and so does the testnet reference payroll. Proof check C1 compares mainnet with a local `forge build`. Proof check C2 compares mainnet with testnet. Proof check C3 asks Sourcify for an exact match of the published source. A match proves that mainnet runs the same code as the build and as testnet. It does not prove the code is safe.

- Upheld by: `runtimeEquals` and `sourcifyStatus` in `src/proof/code.ts`, and `prove` in `src/proof/prove.ts`.
- Tests: `src/proof/code.test.ts` covers the Sourcify answers. `runtimeEquals` has no unit test of its own. It is exercised by running `bun run prove` against the chain.
- Edge case: if a node returned empty code for both the mainnet and the testnet address, proof check C2 alone would read that as a match. Proof checks C1 and C3 would fail in that case, and the RESULT line would show it.

#### C23. Fixed addresses are compiled into the app

The chain id, the USDC address, the factory address and deploy block, the demo payroll, and the testnet reference addresses are constants in `src/deployments.ts`. The RPC addresses are written into `src/config.ts`, `src/proof/clients.ts` and the page components. Nothing in the URL or in browser storage changes them. The only value from the URL that reaches a contract call is the payroll address in `/p/:address`, and it must pass C14 first.

- Upheld by: `src/deployments.ts`, `src/config.ts`.
- Tests: none. Checked by reading the code.

#### C24. No secrets in the app

The app holds no private key, seed phrase or server API key. It connects an injected browser wallet and reads public RPC nodes that need no key. Nothing in `src/` reads an environment variable at run time except the `DEV` flag that loads a design page in development. The scripts in `scripts/` read RPC proxy settings from `.env`. They are not part of the app.

- Upheld by: `src/config.ts` and the absence of any key in `src/`.
- Tests: none. Checked by searching the source. The built bundle is not searched by any check in this repository.

### Build

#### C27. The reviewed code is the deployed code

`foundry.toml` pins Solidity 0.8.28 (`auto_detect_solc = false`), the Cancun EVM version and 200 optimizer runs. `forge build` reproduces the runtime code. Proof check C1 compares it with mainnet, and proof check C3 shows an exact match on Sourcify. The only privileged addresses are `employer` and `pendingEmployer`. The only external call target is USDC. The two source files have no `delegatecall`, no `selfdestruct`, no `tx.origin`, no `payable` and no `unchecked` block. They have one inline assembly block, a single `mload` in `_tryPayUsdc` that reads the first word of the token's return data.

The authors also checked that the tests fail when the code is wrong. They broke the contracts on purpose in 39 ways, one change each. A test failed for 38 of them. The 39th changes no behaviour, so no test can catch it. The scripts for these runs are not in this repository.

- Upheld by: `foundry.toml`, `Payroll.sol`, `PaydayFactory.sol`.
- Checked by: `bun run prove` (proof checks C1 to C3), and a search of the two source files.

### Rules added later

#### C34. One blocklist stance

Every outbound transfer goes to an address the rules fix: a payee for their own pay, a payee collecting their own held pay, the caller of a successful run for the tip, and the employer for the free balance. No function lets a caller name a different destination. Nobody can use Ooyaa to route money around Circle's blocklist. A blocklisted address simply cannot receive. A blocklisted employer's `withdraw` reverts. A blocklisted runner's `run` reverts at the tip and changes nothing, when the tip is above 0. A blocklisted payee's pay is held, and their `claim()` reverts until Circle lifts the block.

- Upheld by: `run`, `claim`, `withdraw`.
- Tests: `test_WithdrawPaysEmployerOnly`, `test_BlockedPayeeDoesNotBlockOthers` (a blocked payee cannot claim, and can once unblocked), `invariant_MoneyOnlyLeavesByRules`.
- Not covered: a blocklisted runner has no dedicated test.
- Limit: a blocklisted employer can still hand the role to another address, and Circle could freeze the payroll address itself, which would also freeze the owed wages inside it.

#### C35. A deferral means the token refused

A payee is deferred only if the USDC transfer failed within its gas budget. A runner cannot cause that. Before every payee transfer, `run` checks that `gasleft()` is at least 161,746 (`110,000 * 64 / 63 + 50,000`) and reverts `InsufficientGasForRun` if not. That guarantees the transfer receives its full 110,000 gas. The budget is more than twice the cost of a real USDC transfer to a fresh address: about 53,000 gas of execution when estimated as a stand-alone transaction, and 48,561 gas measured inside `run`'s own call. A failing transfer can burn at most 110,000 gas, and the check leaves room for the rest of the run. If the last steps (the tip and the final event) run short of gas, the whole run reverts. The runner did not send enough gas, and only the runner loses.

- Upheld by: `run`, `_tryPayUsdc`, `PAYEE_TRANSFER_GAS`, `PAYEE_GAS_RESERVE`.
- Tests: `test_LowGasRunRevertsNeverDefers`, `test_LowGasRunRevertsNeverDefers_Realistic`, `test_GasBurningPayeeIsDeferredOthersPaid_Capped`, `test_BudgetCoversTwiceRealTransfer` (a transfer that costs 106,500 gas must still be paid), `test_RealisticTransferCostsAbout50k`, `test_ShortReturnDataIsDeferred`, `test_NonBooleanWordIsDeferred`, and on Arc's real USDC `test_fork_TransferCostHasTwoXMargin` (a transfer to a fresh address succeeds with 55,000 gas forwarded and fails with 30,000).
- Not covered: the margin is measured against today's USDC. If USDC became more expensive to call, the budget would need to change, and the contracts cannot be changed.

#### C36. No zero-value transfer is ever made

`run` skips the tip when it is 0. Payee amounts are at least 1. `fund`, `withdraw` and `claim` reject 0. So liveness never depends on how the token treats a zero transfer.

- Upheld by: `run`, `fund` (`ZeroFundAmount`), `withdraw` (`WithdrawZero`), `claim` (`NothingToClaim`).
- Tests: `test_ZeroTipRunsWithoutZeroTransfer`, and on Arc's real USDC `test_fork_ZeroTipPayroll`.

#### C37. A pending handover can be cancelled

`cancelEmployerTransfer` clears the pending address and emits `EmployerTransferCancelled`. A mistyped pending address cannot act until it accepts, and the employer can cancel before that.

- Upheld by: `cancelEmployerTransfer`.
- Tests: `test_CancelEmployerTransfer`.

#### C38. Exact boundaries

When `block.timestamp` equals `periodStart(n)`, period n has started. It is due, payee changes revert `ScheduleLocked`, and `close` owes it. One second earlier, none of that is true. Two runs in the same block cannot both pay the same period.

- Upheld by: `_startedPeriodsRaw`, `periodStart`, `dueNow`.
- Tests: `test_ExactBoundary`, `test_ExactBoundaryPeriod0`, `invariant_StartedPeriodsMatchesClock`.

#### C39. The employer role cannot go to the payroll or to USDC

`transferEmployer` reverts `InvalidNewEmployer` for the payroll's own address and for the USDC address. Without this, nobody could ever withdraw the free balance or close the payroll. On chain it was never reachable, because neither address can call `acceptEmployer`. The guard is an extra layer.

- Upheld by: `transferEmployer`.
- Tests: `test_TransferEmployerRejectsSelfAndToken`, `invariant_NoForbiddenCallSucceeds`, `invariant_MoneyOnlyLeavesByRules` (it also asserts that the employer is never the payroll).

## 5. Attacks considered

### Double pay

`run()` takes no period. It pays `nextUnpaid` and adds one before any transfer, so a second call, in the same block or later, sees the next period or reverts `NothingDue`. `nonReentrant` stops a call from inside a transfer. A held claim is cleared before `claim` sends it, so a claim is paid once. See C4. Proof check C5 re-checks the live history: periods 0, 1, 2 and so on, none missing and none repeated. Proof check C8 simulates a second run and expects `NothingDue`.

### Out-of-order pay

There is no way to name a period. Missed periods are paid one per call, oldest first. See C4 and `test_RunsGoInOrder`.

### An early run

A period is due once `block.timestamp` is at or after `startTime + n * periodLength`, and not before (C38). `createPayroll` requires a first payday that is no earlier than the creation block, so a payroll cannot start with a backlog of missed periods. The shortest period is 60 seconds. A validator that moves a timestamp by a few seconds can make one payday run a few seconds early or late. It cannot make a period run twice, and it cannot reorder periods.

### A blocked payee

A payee that Circle has blocked cannot receive USDC. Their transfer fails, their share is held for them, and everyone else is paid. The employer cannot take the held share, because it counts as owed. See C5 and C34. The held share stays in the payroll until the payee can claim it.

### A griefing runner who sends little gas

If a runner sends too little gas, `run` reverts and everything is undone. Nothing is paid and nothing is deferred. The period stays due, and the griefer pays for the attempt. The gas check before each payee (C35) means a runner can never push a payee into deferral. A runner who loses a race to another runner gets `NothingDue` and loses only gas. The app simulates `run()` before it asks for a signature, and sets the gas limit to 130% of the estimate.

### An employer draining owed money

- `withdraw` reverts `WithdrawExceedsFree` for anything above balance minus owed, and sends only to the employer (C1, C2).
- The schedule is locked while a started period is unpaid, so an employer cannot cut a wage or remove a payee after a period has begun (C3).
- `close` caps future periods only. Periods that have started stay owed (C11).
- A handover keeps all of these rules for the new employer (C9).

The employer can still stop funding, withdraw everything above owed (including money meant for later periods), and lower an amount or remove a payee before the next period starts, with no notice.

### A fake payroll

A contract can copy every view of a payroll. The app shows a payroll only when the factory's `isPayroll` says the factory made it (C14). A payroll deployed directly, not through the factory, runs the same code but is not registered, and the app refuses it. The factory's `isPayroll` is set only inside `createPayroll`, so no one can add an address to it. A real payroll made by a dishonest employer is still a real payroll. A payslip from it proves a transfer, not a job.

### Reentrancy

`run`, `claim` and `withdraw` use OpenZeppelin's `ReentrancyGuard`. They update their records before they send USDC: `nextUnpaid` moves forward before any payee transfer, and a claim is cleared before it is paid. The only contract a payroll calls is USDC, which has no receiver hooks. A payee that is a contract is never called. No test tries a re-entrant call, because the tests use mock tokens that do not call back. The protection comes from the guard and from the order of the code.

### A malicious token

There is none to attack with. USDC is a constant in `Payroll.sol`. No function takes a token address. A payee cannot be the USDC address. The tests put mock tokens at the USDC address to model bad behaviour: a token that reverts for one address, burns gas, returns short data, or returns the word 2. Each is handled as a refusal and the payroll goes on. If Circle changed USDC so that every transfer failed, payrolls would stall. That is a trust assumption (section 2). `Funded` reports the amount that was asked for. With a token that took a fee, that would differ. USDC takes none.

### A wrong chain

The contracts are meant for Arc, where USDC lives at the fixed address. A transaction signed for Arc cannot be replayed on another chain. The app refuses to sign unless the wallet is on chain 5042 (C17). A testnet payroll address opened on the mainnet app fails the factory check (C14). `bun run prove` checks the chain id of each node before it reads anything, and exits with code 2 if a node reports the wrong chain.

## 6. Known limits

- No audit. Ooyaa has not been audited by an outside firm, and neither Arc nor Circle has audited it. The contracts and the app were written with Arc Studio, an AI coding tool, and then tested by their authors. Static analysis with Slither was run on an earlier version of the contracts only. Treat the code as unaudited.
- Use small amounts. The contracts cannot be changed, and Circle can freeze USDC. Put in only what you are willing to lose while you learn how it behaves.
- Salaries and addresses are public. Every payee address and amount is stored on Arc and emitted in events, for as long as the chain exists. Anyone can list any address as a payee, and the payee cannot refuse. The create form does not repeat this warning. This page and the Limits page of the docs do.
- Wages are protected only once a period has started. The employer can stop funding at any time, and a started period that is unfunded cannot be run until someone funds it. An employer can change or remove a payee any time before the next period starts, as long as every started period is paid. The employer can also close.
- Held pay can stay locked. If a payee is blocklisted for good, their held pay stays in the payroll and counts as owed, so the employer cannot take it either.
- The 100-payee cap. A payroll holds at most 100 payees, so a run always fits in one transaction. A run for 100 payees took about 4.5 million gas on real USDC state. The worst case, where every payee burns its whole 110,000 budget, took about 14 million. Both are under 16,777,216, which the tests assume is Arc's per-transaction cap. If a payroll needs more people, it needs a second payroll.
- Close semantics. `close` is permanent. Every period that had started when it was called is still owed in full, including the one in progress and any unpaid backlog. Nothing that starts later is owed. Closing does not forgive an unfunded period. After close the employer can still withdraw the free balance, and anyone can still fund the payroll to pay what it owes. Closing before the first period starts owes nothing, and the whole balance is free.
- The app is narrow. It can create and fund a payroll and run a payday. There is no screen for `claim`, `withdraw`, `close` or payee changes. A payee with held pay collects it by calling `claim()` directly. The Run button is disabled with "Out of funds" when the balance is below everything owed, even though the contract would still run the oldest period if the balance covers that one period. Anyone can call `run()` directly in that case.
- The app and the proof tool trust the public RPC nodes they read. A node that lied could fool one reader. The page and the command use different nodes where they can, and `--rpc` lets you point the command at your own.
- OUTSIDE wallets (C20) are wallets that are neither employer nor payee. They are not proven to be unrelated to the authors.
- The tests have gaps, listed under "Not covered" in section 4. The main ones: no re-entrancy test, no unit test of `runtimeEquals`, no test that fails one log page, no test of the page-level guards, and the mutation scripts are not in this repository.

## 7. How to verify

You need [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

Build and run the contract tests:

```bash
forge build
forge test --no-match-contract PayrollFork
forge test --no-match-contract PayrollFork --isolate
```

This runs 89 tests: 69 unit and fuzz tests in `Payroll.t.sol`, 6 in `PaydayFactory.t.sol`, and 14 in `PayrollInvariant.t.sol` (13 invariants and one coverage test). Foundry 1.8.6 groups the invariant campaign and reports 77. The `--isolate` run makes every call start cold, as it does on chain, which matters for the gas tests. The invariant suite was also run at five fixed seeds, 0 to 4, in both modes. You can pass `--fuzz-seed <n>` to explore other sequences.

Run the fork tests against Arc's real USDC state, with Arc's Foundry build and a node URL for the network you want. Standard Foundry cannot simulate USDC as Arc's native token, so these 6 tests fail there by design. Install Arc's Foundry build from [github.com/circlefin/arc-foundry](https://github.com/circlefin/arc-foundry), as its README describes; it installs as `arc-forge`.

```bash
arc-forge test --match-path contracts/test/PayrollFork.t.sol --fork-url https://rpc.testnet.arc.io
arc-forge test --match-path contracts/test/PayrollFork.t.sol --fork-url https://rpc.mainnet.arc.io
```

There are 6 fork tests. They cover a payee that is really blocklisted on the token, a zero-tip run, the gas of 1 and of 100 payees, native USDC forced in by a self-destructing contract, and the gas margin of a USDC transfer. The blocklist test impersonates the token's blacklister on the fork.

Check the live deployment on Arc:

```bash
bun install
bun run prove --payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A
```

Without `--payroll`, the command checks every payroll the mainnet factory has made. It reads Arc mainnet and testnet, prints each check, and ends with a RESULT line. The eight proof checks are a different list from the invariants C1 to C39. Here is how they relate:

| Proof check | What it re-checks on the chain | Related invariants |
|---|---|---|
| C1 local build | Mainnet runtime code equals `forge build` output | C27 |
| C2 same code on mainnet and testnet | Mainnet and testnet bytecode match exactly | C22 |
| C3 verified source | Sourcify reports an exact match | C22, C27 |
| C4 made by the factory | `isPayroll` is true and `PayrollCreated` was emitted | C14 |
| C5 paid exactly once, in order | `PaydayRun` events run 0, 1, 2 with none missing or repeated | C4 |
| C6 every payslip is a real USDC transfer | Each `PayslipIssued` has a matching transfer | C12 |
| C7 every cent accounted for | Every transfer in or out is explained by an event | C1, C8, C12 |
| C8 a second run is refused | A simulated `run()` right after a payday reverts `NothingDue` | C4 |

Proof check C1 is skipped, not passed, if you have not run `forge build`. Proof check C3 is skipped if Sourcify cannot be reached. A skip is not a pass.

To read the contracts themselves, open `contracts/Payroll.sol` and `contracts/PaydayFactory.sol`. They are short, and the NatSpec above each function lists what it reverts with and what it emits.
