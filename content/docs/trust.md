---
title: Trust model
group: concepts
---

Ooyaa is built so that a payee does not have to trust the employer's server, the Ooyaa team, or an admin. There are none of those in the path. What you do have to trust is the code, Circle's USDC, and Arc itself, and this page says where each of those stops.

## No admin, no pause, no upgrade

- The factory has no owner, charges no fee, and cannot touch a payroll after it creates one.
- A payroll has no admin account. Its only privileged addresses are its employer and a pending employer, both stored in the payroll itself.
- There is no pause function. The employer can close a payroll, which stops future periods but never the ones that have already started.
- There is no proxy and no upgrade path. The code at each address is the code that will run for as long as the chain exists. A bug fixed later means a new factory, and existing payrolls stay on the old code.
- The contracts call exactly one other contract, the USDC token. They have no `delegatecall`, no `selfdestruct`, no payable function and no fallback, so they cannot be sent native value on purpose. (USDC forced in by a self-destructing contract elsewhere only raises the free balance, which a fork test proves.)

You can check all of this by reading the two source files. They are short, and the source on Arc is verified on Sourcify with an exact match. See [Contracts](/docs/contracts) and [Verify it yourself](/docs/verify).

## Who can do what

| Role | Can | Cannot |
|---|---|---|
| Anyone | Run a payday that is due and earn the tip. Fund any payroll. Create a payroll through the factory. Read everything. | Choose who gets paid or how much. Pay a period twice or out of order. Send a payroll's money to an address of their choosing. |
| Employer of a payroll | Add, change and remove payees between paydays. Withdraw the free balance. Close the payroll. Hand the role to another address in two steps. | Withdraw money owed for a period that has started, or pay that is held in a claim. Stop a started, funded payday. Send a payee's pay anywhere else. Pause or change the code. |
| Payee | Collect pay that was held for them with `claim()`. Run a payday like anyone else. | Collect someone else's held pay. Change their own amount. |
| The factory | Record each payroll it creates and say whether an address is one of them. | Anything else. |
| The Ooyaa team | Act as employer of the demo payroll only, which means withdrawing its free balance or closing it. | Touch any other payroll or the factory. |

Every outgoing USDC transfer goes to a fixed destination: a payee for their own pay, a payee claiming their own held pay, the wallet that ran the payday for the tip, or the employer for the free balance. No function accepts a destination from the caller.

## What an employer can still do to payees

The contract protects money that is already owed. It cannot make an employer fund a payroll.

- An employer can stop funding. A payday whose period has started but is unfunded stays owed and cannot be run until someone funds it. Nothing forces the employer to.
- An employer can withdraw all money that is not yet owed, including money meant for periods that have not started.
- An employer can close a payroll at any time. No further periods will be owed.
- An employer can change amounts or remove a payee, effective from the next period that has not started.

So a payslip proves that a payroll sent USDC to an address. It does not prove the employer is a real company or that the payee is an employee. Anyone can create a payroll and pay themselves.

## What neither Ooyaa nor the employer controls

- Circle issues USDC and can blocklist any address, including a payroll's address. A blocklisted payee cannot receive pay, so their share is held for them. A blocklisted payroll would freeze the USDC it holds.
- Arc is run by a permissioned validator set. Validators could censor a transaction or move a block timestamp within the protocol's bounds. The contract treats timestamps as one-second clocks and the shortest period is 60 seconds, so a few seconds of drift cannot pay a period twice or to the wrong person.
- Your wallet, your browser extensions and your device are yours to protect.

## What is public

Every payee address and amount is stored and emitted on a public chain, forever. Anyone with a payroll's address can read it. The [limits page](/docs/limits) says more.

## How to check this yourself

Everything above can be tested without trusting a word of this page. Read [Contracts](/docs/contracts), run `bun run prove`, and open the contract source on Sourcify. The [threat model summary](/docs/threat-model) lists the attacks that were tried and how each is stopped.
