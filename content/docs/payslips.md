---
title: Payslips
group: guides
---

A payslip in Ooyaa is a record on the chain. Every time a payee is paid, the payroll emits a `PayslipIssued` event in the same transaction as the USDC transfer. Nobody has to produce the payslip, and nobody can edit it.

## What a payslip says

```text
PayslipIssued(address indexed payee, uint256 indexed period, uint256 amount)
```

| Field | Meaning |
|---|---|
| `payee` | The wallet that received the USDC |
| `period` | The pay period, counted from 0 on chain |
| `amount` | USDC paid, in 6-decimal units (10000 is 0.01 USDC) |

The transaction hash and block give the date and an address anyone can open on the explorer. The same transaction carries a `PaydayRun(period, runner, paid, deferred, tip)` event that names the wallet that ran the payday and the tip it earned.

The app counts periods from 1 on screen, so contract period 0 is shown as Period 0001.

## Pay that was held

If a payee's transfer fails during a run, there is no `PayslipIssued` for that payee. The payroll emits `PayoutDeferred(payee, period, amount)` instead, and the amount waits in the contract. The payee's slip shows Held for claim. When the payee later calls `claim()`, the payroll emits `Claimed(payee, amount)`.

A payslip event is only ever emitted when exactly that amount of USDC moved from the payroll to that payee in the same call. That is why a payslip can be trusted as a receipt.

## Where to see payslips

On the payroll card, the three payslips show the next payday and its amounts, then show Paid with a transaction link once the period is paid. The `/p/<address>` page for a payroll gives the same card with the payroll's schedule and creation block.

The [proof page](/proof) lists every USDC movement through every payroll made by the factory, newest first, with the period, the wallets, the amount and a link to the transaction. Payslips appear as "Payslip, period 0001". Tips appear as "Tip to runner". Held pay that was later collected appears as "Claimed, held pay". Press Download CSV to save the list as `ooyaa-ledger-<block>.csv`, with these columns:

```text
when_utc, block, what, period, from, to, direction, amount_usdc, tx, payroll
```

A payee who wants only their own pay can open the payroll's page with their wallet connected and download their payslips there. Nothing is signed to read or download them.

## Read one on the explorer

Open the payday transaction on the [explorer](https://explorer.arc.io) and look at the logs. The payroll's logs show one `PayslipIssued` per payee. The topics are:

| Topic | Value |
|---|---|
| 0 | `0x7c45825c8c9a791d620b1356befc64bfd6db8a32cbfc8eb45fdd016e9b30011d` (the event signature) |
| 1 | The payee address, padded to 32 bytes |
| 2 | The period, as a 32-byte number |

The amount is in the data field. Next to each one is a USDC `Transfer` from the payroll to the same payee for the same amount.

## How the proof checks payslips

Check C6 on the proof page matches each `PayslipIssued` to a USDC `Transfer` of the same amount to the same payee in the same transaction. It also adds up the payslips and held amounts of each run and compares them with the `paid` and `deferred` fields of `PaydayRun`. A payslip with no matching transfer fails the check. See [Verify it yourself](/docs/verify).

Arc logs every USDC transfer twice, once from the token contract and once from a system address with 18 decimals. The proof counts only the token contract's log, so each payment is counted once.

## What a payslip does not prove

A payslip proves that a payroll sent USDC to an address on a date. It does not prove who owns that address, that the payer is a real company, or that the payee is an employee. Anyone can create a payroll and pay themselves. Treat a payslip like a bank statement line, not like a signed letter from an employer.
