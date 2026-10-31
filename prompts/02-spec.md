# Ooyaa spec for Studio turn 02: the factory and the full payroll rules

Ooyaa is a USDC payroll on Arc. Each employer gets their own Payroll contract from an ownerless factory. A payroll pays every payee once per period, strictly in order. Anyone may run a payday and earns a small tip for doing it. Wages for a period that has started can never be taken back by the employer.

This replaces the turn 01 contract. Keep Solidity 0.8.28 and the scaffold's foundry.toml (evm_version cancun, optimizer on, 200 runs). Use OpenZeppelin 5.6.1 from the scaffold.

## Global rules for both contracts
- USDC is the ERC-20 interface at 0x3600000000000000000000000000000000000000, held as a constant. Arc mainnet and Arc Testnet use the same address.
- Every USDC movement goes through OpenZeppelin SafeERC20. No payable functions, no receive or fallback, never send native value.
- No immutables and no constructor arguments in PaydayFactory. No immutables in Payroll; every Payroll setting lives in storage. Reason: every deployment of each contract must have identical runtime bytecode on both networks.
- No owner or admin anywhere, no pause, no upgradeability or proxy, no fees, no selfdestruct, no delegatecall, no inline assembly, no tx.origin.
- Custom errors for every revert. NatSpec on every public and external function: what it does, what reverts, what it emits.
- An event on every state change listed below.

## Contract 1: PaydayFactory

```
function createPayroll(
    address[] calldata payees,
    uint256[] calldata amounts,
    uint64 startTime,
    uint64 periodLength,
    uint256 tipPerRun
) external returns (address payroll);
```
- Deploys `new Payroll(msg.sender, payees, amounts, startTime, periodLength, tipPerRun)`. The caller is always the employer.
- Sets `isPayroll[payroll] = true`. This is the only place it is ever set.
- Appends the address to a global list and to a per-employer list for msg.sender.
- Emits `PayrollCreated(address indexed employer, address indexed payroll, uint256 index)`.

Views:
- `isPayroll(address) returns (bool)`: a public mapping.
- `payrollCount() returns (uint256)`, `payrollAt(uint256 index) returns (address)`.
- `allPayrolls(uint256 offset, uint256 limit) returns (address[] memory)`: returns at most 100 entries whatever limit asks for, and an empty array past the end.
- `createdBy(address employer) returns (uint256 count)` and `payrollsCreatedBy(address employer, uint256 offset, uint256 limit) returns (address[] memory)`, at most 100.

The per-employer list records who created a payroll. It is history, not authority: after an employer handover, the live answer is always `Payroll.employer()`.

## Contract 2: Payroll

### Constructor
`constructor(address employer_, address[] memory payees, uint256[] memory amounts, uint64 startTime_, uint64 periodLength_, uint256 tipPerRun_)`

It reverts with a named error unless all of these hold:
- employer_ is non-zero;
- the arrays have equal length;
- there are 1 to 100 payees;
- every payee is non-zero, unique, not address(this), and not the USDC address;
- every amount is above 0 and at most 1_000_000e6;
- startTime_ is at least block.timestamp and at most block.timestamp + 365 days;
- periodLength_ is at least 60 seconds and at most 366 days;
- tipPerRun_ is at most 10e6.

Uniqueness uses an index mapping, never a loop over the list.

### Storage
- employer, pendingEmployer
- startTime, periodLength, tipPerRun
- `address[] _payees`, kept dense with no gaps
- `mapping(address => uint256) indexPlusOne`
- `mapping(address => uint256) amountOf`
- periodTotal, the sum of all current amounts
- nextUnpaid, starting at 0
- `mapping(address => uint256) claimable`, and totalDeferred
- closed, and closedAt (the number of started periods at the moment of close)

### Periods and owed (one definition, used everywhere)
- `startedPeriods()` is 0 before startTime, otherwise `(block.timestamp - startTime) / periodLength + 1`. After close it is capped at closedAt. One internal function computes it, and every check and view uses that function.
- `_owed()` = `(startedPeriods() - nextUnpaid) * (periodTotal + tipPerRun) + totalDeferred`, or just totalDeferred when nothing started is unpaid. One internal function. withdraw, freeBalance, run, runway and every view that depends on owed use it.
- Why the schedule is safe to read live: payee changes are allowed only when no started period is unpaid (see below), so every unpaid started period always shares the current schedule.

### Functions
- `fund(uint256 amount)`.
  - Who: anyone.
  - Reverts: on 0, and with Closed after close.
  - Effect: pulls amount from msg.sender only, with safeTransferFrom.
  - Emits: `Funded(address indexed from, uint256 amount)`.
- `run()`, nonReentrant. In this order:
  1. Revert NothingDue if `nextUnpaid >= startedPeriods()`.
  2. Revert Underfunded if the USDC balance is below `totalDeferred + periodTotal + tipPerRun`.
  3. Set `period = nextUnpaid`, then `nextUnpaid += 1`, before any transfer.
  4. For each payee, try the transfer with `SafeERC20.trySafeTransfer`.
     - On success, emit `PayslipIssued(address indexed payee, uint256 indexed period, uint256 amount)`.
     - On failure (for example a payee Circle has blocklisted), add the amount to `claimable[payee]` and to totalDeferred, and emit `PayoutDeferred(address indexed payee, uint256 indexed period, uint256 amount)`. Never emit PayslipIssued for a deferred amount.
  5. Pay tipPerRun to msg.sender with a normal safeTransfer.
  6. Emit `PaydayRun(uint256 indexed period, address indexed runner, uint256 paid, uint256 deferred, uint256 tip)`, where paid + deferred == periodTotal.
- `claim()`, nonReentrant.
  - Who: a payee, for their own deferred amount.
  - Reverts: NothingToClaim when the amount is 0.
  - Effect: sends `claimable[msg.sender]` to msg.sender only, and never to another address, so a blocklisted address cannot redirect its money around Circle's blocklist. Clears the claim and lowers totalDeferred before the transfer.
  - Emits: `Claimed(address indexed payee, uint256 amount)`.
- `withdraw(uint256 amount, address to)`, nonReentrant.
  - Who: employer only.
  - Reverts: when amount is 0, when to is address(0) or address(this), and when amount > freeBalance().
  - Emits: `Withdrawn(address indexed to, uint256 amount)`.
- `addPayee(address payee, uint256 amount)`, `updatePayee(address payee, uint256 amount)`, `removePayee(address payee)`.
  - Who: employer only.
  - Revert: Closed after close, and ScheduleLocked while any started period is unpaid (`nextUnpaid < startedPeriods()`).
  - Checks: add uses the constructor's payee and amount checks plus the 100 limit. update requires an existing payee and a valid amount.
  - remove: requires an existing payee, reverts LastPayee when it would leave zero payees (use close instead), and uses swap-and-pop so the list stays dense.
  - Each keeps periodTotal exact.
  - Emits: `PayeeAdded(address indexed payee, uint256 amount, uint256 fromPeriod)`, `PayeeUpdated(address indexed payee, uint256 amount, uint256 fromPeriod)` or `PayeeRemoved(address indexed payee, uint256 fromPeriod)`, where fromPeriod is startedPeriods() at the time of the change, the first period the change applies to.
- `close()`.
  - Who: employer only.
  - Reverts: AlreadyClosed when already closed.
  - Effect: sets closed, and sets closedAt to the uncapped started-period count at that moment.
  - Emits: `PayrollClosed(uint256 closedAt)`.
  - After close: periods below closedAt still run, no later period is ever owed, payee changes and fund revert Closed, withdraw still releases only freeBalance, and claim still works.
- `transferEmployer(address newEmployer)`.
  - Who: employer only.
  - Reverts: when newEmployer is zero or is the current employer.
  - Effect: sets pendingEmployer. Calling it again replaces the pending address.
  - Emits: `EmployerTransferStarted(address indexed current, address indexed pending)`.
- `acceptEmployer()`.
  - Who: only the pendingEmployer.
  - Effect: makes them employer and clears pendingEmployer. From that transaction on, the old employer has no powers.
  - Emits: `EmployerTransferred(address indexed previous, address indexed current)`.

### Views (none may ever revert, at any time, in any state)
- `owed()`.
- `freeBalance()`: balance minus owed when the balance exceeds owed, else 0.
- `startedPeriods()`, `dueNow()`.
- `periodStart(uint256 n)`: saturating at type(uint256).max rather than wrapping.
- `nextPayday()`: the start of period nextUnpaid.
- `runway()`: `(balance - totalDeferred) / (periodTotal + tipPerRun)`, or 0 when the balance is not above totalDeferred.
- `getPayees() returns (address[] memory, uint256[] memory)`, `payeeCount()`, `isPayee(address)`.
- `getState() returns (PayrollState memory)`. PayrollState is a struct with: employer, pendingEmployer, startTime, periodLength, tipPerRun, periodTotal, nextUnpaid, startedPeriods, owed, freeBalance, balance, runway, totalDeferred, payeeCount, closed, closedAt. The app reads this one call.

## Rules the code must uphold (our threat model, section C)
- C1: USDC leaves a Payroll only to a payee for a started period, as a payee's own claim, as the tip to the caller of a successful run, or to an address the employer names out of freeBalance.
- C2: owed is defined once. No employer call can push the balance below owed. A started, funded period can always be run. Deferred claims are inside owed.
- C3: who a period pays, and how much, never changes after the period starts.
- C4: each period is paid at most once, strictly in order.
- C5: one payee whose transfer fails never blocks the others. The amount stays owed to that payee, claimable only by them, and is never released to the employer or paid to anyone else.
- C6: there is no loop over periods. Payee loops cover at most 100 entries. Factory list views return at most 100 entries.
- C7: every input is checked with a named error.
- C8: correctness never depends on the balance equalling the books. USDC sent directly can only raise freeBalance.
- C9: authority is the stored employer, compared with msg.sender. Handover is two-step. fund pulls only from msg.sender.
- C10 and C11: no sequence of employer calls can trap owed USDC or free USDC. After close, earlier periods still run and nothing later is owed.
- C12: events are receipts. PayslipIssued only for a transfer that happened. PaydayRun's paid, deferred and tip match the actual movements.
- C13: views never revert, and never overstate.
- C14: isPayroll is set only inside createPayroll, for the address just created.
- C15: the factory's per-employer list is history; employer() is authority.
