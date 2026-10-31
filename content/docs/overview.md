---
title: Overview
group: start
---

Payday runs without the employer being online. Anyone can press Run payday and earn a small USDC tip, each payee is paid exactly once per period in order, and a proof page re-checks every cent live from the chain.

It already works that way. Within two days of going live, a wallet we do not control started running the demo payroll for the tip, and it has run almost every payday since, usually within a minute of it falling due. The [proof page](/proof) counts every run by wallet, ours and outside.

Ooyaa is a payroll for USDC on Arc. An employer lists the people to pay and how much each gets, picks a pay period, and puts USDC in. From then on the contract does the rest. There is no company server that has to stay up, no scheduler to keep alive and no admin who can change the rules.

The name is Tamil for never resting, unceasing: a payday with no server that can stop or run dry.

## What happens on a payday

When a period starts, the payroll becomes due. Any wallet can call `run()`. The contract pays every payee their amount in USDC, records a payslip for each one, and sends the tip to the wallet that pressed the button. The tip is set by the employer, from 0 to 10 USDC per run. On the demo payroll it is 0.01 USDC.

The contract keeps a counter of the next unpaid period. A run always pays that period, so paydays go in order and a period can never be paid twice. If nobody presses the button for a while, the missed paydays stay owed and are paid one per transaction, oldest first.

If one payee cannot receive USDC, for example because Circle has blocklisted the address, the others are still paid. That payee's amount is held in the contract and only that payee can claim it.

## What the employer controls

The employer picks the payees, the amounts, the period (from 60 seconds to 366 days), the first payday (up to a year ahead) and the tip. The employer can add or change payees between paydays, withdraw money that is not already owed, close the payroll, and hand the role to another address in two steps.

The employer cannot take back money owed for a period that has already started, cannot stop a payday that has started and is funded, and cannot redirect anyone's pay. The [trust page](/docs/trust) lists exactly what each role can and cannot do.

## What is live

Ooyaa is deployed on Arc mainnet (chain 5042). The factory is `0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b`. A demo payroll at `0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A` pays 3 payees 0.01 USDC each, every hour, with a 0.01 USDC tip. Run it yourself in two minutes with the [quick start](/docs/quick-start).

The [proof page](/proof) reads Arc in your browser and runs eight checks: the code on mainnet equals a local build of this repository and equals the testnet deployment, every payslip is a real USDC transfer, every cent that entered or left a payroll is explained by an event, and a second run for the same period is refused. The same checks run from the command line with `bun run prove`. See [Verify it yourself](/docs/verify).

## Read next

- [Quick start](/docs/quick-start) to run a payday and create your own payroll.
- [How it works](/docs/how-it-works) for periods, tips, held pay and close.
- [Trust model](/docs/trust) for what nobody can do.
- [Limits](/docs/limits) before you put real money in. Ooyaa has not been audited.
- [Contracts](/docs/contracts) for every function, event and error.
