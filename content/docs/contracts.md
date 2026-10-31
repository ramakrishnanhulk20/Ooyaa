---
title: Contracts
group: developers
---

Ooyaa has two contracts: `PaydayFactory` and `Payroll`. Both are in `contracts/`, written in Solidity 0.8.28 for the Cancun EVM with the optimizer at 200 runs, and licensed MIT. They use OpenZeppelin 5.6.1 for `SafeERC20` and `ReentrancyGuard`. There are no proxies, no owner and no upgrade path.

This page follows the NatSpec in the source files. If this page and the source ever differ, the source wins. After `forge build`, the ABI for each contract is in `contracts/out/<File>.sol/<Contract>.json`.

## Units and limits

USDC is the only token. It is a compile-time constant, `0x3600000000000000000000000000000000000000`, used through its ERC-20 interface with 6 decimals. All amounts below are in those units, so 1 USDC is `1000000` and 0.01 USDC is `10000`.

| Rule | Limit |
|---|---|
| Payees per payroll | 1 to 100 |
| Amount per payee per period | 1 unit to 1,000,000 USDC (`1_000_000e6`) |
| First payday (`startTime`) | From the current block timestamp up to 365 days later |
| Period length | 60 seconds to 366 days |
| Tip per run | 0 to 10 USDC (`10e6`) |
| Gas forwarded to each payee transfer | 110,000 |
| Gas that must remain before each payee transfer | 161,746, which is `110000 * 64 / 63 + 50000` |

Payee addresses must be non-zero, unique, not the payroll itself and not the USDC contract.

## PaydayFactory

An ownerless registry. It deploys one `Payroll` per call and keeps a public, append-only list of them. It has no admin, no fees and no power over a payroll once created. It takes no constructor arguments.

| Function | Who may call | What it does | Reverts with |
|---|---|---|---|
| `createPayroll(address[] payees, uint256[] amounts, uint64 startTime, uint64 periodLength, uint256 tipPerRun) returns (address payroll)` | Anyone. The caller becomes the employer. | Deploys a `Payroll`, marks it in `isPayroll`, appends it to the global list and to the caller's list, and emits `PayrollCreated`. The payroll starts with no USDC. | Any of the `Payroll` constructor errors listed under Payroll: `LengthMismatch`, `EmptyPayeeList`, `TooManyPayees`, `ZeroPayee`, `DuplicatePayee`, `PayeeIsThis`, `PayeeIsUsdc`, `ZeroAmount`, `AmountTooLarge`, `StartTimeTooEarly`, `StartTimeTooLate`, `PeriodLengthTooShort`, `PeriodLengthTooLong`, `TipTooLarge` |
| `isPayroll(address) view returns (bool)` | Anyone | True if and only if the factory deployed that address. Set once inside `createPayroll`, never cleared. | Never |
| `payrollCount() view returns (uint256)` | Anyone | Number of payrolls ever created | Never |
| `payrollAt(uint256 index) view returns (address)` | Anyone | The payroll at a global position, in creation order | `OffsetOutOfRange` when `index >= payrollCount()` |
| `allPayrolls(uint256 offset, uint256 limit) view returns (address[])` | Anyone | A page of payrolls. Returns an empty array past the end. Never more than 100 entries, whatever `limit` says. | Never |
| `createdBy(address employer) view returns (uint256)` | Anyone | How many payrolls that address created. This is history: it does not change when a payroll's employer role is handed over. | Never |
| `payrollsCreatedBy(address employer, uint256 offset, uint256 limit) view returns (address[])` | Anyone | A page of the payrolls that address created, in creation order, capped at 100 entries. Use `Payroll.employer()` for the current authority. | Never |

Event:

| Event | Fields | Emitted when |
|---|---|---|
| `PayrollCreated` | `address indexed employer`, `address indexed payroll`, `uint256 index` | `createPayroll` succeeds. `index` is the payroll's position in the global list. |

Error:

| Error | Meaning |
|---|---|
| `OffsetOutOfRange()` | `payrollAt` was asked for a position that does not exist. |

## Payroll

One instance per employer. The constructor is called only by the factory, with the factory's caller as `employer_`.

```solidity
constructor(
    address employer_,
    address[] memory payees,
    uint256[] memory amounts,
    uint64 startTime_,
    uint64 periodLength_,
    uint256 tipPerRun_
)
```

It validates every input and reverts with a named error if any rule is broken, which undoes everything. The constructor errors are `ZeroEmployer`, `LengthMismatch`, `EmptyPayeeList`, `TooManyPayees`, `ZeroPayee`, `DuplicatePayee`, `PayeeIsThis`, `PayeeIsUsdc`, `ZeroAmount`, `AmountTooLarge`, `StartTimeTooEarly`, `StartTimeTooLate`, `PeriodLengthTooShort`, `PeriodLengthTooLong` and `TipTooLarge`.

### Functions that move money

#### `run()`

- Who: anyone.
- Protection: `nonReentrant`.
- Pays the period at `nextUnpaid`, then adds one to `nextUnpaid` before any transfer.
- Reverts `NothingDue` when `nextUnpaid >= startedPeriods()`.
- Reverts `Underfunded` when the USDC balance is below `totalDeferred + periodTotal + tipPerRun`.
- For each payee in stored order it first checks that at least 161,746 gas is left and reverts `InsufficientGasForRun` if not. Then it calls `USDC.transfer(payee, amount)` with at most 110,000 gas.
- A transfer counts as paid when the call succeeds and returns either no data (the token has code) or at least 32 bytes whose first word is 1. A revert, a false, malformed return data or running out of the 110,000 gas counts as a refusal.
- On success it emits `PayslipIssued(payee, period, amount)`. On a refusal it adds the amount to `claimable[payee]` and `totalDeferred` and emits `PayoutDeferred(payee, period, amount)`. The run goes on.
- If `tipPerRun` is above zero it sends the tip to the caller with `SafeERC20.safeTransfer`. A failure here reverts the whole run.
- Emits `PaydayRun(period, runner, paid, deferred, tip)`. `paid + deferred` always equals `periodTotal`.

#### `fund(uint256 amount)`

- Who: anyone. The USDC comes from the caller, who must have approved the payroll for at least `amount`.
- Pulls the USDC with `transferFrom` and emits `Funded(from, amount)`.
- Allowed at any time, including after `close()`, so a closed payroll can be topped up to pay what it owes.
- Reverts `ZeroFundAmount` when `amount` is 0. If USDC refuses the pull, its own revert passes through, or `SafeERC20FailedOperation(token)` if it returns false.

#### `claim()`

- Who: any address with a non-zero `claimable` balance.
- Protection: `nonReentrant`.
- Clears the caller's claim and lowers `totalDeferred` before sending, then sends the amount to the caller and to nobody else. Emits `Claimed(payee, amount)`.
- Reverts `NothingToClaim` when the caller has nothing held. If USDC refuses the transfer, for example because the caller is blocklisted, the whole call reverts and the claim stays.

#### `withdraw(uint256 amount)`

- Who: the employer only.
- Protection: `nonReentrant`.
- Sends `amount` to the employer, which is the caller. Cannot reduce the balance below `owed()`. Emits `Withdrawn(to, amount)`.
- Reverts `NotEmployer`, `WithdrawZero` when `amount` is 0, or `WithdrawExceedsFree` when `amount > freeBalance()`.

### Functions that change the schedule

All three are employer only. Each reverts `NotEmployer` for anyone else, `Closed` once the payroll is closed, and `ScheduleLocked` while any started period is unpaid (`nextUnpaid < startedPeriods()`). The change applies from the next period that has not started. The event's `fromPeriod` is `startedPeriods()` at the time of the call.

#### `addPayee(address payee, uint256 amount)`

Adds a payee at the end of the stored order and adds `amount` to `periodTotal`. Also reverts `TooManyPayees` at 100 payees, `ZeroPayee`, `DuplicatePayee`, `PayeeIsThis`, `PayeeIsUsdc`, `ZeroAmount` and `AmountTooLarge`. Emits `PayeeAdded`.

#### `updatePayee(address payee, uint256 amount)`

Changes an existing payee's per-period amount and updates `periodTotal`. Also reverts `PayeeNotFound`, `ZeroAmount` and `AmountTooLarge`. Emits `PayeeUpdated`.

#### `removePayee(address payee)`

Removes a payee by swapping the last payee into their place, so the stored order can change. Subtracts their amount from `periodTotal`. A held claim the payee already has is not touched and can still be collected. Also reverts `PayeeNotFound` and `LastPayee` when it would leave the list empty. Emits `PayeeRemoved`.

### Functions that stop or hand over

#### `close()`

- Who: the employer only. Permanent.
- Sets `closed` and records `closedAt`, the number of periods that had started at that moment. From then on `startedPeriods()` never exceeds `closedAt`.
- Periods below `closedAt` still run, `fund` still works, payee changes revert `Closed`.
- Reverts `NotEmployer` or `AlreadyClosed`. Emits `PayrollClosed(closedAt)`.

#### `transferEmployer(address newEmployer)`

- Who: the employer only. Starts a two-step handover. Calling again replaces the pending address.
- Reverts `NotEmployer`, `ZeroNewEmployer`, `SameEmployer`, or `InvalidNewEmployer` when the address is the payroll itself or the USDC contract. Emits `EmployerTransferStarted`.

#### `cancelEmployerTransfer()`

- Who: the employer only. Clears the pending address, which can then no longer accept.
- Reverts `NotEmployer` or `NoPendingTransfer`. Emits `EmployerTransferCancelled`.

#### `acceptEmployer()`

- Who: the pending employer only. Makes the caller the employer and clears the pending address. The old employer loses all authority in the same transaction.
- Reverts `NotPendingEmployer`. Emits `EmployerTransferred(previous, current)`.

### Views

None of these reverts under normal conditions.

| Function | Returns | Meaning |
|---|---|---|
| `startedPeriods()` | `uint256` | Periods that have started. 0 before `startTime`, otherwise `(now - startTime) / periodLength + 1`. Capped at `closedAt` after close. |
| `owed()` | `uint256` | Total USDC the payroll must pay out: `(startedPeriods - nextUnpaid) * (periodTotal + tipPerRun) + totalDeferred`. |
| `freeBalance()` | `uint256` | USDC the employer may withdraw. The balance minus `owed()`, or 0 when the balance is not above it. |
| `dueNow()` | `bool` | True when at least one started period is unpaid. |
| `periodStart(uint256 n)` | `uint256` | Start time of period `n`. Returns `type(uint256).max` if the sum would overflow, so it never reverts. |
| `nextPayday()` | `uint256` | Start time of period `nextUnpaid`. Returns `type(uint256).max` when the payroll is closed and every owed period is paid. |
| `runway()` | `uint256` | `freeBalance() / (periodTotal + tipPerRun)`, counting only future periods beyond what is already owed. 0 when closed or when there is no free balance. |
| `payeeCount()` | `uint256` | Current number of payees. |
| `isPayee(address addr)` | `bool` | Whether the address is a current payee. |
| `getPayees()` | `address[] addrs, uint256[] amts` | Current payees and their per-period amounts, in stored order. |
| `getState()` | `PayrollState` | A snapshot of everything below in one call. |

`PayrollState` has these fields, in order: `employer`, `pendingEmployer`, `startTime`, `periodLength`, `tipPerRun`, `periodTotal`, `nextUnpaid`, `startedPeriods`, `owed`, `freeBalance`, `balance`, `runway`, `totalDeferred`, `payeeCount`, `closed`, `closedAt`.

### Public state

| Getter | Type | Meaning |
|---|---|---|
| `employer()` | `address` | Holder of employer authority |
| `pendingEmployer()` | `address` | Nominated new employer, or the zero address |
| `startTime()` | `uint64` | Timestamp at which period 0 starts |
| `periodLength()` | `uint64` | Seconds in each period |
| `tipPerRun()` | `uint256` | USDC paid to the caller of each `run()` |
| `periodTotal()` | `uint256` | Sum of all current payee amounts |
| `nextUnpaid()` | `uint256` | Index of the next period to pay |
| `amountOf(address)` | `uint256` | Per-period amount of a payee |
| `indexPlusOne(address)` | `uint256` | 1-based position of a payee, 0 if not a payee |
| `claimable(address)` | `uint256` | Held pay that address can claim |
| `totalDeferred()` | `uint256` | Sum of all held pay |
| `closed()` | `bool` | True after `close()` |
| `closedAt()` | `uint256` | Periods started at the moment of close |

### Events

| Event | Fields | Emitted when |
|---|---|---|
| `Funded` | `address indexed from`, `uint256 amount` | `fund` succeeds |
| `PayslipIssued` | `address indexed payee`, `uint256 indexed period`, `uint256 amount` | A payee's transfer succeeded in `run`. Never emitted for held pay. |
| `PayoutDeferred` | `address indexed payee`, `uint256 indexed period`, `uint256 amount` | A payee's transfer failed in `run` and the amount was held |
| `PaydayRun` | `uint256 indexed period`, `address indexed runner`, `uint256 paid`, `uint256 deferred`, `uint256 tip` | The end of every successful `run` |
| `Claimed` | `address indexed payee`, `uint256 amount` | `claim` succeeds |
| `Withdrawn` | `address indexed to`, `uint256 amount` | `withdraw` succeeds. `to` is always the employer. |
| `PayeeAdded` | `address indexed payee`, `uint256 amount`, `uint256 fromPeriod` | `addPayee` succeeds |
| `PayeeUpdated` | `address indexed payee`, `uint256 amount`, `uint256 fromPeriod` | `updatePayee` succeeds |
| `PayeeRemoved` | `address indexed payee`, `uint256 fromPeriod` | `removePayee` succeeds |
| `PayrollClosed` | `uint256 closedAt` | `close` succeeds |
| `EmployerTransferStarted` | `address indexed current`, `address indexed pending` | `transferEmployer` succeeds |
| `EmployerTransferred` | `address indexed previous`, `address indexed current` | `acceptEmployer` succeeds |
| `EmployerTransferCancelled` | `address indexed current`, `address indexed cancelled` | `cancelEmployerTransfer` succeeds |

### Errors

| Error | Plain meaning |
|---|---|
| `ZeroEmployer()` | The employer address is zero. The factory never does this, because it passes the caller. |
| `LengthMismatch()` | The payee list and the amount list have different lengths. |
| `EmptyPayeeList()` | The payroll was created with no payees. |
| `TooManyPayees()` | More than 100 payees, at creation or in `addPayee`. |
| `ZeroPayee()` | A payee address is the zero address. |
| `DuplicatePayee(address payee)` | That address is already a payee, or appears twice in the list. |
| `PayeeIsThis()` | A payee is the payroll contract itself. |
| `PayeeIsUsdc()` | A payee is the USDC contract. |
| `ZeroAmount()` | An amount is 0. |
| `AmountTooLarge()` | An amount is above 1,000,000 USDC. |
| `StartTimeTooEarly()` | The first payday is before the current block time. |
| `StartTimeTooLate()` | The first payday is more than 365 days ahead. |
| `PeriodLengthTooShort()` | The period is under 60 seconds. |
| `PeriodLengthTooLong()` | The period is over 366 days. |
| `TipTooLarge()` | The tip is above 10 USDC. |
| `NothingDue()` | `run` found no started, unpaid period. It is paid already, or it has not started. Selector `0x86fdb19c`. |
| `Underfunded()` | `run` found a balance below held claims plus one period plus the tip. Fund the payroll and run again. |
| `InsufficientGasForRun()` | The caller sent too little gas for a payee transfer. Send more and try again. |
| `NotEmployer()` | An employer-only function was called by someone else. |
| `NotPendingEmployer()` | `acceptEmployer` was called by an address that was not nominated. |
| `NoPendingTransfer()` | `cancelEmployerTransfer` was called with nothing pending. |
| `ZeroNewEmployer()` | The nominated employer is the zero address. |
| `SameEmployer()` | The nominated employer is already the employer. |
| `InvalidNewEmployer()` | The nominated employer is the payroll or the USDC contract, which could never call `withdraw`. |
| `WithdrawExceedsFree()` | `withdraw` asked for more than `freeBalance()`. |
| `WithdrawZero()` | `withdraw` was called with 0. |
| `ZeroFundAmount()` | `fund` was called with 0. |
| `NothingToClaim()` | The caller has no held pay. |
| `ScheduleLocked()` | A started period is still unpaid, so the payee list cannot change yet. Run the waiting paydays first. |
| `PayeeNotFound()` | The address is not a current payee. |
| `LastPayee()` | `removePayee` would leave no payees. Use `close()` instead. |
| `AlreadyClosed()` | `close` was called twice. |
| `Closed()` | A schedule change was attempted after `close`. |

Two more errors come from the OpenZeppelin libraries: `ReentrancyGuardReentrantCall()` if a guarded function is entered again while it is running, and `SafeERC20FailedOperation(address token)` when USDC returns false or malformed data for `transferFrom` or `transfer`.
