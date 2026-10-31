---
title: Limits
group: security
---

Read this page before you put real money into a payroll. It says what Ooyaa does not do, what was tested, and what the tests do not cover.

## It has not been audited

Ooyaa has not been audited by an outside security firm, and neither Arc nor Circle has audited it. The contracts were written by Arc Studio and then tested and attacked by the people who built Ooyaa. That is a lot of checking. It is not an audit, and it can still miss something.

The contracts are immutable. If a bug is found, it cannot be patched in place. A fix means a new factory, and existing payrolls stay on the old code.

## Use small amounts

Fund a payroll with what you are prepared to lose while you learn how it behaves. Money in a payroll is protected from the employer only up to what is already owed. Anything above that can be withdrawn by the employer at any time.

## Salaries and addresses are public

Every payee address and every amount is stored on Arc and emitted in events. Anyone who knows or finds a payroll's address can read the list. Ooyaa uses no privacy feature, so there is nothing to hide them behind. A payee's address on one payroll can be linked to the same address elsewhere.

Do not put anything in a payroll that you would not want public forever.

## A payslip is not proof of employment

A payslip proves that a payroll sent USDC to an address. It does not prove that the employer is a company, or that the payee works for anyone. Anyone can create a payroll and pay themselves.

## Things outside Ooyaa's control

- Circle issues USDC and can blocklist any address, including a payroll's. A blocklisted payee cannot receive their pay, so it is held for them. A blocklisted payroll would freeze the USDC it holds.
- Arc runs on a permissioned validator set. Validators could delay or censor a transaction, or set a block time within the protocol's limits.
- The web app depends on public RPC nodes and on Sourcify. If they are down or lying, the app can be slow or wrong. The proof page and `bun run prove` use different nodes where they can, so you can cross-check. If a read fails, they show an error instead of numbers.
- Your wallet, your device and your browser extensions are yours to protect. Check that you are on the real site before you sign anything.

## What an employer can do

The employer can stop funding at any time, withdraw everything that is not yet owed, change the schedule between paydays, and close the payroll. The contract protects only money that is already owed for a period that has started. It cannot make an employer fund a payroll. See the [trust model](/docs/trust).

## Demo payroll

The demo payroll holds a small float and pays 0.03 USDC plus a 0.01 USDC tip every hour. When the float runs out the card says Out of funds, and runs stop until someone funds it. Anyone can fund it.

## What was tested

- 89 Foundry tests of the contracts (on Arc Studio's Foundry v1.7.1; Foundry 1.8.6 groups the invariant campaign and reports 77): unit tests for the rules and the errors, fuzz tests, and invariant tests that call every function from random senders in random order. The invariants include: money leaves a payroll only by the rules, the balance always covers what is owed, no payee is paid more than the schedule, held pay matches the claims, and every event matches a real USDC transfer.
- A worst case for gas: 100 payees that each burn their whole gas budget, which still fits under the per-transaction cap of 16,777,216 gas.
- 6 fork tests that run the contracts against Arc's real USDC state on testnet and on mainnet, with Arc's Foundry build (standard Foundry cannot simulate native USDC, so they fail there). They cover a payee that is really blocklisted on the token (deferred, while the other nine are paid), a zero-tip run, the gas of 1 and of 100 payees, native USDC forced into a payroll by a self-destructing contract (it only raises the free balance), and the cost of a transfer to a fresh address against the gas budget.
- 39 deliberate breakages of the contract code, each checked to make at least one test fail. 38 did. The 39th changes no behaviour, so no test can catch it.
- Static analysis with Slither on an earlier version of the contracts reported only timestamp comparisons, which are how a payroll tells time.
- Three review rounds by a second AI agent that read the full contracts and tried to break the threat model. Every finding was fixed and proven, or answered in writing. The [threat model](/docs/threat-model) has the summary.
- 228 app tests for the run flow, error handling, formatting and the proof checks.
- The mainnet contracts are proven to be the reviewed code: they match a local build of this repository, match the testnet deployment, and have exact-match source verification on Sourcify. See [Verify it yourself](/docs/verify).

## What the tests do not cover

- They do not replace an audit by people who do this for a living.
- Fuzzing and invariant testing explore a very large number of call sequences, but not all of them.
- Fork tests simulate transactions against real chain state. They are not live transactions at scale, and they cannot predict future changes to USDC or Arc.
- The app tests check the app's logic. They do not drive a real wallet through a browser.
- Nothing here tests how an employer or a payee will behave.
- Mainnet history is short. Only a small number of paydays and wallets have gone through the contracts so far.
