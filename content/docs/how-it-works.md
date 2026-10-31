---
title: How it works
group: concepts
---

A payroll is one smart contract with a list of payees, an amount for each, a first payday and a pay period. Everything else follows from five rules: periods run on a clock, each period is paid exactly once and in order, anyone can run it, the runner earns a tip, and pay that cannot be delivered is held for its owner.

## Periods

Period 0 starts at the payroll's `startTime`. Period 1 starts one `periodLength` later, and so on. The contract counts how many periods have started using the block timestamp of the latest block. Before `startTime` the count is 0.

The demo payroll started at 09:00 UTC on 28 October 2026 and pays every 3,600 seconds. At 09:00 the count became 1, at 10:00 it became 2, and it grows by one every hour. The count only moves forward with the clock. A period is "due" when it has started and has not been paid.

The pay period can be anything from 60 seconds to 366 days. The first payday can be up to 365 days after the payroll is created and never in the past.

## Exactly once, in order

The contract keeps one number, `nextUnpaid`: the index of the next period to pay. A call to `run()` pays that period and adds one to the number before any money moves. There is no way to name a period, skip one, or pay one twice.

If a period has not started yet, or it has already been paid, `run()` stops with the error `NothingDue` and changes nothing. This is the "second press is refused" behaviour you see on the home page. If three paydays were missed, three calls pay them, oldest first. They are not merged into one big payment.

Each payee is paid the amount stored for them. The amounts and the payee list cannot change while a started period is still unpaid, so every unpaid period uses the same schedule.

## Anyone can run it

`run()` has no access control. The employer does not have to be online, and neither do the payees. Any wallet can call it once a period is due. The wallet pays the gas, about 0.004 USDC for three payees, and receives the tip.

The contract also checks that the payroll holds enough USDC before it moves anything: enough for every held claim, one full period and the tip. If it does not, `run()` stops with `Underfunded` and nothing changes. The unpaid period stays owed, and the run works again as soon as someone funds the payroll.

## The tip

The employer sets `tipPerRun` when the payroll is created, from 0 to 10 USDC. It is sent to the wallet that called `run()`, once per run, after the payees are paid. It is part of what the payroll owes for every period, so the employer cannot withdraw it out from under a runner.

The tip is the reason strangers will press the button. It only has to be worth a little more than the gas. On the demo it is 0.01 USDC against about 0.004 USDC in gas. Setting it to 0 is allowed; then only the employer and the payees have a reason to run.

If the tip transfer fails, for example because the runner's address is blocklisted, the whole run reverts. No payee is paid by that transaction and no state changes, so another wallet can run the period.

## Deferred pay and claims

USDC on Arc is issued by Circle, which can blocklist an address. A transfer to a blocklisted address fails. If that happened to one payee and the contract stopped, the whole team would go unpaid.

So `run()` sends each payee's amount with a capped amount of gas (110,000) and checks whether it worked. If it did, the contract records a `PayslipIssued` event. If it did not, the amount is added to that payee's `claimable` balance, the contract records a `PayoutDeferred` event, and the run carries on with the next payee.

Held pay stays in the contract, counts as owed, and cannot be withdrawn by the employer. Only the payee can collect it, by calling `claim()` from their own address. It is sent to the caller and to nobody else, so Ooyaa cannot be used to route money around a blocklist. If the payee is still blocklisted, the claim fails and the money waits.

A runner cannot cause a deferral by sending too little gas. Before each payee the contract checks that enough gas is left for the full cap plus a reserve. If not, the whole run reverts.

## Funding and what is owed

Anyone can add USDC with `fund(amount)`, after approving the payroll to pull it. USDC sent directly to the payroll address also arrives, with no event.

The contract defines "owed" once:

```text
owed = (started periods - next unpaid period) * (payee total + tip) + held claims
```

The employer can withdraw `freeBalance`, which is the balance minus owed, and no more. Money for a period that has started is locked until it is paid. Money for periods that have not started is free, because nobody has earned it yet.

`runway` tells you how many future periods the free balance would cover. It does not count periods that are already owed.

## Changing the schedule

The employer can add a payee, change an amount, or remove a payee, but only when every started period is already paid. The change applies from the next period that has not started. This keeps the rule simple: one schedule covers every unpaid period.

If the schedule is locked, the employer (or anyone) runs the waiting paydays first, then makes the change. A payee who is removed keeps any held claim and can still collect it.

A payroll holds at most 100 payees, each paid between 0.000001 and 1,000,000 USDC per period.

## Close

`close()` is the only stop button. It is permanent. After it, no period that starts later is ever owed. Periods that had already started still run and still pay. `fund` still works, so a closed payroll can be topped up to pay what it owes. The employer can then withdraw whatever is above what is owed.

There is no pause. A pause in the employer's hands could hold back wages that were already earned, so the contract does not have one.

## Handing the payroll to someone else

The employer role moves in two steps. The current employer names a new address with `transferEmployer`. Nothing changes until that address calls `acceptEmployer`. The old employer can cancel before then. When the new employer accepts, the old one loses every power in the same transaction.
