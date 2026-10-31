---
title: FAQ
group: more
---

### Who can press Run payday?

Anyone with a wallet that holds a little USDC on Arc for gas. The employer, a payee or a complete stranger all work the same way. The contract does not ask who you are.

### Why would a stranger run my payday?

For the tip. You set a tip from 0 to 10 USDC when you create the payroll, and it goes to whoever runs each payday. On the demo it is 0.01 USDC against about 0.004 USDC in gas. If you would rather run every payday yourself, set the tip to 0.

### What if nobody runs a payday?

Nothing is lost. The payday stays owed, and the money stays locked for it. When someone runs it, the contract pays the oldest unpaid period first, then the next, one period per transaction. A late payday is paid late, not skipped.

### Can a payee be paid twice for the same period?

No. The contract keeps a counter of the next unpaid period and moves it forward before any money leaves. A second call for a period that is already paid reverts with `NothingDue`. The proof page tests that on the real contract.

### What if the payroll runs out of USDC?

A run needs the balance to cover held claims, one full period and the tip. If it does not, `run()` reverts with `Underfunded` and nothing changes. The period stays owed, and the run works again as soon as someone funds the payroll. Anyone can fund it, not only the employer.

### Can the employer take the money back?

Only money that is not owed. The employer can withdraw the free balance, which is the balance minus what is owed for started, unpaid periods and held claims. Money for a period that has started cannot be withdrawn until it is paid. The employer can also stop funding, change the schedule between paydays, or close the payroll.

### What happens if a payee is blocklisted by Circle?

The contract cannot send USDC to a blocklisted address. Instead of stopping, it holds that payee's share as a claim and pays everyone else. The payee can call `claim()` from their own address once they are able to receive USDC. The employer cannot withdraw held pay.

### What if the employer loses access to their wallet?

Funded paydays keep running, because anyone can run them. But nobody can withdraw the free balance, change the schedule or close the payroll. If you worry about this, hand the employer role to a safer address with `transferEmployer` before you need to.

### Can the contracts be paused or upgraded?

No. There is no pause, no proxy and no admin. The only stop is `close()`, which stops future periods but never the ones that have already started. A bug found later means a new factory, and existing payrolls stay on the old code.

### Are salaries private?

No. Every payee address and amount is stored on Arc and emitted in events, and anyone can read them. Do not use Ooyaa for anything you need to keep private.

### Has Ooyaa been audited?

No. It was written and tested in Arc Studio, then tested again and attacked by its builders, and its threat model went through three review rounds. That is not an audit by an outside firm. Use small amounts. See [Limits](/docs/limits).

### What does a payday cost?

The runner pays the network fee. A 3-payee run used 185,555 gas on mainnet, which was about 0.004 USDC. A 100-payee run takes about 5 million gas, about 0.1 USDC at the same gas price. Creating the 3-payee demo payroll used 2,057,305 gas. The gas price can change, so treat these as examples.

### Which token and which networks?

USDC only, at `0x3600000000000000000000000000000000000000`, with 6 decimals. The contracts are on Arc mainnet (chain 5042) and Arc testnet (chain 5042002). The address is built into the code, so they do not work with another token or another chain.

### How do I know the code on mainnet is the code in this repository?

Run `bun run prove` or open the proof page. Check C1 compares the mainnet bytecode with a local build of the repository. Check C2 compares it with the testnet deployment. Check C3 asks Sourcify whether the published source is an exact match. See [Verify it yourself](/docs/verify).
