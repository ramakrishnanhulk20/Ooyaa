---
title: Threat model
group: security
---

This is a short public summary of Ooyaa's threat model. The full document, with every rule and every review round, is in the repository at [docs/security/threat-model.md](https://github.com/ramakrishnanhulk20/ooyaa/blob/main/docs/security/threat-model.md).

## How it was made

Before any contract code existed, the system was described in plain functional terms, with no security notes. A reviewer then worked only from that description and listed the kinds of risk that hit this kind of system, the places where untrusted input comes in, what an attacker would want, and what a defender must always be able to show.

The result was a list of rules, each stating an outcome and the test that proves it. Every build prompt to Arc Studio named the rules it touched, and the build was complete only when each rule was shown to hold, with the file and function that enforces it. The contracts were then reviewed in three more rounds, and each finding either changed the code or got a written answer.

The full file numbers its rules C1 to C39. 31 are in use; the gaps are features that were never built. The proof page and `bun run prove` also have eight checks labelled C1 to C8. Those are a different list.

## What the model found, and what stops it

| Risk | What could go wrong | What stops it |
|---|---|---|
| Employer takes earned wages | The employer withdraws money meant for a period that has started | "Owed" is defined once. `withdraw` can only take `freeBalance`, which is the balance minus owed. Invariant tests try it with random calls and time jumps. |
| Anyone moves money | A missing check lets a stranger take funds | USDC leaves a payroll only to a payee for their pay, to a payee for their own held pay, to the runner as a tip, or to the employer for the free balance. No function lets the caller name another destination. |
| A period is paid twice or out of order | Two runs in one block, or a run for the wrong period | One counter, `nextUnpaid`, moves forward before any transfer. `run()` takes no argument. A second run reverts with `NothingDue`. Fuzz tests and proof check C5 and C8 cover it. |
| One payee blocks the team | A blocklisted payee makes the whole run revert | Each payee transfer has a gas cap. A failure becomes a held claim for that payee, and the others are still paid. Tested against a payee that is really blocklisted on Arc's USDC. |
| A runner forces a payee into deferral | Sending too little gas so a transfer fails | Before each payee the contract checks the gas it has left. Too little reverts the whole run. A low gas limit never defers anyone. |
| A run that cannot fit in a transaction | Too many payees, or expensive failures, push a run over the gas limit | At most 100 payees and a gas cap per payee. A run with 100 payees that all burn their whole budget still fits under 16,777,216 gas. |
| Bad inputs | Zero period, past start, duplicate payees, huge amounts | Every input has a named error and a test. Limits are listed in [Contracts](/docs/contracts). |
| Surprise balance | Someone sends USDC to the payroll directly, or forces native USDC in with a self-destructing contract | Nothing depends on the balance matching the books. Extra money only raises the free balance. Tested on Arc's real USDC state. |
| Clock games | Block times that repeat or drift by a second | Periods are at least 60 seconds. The exact boundary is tested: at the period's start second it is due, one second before it is not. |
| A look-alike payroll on the site | A fake contract with the same views, shown on our domain | The app treats an address as a payroll only if the factory says it created it. Otherwise it shows "This address is not a payroll made by Ooyaa's factory" and no buttons. |
| Phishing through the URL | A link pre-fills an address or an amount in a transaction | No write takes an address or an amount from the URL. Approvals are for exactly the amount funded. With the wrong network connected, there is no write. |
| False evidence on the proof page | Double-counted Arc logs, partial logs, a loose bytecode compare | Only the token contract's `Transfer` logs are counted. A failed read shows an error, never zeros. A bytecode match is byte for byte. |
| Tests that never fail | AI-written tests that pass whatever the code does | The contracts were broken on purpose 39 ways and a test failed for 38 (the 39th changes nothing). Invariant tests use models that do not call the code they check. |
| Code that differs from what was reviewed | A different build is deployed | Mainnet bytecode equals a local build of the repository and equals the testnet deployment. Source is verified on Sourcify. |

## What it does not defend against

- Employment truth. A payslip shows a transfer, not a job.
- Future pay. An employer can stop funding, withdraw what is not owed, or close.
- Circle blocklisting an address or freezing a payroll's USDC, and Arc validators delaying or censoring transactions.
- Public salaries. Every payee address and amount is on a public chain.
- Wallet theft, malicious browser extensions, phishing sites on other domains, and a lying RPC provider.
- Tip races. A runner who loses a race to another runner loses only gas.
- Spam payrolls. Anyone can create payrolls through the factory, which inflates counts. The proof page says how it counts wallets, but it does not prevent spam.
- Bugs found after deploy. The contracts cannot be changed.

## What the review rounds changed

The model started with a design that had a pause, a free choice of period to run, and a payee list that could change at any time. It ended with no pause, one counter, and a locked schedule while a started period is unpaid. The review rounds added a cap on gas per payee so a run always fits in one transaction, a rule that malformed token answers count as a refusal, a way to cancel a handover, and tests that compare against models that do not call the code under test.

For the evidence behind each line, read [Limits](/docs/limits) and run the checks in [Verify it yourself](/docs/verify).
