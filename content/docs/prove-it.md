---
title: Prove-it CLI
group: developers
---

`bun run prove` is a read-only command that walks every USDC movement through Ooyaa's mainnet payrolls and compares the deployed bytecode with the code in this repository and with the testnet deployment. It runs the same eight checks as the [proof page](/proof). It holds no keys and sends no transactions.

## Run it

You need [Bun](https://bun.sh). For check C1 you also need [Foundry](https://getfoundry.sh), because the command compares mainnet with the artifacts that `forge build` writes to `contracts/out/`.

```bash
bun install
forge build
bun run prove
```

Run it from the repository root. The command looks for `contracts/out/PaydayFactory.sol/PaydayFactory.json` and `contracts/out/Payroll.sol/Payroll.json` relative to the folder you are in. If they are missing, C1 is reported as SKIP and the rest still runs.

## Options

```text
bun run prove [--payroll <address>]... [--json <path>] [--rpc <url>]
```

| Option | What it does |
|---|---|
| `--payroll <address>` | Check only this payroll. Repeat the option to check several. Without it, the command reads every payroll the mainnet factory has created. An address that is not valid prints `error: not an address` and exits with 2. |
| `--json <path>` | Also write the full report to a file as JSON, with every large number as a string. |
| `--rpc <url>` | Read Arc mainnet from this RPC instead of `https://rpc.mainnet.arc.io`. The node must report chain 5042, serve past state, and answer `eth_getLogs`. |

Testnet is always read from `https://rpc.testnet.arc.io`. Both chain ids are checked before anything else. If a node reports the wrong chain, the command exits with 2.

To check only the demo payroll:

```bash
bun run prove --payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No check failed. Checks may have been skipped. |
| 1 | At least one check failed, or the command hit an error it could not recover from. |
| 2 | A bad argument, or an RPC on the wrong chain. |

A SKIP does not change the exit code. Read the RESULT line for the count.

## What it prints

The command prints progress to standard error and the report to standard output. The report starts with the network, the snapshot block it read at, and the factory.

```text
Ooyaa prove-it
Network: Arc Mainnet (chain 5042), snapshot block <block> (<time>)
Factory: 0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b  https://explorer.arc.io/address/0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b
```

Then each check, with its evidence indented under it:

```text
PASS  C2 same code on mainnet and testnet
    mainnet factory keccak256: 0x5af18794d903c03bd9e4e4fea5ccf678a0da56ef78bc779e3dc0b2109be7d988
    testnet factory keccak256: 0x5af18794d903c03bd9e4e4fea5ccf678a0da56ef78bc779e3dc0b2109be7d988
    match: yes
    payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A: 0x43b9c6ee...5569 vs testnet ref 0x43b9c6ee...5569 match: yes
PASS  C3 verified source
    mainnet factory: exact_match
    mainnet payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A: exact_match
    testnet factory: exact_match
    testnet reference payroll: exact_match
PASS  C5 paid exactly once, in order
    38 payday(s), periods 0 to 37, nextUnpaid = 38
PASS  C7 every cent accounted for
    balance at snapshot 4.98 - balance before creation 0 = in 6.5 - out 1.52
PASS  C8 a second run is refused
    at block 28543924: run() from dead address
    reverted NothingDue: correct
```

The figures change as the demo payroll is used. The shape does not.

After the checks, each payroll gets a ledger:

- The employer, payee count, tip and period length.
- The 20 most recent paydays: period, time paid, how many seconds after the period started, the runner, the amounts paid and deferred, the tip and the transaction. Explorer links for the 10 most recent.
- Totals: paydays, payslips, paid, tips, deferred, claimed, funded, withdrawn and direct deposits.
- State at the snapshot: balance, owed, runway and when the next payday is due.
- Distinct wallets: runners, outside runners (neither the employer nor a payee), payees paid, funders, and every wallet that touched the payroll's USDC.

With more than one payroll it adds grand totals. It ends with the line that matters:

```text
RESULT: 8 passed, 0 failed, 0 skipped
```

With the demo payroll alone you get exactly eight checks. Checks C1 to C3 run once, and C4 to C8 run once per payroll, so N payrolls give 3 + 5 x N checks. The meaning of each check is in [Verify it yourself](/docs/verify).

## How it reads

It takes one snapshot block at the start and reads everything at or before it. It finds each payroll's creation block from the factory's `PayrollCreated` event, then reads the payroll's logs and the USDC `Transfer` logs to and from it, using indexed topic filters so the node returns only matching logs. Arc's public node caps `eth_getLogs` at 10,000 blocks per query, so the command pages through history and halves its page size if a node refuses a range.

Rate limits are retried up to five times, waiting 1, 2, 4, 8 and 16 seconds. A read that still fails stops the command with an error. It never prints zeros for data it could not read.

For C3 it calls the Sourcify API at `https://sourcify.dev/server/v2/contract/<chain id>/<address>`. A Sourcify outage gives SKIP for that line, not PASS.

## When something looks wrong

- C1 shows SKIP: run `forge build` first.
- You see rate limit messages on standard error: wait and run again, or pass a different node with `--rpc`.
- C3 shows SKIP: Sourcify could not be reached. Run it again later.
- A check shows FAIL: read the lines under it. They name the period, transaction or address that did not match.
