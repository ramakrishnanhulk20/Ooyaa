---
title: Run a payday
group: guides
---

Running a payday means calling `run()` on a payroll whose period has started. Anyone can do it. The caller pays the gas and receives the payroll's tip.

## From the app

The demo payroll is on the [home page](/). Any payroll made by the factory also has its own page at `/p/<payroll address>`, with the same card and the same button. The steps are in the [quick start](/docs/quick-start).

The page only opens for addresses the factory created. For any other address it says "This address is not a payroll made by Ooyaa's factory" and offers no button. That check is one call to `isPayroll(address)` on the factory.

## What the card tells you

| What you see | What it means |
|---|---|
| Next payday in 12:34 | Nothing is due yet. The countdown uses chain time. |
| Payday due, or N paydays due | At least one started period is unpaid. Pressing the button pays the oldest. |
| Earn a 0.01 USDC tip for running it | The tip you will receive for this run. |
| Funded for N more paydays | The free balance covers N more periods beyond what is already owed. |
| Out of funds | The payroll holds less than it owes. The employer, or anyone, must top it up before the next run. |
| Closed, with paydays still owed | The employer closed it, but paydays that had already started are unpaid. The button still works and the card says "This payroll is closed. Paydays that already started can still be run." |
| Closed, with the button reading Payroll closed | The employer closed it and nothing is owed. The button is off for good. |

If the payroll has several paydays waiting, each press runs one of them, oldest first. To clear a backlog of ten, run ten times. Each run is a separate transaction with its own tip.

## When the button says no

The app simulates the run before it asks your wallet to sign. When the contract would refuse, you see the reason and nothing is sent.

| Message | Cause | What to do |
|---|---|---|
| Refused by the contract: this payday is already paid. Nothing was signed. | The contract returned `NothingDue`. Either the period was paid already or it has not started. | Wait for the next payday. |
| This payroll owes X USDC and holds Y USDC. Nothing was sent. | The contract returned `Underfunded`. The balance does not cover held claims, one period and the tip. | Fund the payroll, or ask the employer to. |
| Your wallet needs a little USDC on Arc for gas, about 0.004 USDC. | The wallet cannot pay the fee. | Add USDC to your wallet on Arc. See [Get a wallet](/docs/wallet). |
| Your wallet is on another network | Wallet is not on chain 5042. | Press Switch to Arc. |
| You cancelled. Nothing was sent. | You rejected the signature. | Press the button again if you meant to run it. |
| Arc refused the run on chain, probably because it was paid a moment earlier. Only the gas was spent. | Someone else ran the same period between your check and your transaction. | Nothing to fix. Their run paid it. |
| Something went wrong, followed by a short reason. Nothing was paid. | The RPC or the wallet failed, not the contract. | Press Try again. |

## What you earn

You receive `tipPerRun` once per run, after the payees are paid. You pay the network fee. For a 3-payee payroll the fee was about 0.004 USDC on mainnet (185,555 gas). A 100-payee run takes about 5 million gas, so about 0.1 USDC at the same gas price. An employer with a big team may want a larger tip.

If two runners race for the same period, the first transaction to land pays it and takes the tip. The second reverts with `NothingDue` and loses only the fee, unless more periods are waiting, in which case it pays the next one.

## Gas

The app estimates the gas for `run()` and sends 1.3 times the estimate, so a busy block does not push the run over its limit. If you run it from your own tool, give it plenty. Before each payee the contract needs about 161,746 gas left. If it does not have that, it reverts with `InsufficientGasForRun` and nothing is paid. A low gas limit never marks a payee as deferred.

## From a terminal

Any tool that can send a transaction can call `run()`. With Foundry's `cast`:

```bash
cast send 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A "run()" \
  --rpc-url https://rpc.mainnet.arc.io \
  --account <your keystore name>
```

Simulate first with `cast call 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A "run()" --from <your address> --rpc-url https://rpc.mainnet.arc.io`. A `NothingDue` or `Underfunded` error comes back at no cost. Arc enforces a minimum gas price; our own transactions used a 25 gwei limit and paid about 21 gwei.

## Check the result

Open the transaction on the [explorer](https://explorer.arc.io). The payroll's logs show one `PayslipIssued` per paid payee, a `PayoutDeferred` for any held pay, and one `PaydayRun(period, runner, paid, deferred, tip)`. The USDC token's own `Transfer` logs show the same money moving. [Payslips](/docs/payslips) explains how to read them.
