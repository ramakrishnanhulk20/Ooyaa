# Ooyaa spec for Studio turn 05: fixes from the backend gate review

This changes the current contracts/Payroll.sol only. PaydayFactory.sol has no source changes, but its bytecode changes because it embeds Payroll. Everything in 02-spec.md, plus the turn 03 change (fund allowed after close), still holds unless a line below replaces it.

## Contract changes in Payroll.sol

### 1. withdraw pays the employer only (rule C34)
- New signature: `withdraw(uint256 amount)`. It replaces `withdraw(uint256 amount, address to)`.
- Who: employer only.
- Reverts: NotEmployer, WithdrawZero on 0, WithdrawExceedsFree when amount > freeBalance().
- Effect: transfers amount to msg.sender, which is the employer.
- Emits: `Withdrawn(address indexed to, uint256 amount)`, with to = the employer.
- Remove the ZeroAddress error if nothing else uses it.
- Why: no function may let a caller name a destination other than its own address, so nobody can route money around Circle's blocklist.

### 2. cancelEmployerTransfer (rule C37)
- New `cancelEmployerTransfer()`.
- Who: employer only.
- Reverts: NoPendingTransfer when pendingEmployer is address(0).
- Effect: clears pendingEmployer.
- Emits: `EmployerTransferCancelled(address indexed current, address indexed cancelled)`.

### 3. A zero tip is never transferred (rule C36)
In run(), transfer the tip only when tipPerRun != 0. PaydayRun is still emitted, with tip 0.

### 4. Per-payee transfers with a fixed gas budget (rule C35)
- Add `uint256 private constant PAYEE_TRANSFER_GAS = 150_000;` and `uint256 private constant PAYEE_GAS_RESERVE = 50_000;`.
- In run(), for each payee, before the transfer: `if (gasleft() < (PAYEE_TRANSFER_GAS * 64) / 63 + PAYEE_GAS_RESERVE) revert InsufficientGasForRun();`
- Replace SafeERC20.trySafeTransfer for the payee transfer with one internal function, `_tryPayUsdc(address to, uint256 amount) returns (bool)`:
  - It calls `address(USDC).call{gas: PAYEE_TRANSFER_GAS}(abi.encodeCall(IERC20.transfer, (to, amount)))`.
  - It returns true only when the call succeeded and either returned no data while USDC has code, or returned data that decodes to true. That is the same acceptance rule SafeERC20 uses.
- Everything else about deferral stays as specified: on false, credit claimable and totalDeferred, and emit PayoutDeferred.
- Why: a transfer that burns all the gas it is given can no longer starve the payees after it, and a runner cannot force a deferral by sending too little gas, because the run reverts instead.
- The tip transfer, claim and withdraw keep using SafeERC20's normal safeTransfer.

### 5. runway, nextPayday and periodStart (rule C13)
- `runway()`: return 0 when closed. Otherwise return `freeBalance() / (periodTotal + tipPerRun)`, the number of future periods the free balance covers beyond what is already owed.
- `nextPayday()`: when closed and nextUnpaid >= closedAt, return type(uint256).max, meaning no payday is coming. Otherwise return periodStart(nextUnpaid).
- `periodStart(uint256 n)`: `if (n > (type(uint256).max - uint256(startTime)) / uint256(periodLength)) return type(uint256).max; return uint256(startTime) + n * uint256(periodLength);`. periodLength is never 0 (minimum 60), so this never reverts for any n.
- getState() uses these same functions.

### 6. NatSpec
- Correct the constructor NatSpec: it validates inside the loop and writes storage as it goes, and a revert rolls everything back.
- Correct periodStart's NatSpec: it saturates for every n.
- Document the gas budget on run(): each payee transfer gets PAYEE_TRANSFER_GAS, and run reverts InsufficientGasForRun when not enough gas is left to give the next payee its full budget.

## Rules the code must uphold after this turn
C1 to C15 as before, with C2 and C13 as clarified, plus:
- C34: every outbound transfer goes to an address the rules fix (the payee, the claiming payee itself, the runner for the tip, the employer itself). No caller can name another destination.
- C35: each payee is paid, or deferred only because the token refused, or the whole run reverts. A runner's gas choice can never cause a deferral.
- C36: no zero-value transfer is ever made.
- C37: the employer can cancel a pending handover.
- C38: at block.timestamp == periodStart(n), period n has started (due, schedule locked, owed after close); one second earlier it has not. Two runs in one block can never both pay the same period.

## Tests to add or change

Unit tests in contracts/test/Payroll.t.sol:
1. test_RunwayCountsOnlyFuturePeriods: fund exactly 3 periods, then warp to the third period's start without running. owed() equals the balance, freeBalance() is 0, and runway() is 0. Then fund 2 more periods: runway() is 2.
2. test_RunwayZeroAfterClose: runway() is 0 after close, whatever the balance.
3. test_NextPaydayAfterClose: after close with owed periods left, nextPayday() equals periodStart(nextUnpaid). Once they are all paid, it returns type(uint256).max.
4. test_PeriodStartNeverReverts: periodStart(type(uint256).max / 120) and periodStart(type(uint256).max) both return type(uint256).max. Also add a fuzz test over n that never reverts and is monotonic. Add those inputs to the views-never-revert helper.
5. test_ZeroTipRunsWithoutZeroTransfer: a payroll with tipPerRun 0 runs. The mock records every transfer, and none has amount 0.
6. test_WithdrawPaysEmployerOnly: withdraw sends to the employer, and only the employer can call it.
7. test_CancelEmployerTransfer: cancel clears pendingEmployer and emits the event. The old pending address can no longer accept. Cancelling with nothing pending reverts NoPendingTransfer. Only the employer can cancel.
8. test_GasBurningPayeeIsDeferredOthersPaid: add a mock mode where a transfer to the blocked address consumes all the gas it is given (for example an infinite loop) instead of reverting. With 10 payees, where the blocked one is third, run succeeds: 9 are paid with PayslipIssued and the blocked one gets PayoutDeferred.
9. test_LowGasRunRevertsNeverDefers: step the gas limit of a run (call run() through a helper with {gas: g}) across a range from too little to enough. For every g, either every payee is paid, or the call reverts. No PayoutDeferred is ever emitted, and nextUnpaid only moves on success.
10. test_ExactBoundary:
    - At block.timestamp == periodStart(1): dueNow() is true after period 0 is paid, payee changes revert ScheduleLocked, and close() then owes period 1.
    - At periodStart(1) - 1, the opposite holds.
    - Two runs in the same block: the second reverts NothingDue.
11. Fix test_DeferredClaimStaysOwedAfterClose's funding so the employer pays (its prank was used up by mint). Fix test_FundAfterCloseCoversOwed so it starts with a balance that covers exactly one of the three owed periods, as originally specified.
12. Update every existing test for the withdraw signature change.

Invariant suite in contracts/test/PayrollInvariant.t.sol:
13. Count forbidden calls with try/catch. If a forbidden call succeeds, increment forbiddenSucceeded. Add invariant_NoForbiddenCallSucceeds: forbiddenSucceeded == 0. Remove the vm.expectRevert pattern.
14. Add blockPayee(seed) and unblockPayee(seed) handlers that flip the mock blocklist, so runs really defer and claims really pay.
15. Where a handler's preconditions guarantee success (for example a due run with balance >= totalDeferred + periodTotal + tipPerRun, or a payee claiming a positive claimable while unblocked), the call must succeed. A failure increments unexpectedRevert, and invariant_NoUnexpectedRevert requires unexpectedRevert == 0.
16. Ghost shortfall: before and after every employer handler call, compute shortfall = owed() > balance ? owed() - balance : 0. invariant_EmployerNeverGrowsShortfall requires that no employer call ever ended with a larger shortfall than it started with.
17. Split the handover into separate startTransfer and acceptTransfer handlers, so pendingEmployer persists between calls.
18. Count the successful executions of each handler body (including removePayee, addPayee and claim) and print them at the end, so we can see every path really ran.

Fork tests against a fork of Arc Testnet with the real USDC at 0x3600000000000000000000000000000000000000. Use whatever fork harness your sandbox has (arc-anvil, an Arc Foundry fork test, or your integration harness), and label every result "fork".
19. A payroll with tipPerRun 0: create, fund, warp, run. It succeeds.
20. Measure the gas of one payee transfer inside run() to a fresh address with real USDC, and report it. It must be below PAYEE_TRANSFER_GAS.
21. Measure a 100-payee run with real USDC, every payee fresh, and report the gas.
22. SELFDESTRUCT credit: a helper contract holding native USDC selfdestructs to the payroll. The balance rises, freeBalance rises by the same amount, and owed, every view and run still behave correctly.
23. A blocklisted payee on the real USDC, if your fork lets you put an address on the issuer's blocklist (for example by impersonating the blocklist admin): run with 10 payees, one of them blocklisted. The others are paid, the blocklisted one is deferred, and you report the gas the failed transfer consumed. If the fork cannot blocklist an address, say so plainly and do not fake it.

## Scaffold
If your deploy tool does not need contracts/script/Create2Factory.sol and contracts/script/DeployCreate2.s.sol, delete them. If it does need them, keep them and say so.
