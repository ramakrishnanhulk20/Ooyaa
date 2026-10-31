---
title: Verify it yourself
group: guides
---

You do not have to take Ooyaa's word for anything. Two tools re-check the claims from the chain itself: the proof page in your browser and the `bun run prove` command in a terminal. Both read Arc, run the same eight checks, and sign nothing.

## The proof page

Open the [proof page](/proof). It reads Arc mainnet in your browser. As each check finishes it gets a PASS, FAIL or SKIP mark on the proof sheet, and when all eight pass, the sheet is stamped VERIFIED. Nothing on the page is typed in by us.

Below the sheet you will find:

- The totals: USDC in, paid to people, tips to runners, paydays run and payslips issued.
- The wallets that have run payday, each marked OUTSIDE or OURS. A wallet is ours when it is the employer or a payee of that payroll. Anyone else is outside, drawn by the tip.
- Every USDC movement through every payroll made by the factory, newest first, with transaction links and a Download CSV button.
- The Arc Studio panel: the project link, the contract addresses and the test counts.

Press Run again to read the chain once more. If a read fails, the page says it could not finish and shows no numbers. It never shows a cached or made-up figure.

## The command

You need [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh). Foundry is only used for check C1.

```bash
git clone https://github.com/ramakrishnanhulk20/ooyaa ooyaa
cd ooyaa
bun install
forge build
bun run prove
```

The command reads Arc mainnet and testnet, prints each check, then a ledger for every payroll, and ends with a line like this:

```text
RESULT: 8 passed, 0 failed, 0 skipped
```

To check only the demo payroll, which gives exactly eight checks:

```bash
bun run prove --payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A
```

Without `--payroll`, the command checks every payroll the factory has made. Checks C1 to C3 run once. C4 to C8 run for each payroll, so the total is 3 plus 5 for each payroll. The options are in [Prove-it CLI](/docs/prove-it).

## The eight checks

C1 to C8 are the labels on the proof sheet and in the command's output.

| Check | In plain words | A failure means |
|---|---|---|
| C1 local build | The bytecode on mainnet is identical to what you get by building this repository with the pinned compiler. | The deployed code is not this source. SKIP if you have not run `forge build`. |
| C2 same code on mainnet and testnet | The mainnet factory has the same bytecode as the testnet factory, and every mainnet payroll has the same bytecode as the testnet reference payroll. | Mainnet runs something other than what was tested on testnet. |
| C3 verified source | Sourcify reports an exact match between the published source and the deployed bytecode, for the mainnet factory, each mainnet payroll, the testnet factory and the testnet reference payroll. | The source you read may not be what runs. SKIP if Sourcify cannot be reached. |
| C4 made by the factory | The factory says it created this payroll (`isPayroll` is true) and emitted a `PayrollCreated` event for it. | The address is a look-alike contract. |
| C5 paid exactly once, in order | The `PaydayRun` events are for periods 0, 1, 2 and so on with none missing and none repeated, and `nextUnpaid` equals the number of runs. | A period was skipped or paid twice. |
| C6 every payslip is a real USDC transfer | Each `PayslipIssued` has a matching USDC transfer of the same amount to the same payee in the same transaction. The payslips and held amounts of each run add up to the `paid` and `deferred` figures in `PaydayRun`. | A payslip was recorded for money that did not move. |
| C7 every cent accounted for | Every USDC transfer out of the payroll is explained by a payslip, a tip, a claim or a withdrawal. Every `Funded` event matches a transfer in. The balance now minus the balance before creation equals the money in minus the money out. | Money moved that no event explains. |
| C8 a second run is refused | Right after a recent payday, when nothing was due, a simulated `run()` reverts with `NothingDue`. If nothing is due now, `run()` reverts with `NothingDue` at the latest block too. | The contract would pay the same period again. |

C7 prints its equation, so you can do the sum by hand. USDC sent straight to a payroll without calling `fund` shows up as a direct deposit. It is listed, and it is not a failure.

C8 does its test with a simulated call from the address `0x000000000000000000000000000000000000dEaD`, so no wallet and no money is involved. It picks one of the five most recent paydays where nothing was left due after the run.

## What the checks do not prove

- They do not prove the contracts are safe. Ooyaa has not been audited. See [Limits](/docs/limits).
- They do not prove an employer is honest or that a payee is an employee.
- They read public Arc nodes. A node that lied could fool one reader, which is why the page and the command use different nodes where they can, and why you can point the command at your own with `--rpc`.
- C3 depends on Sourcify being reachable.

## Checking by hand

Two checks need no tooling at all.

Open [the factory's Sourcify record](https://sourcify.dev/server/v2/contract/5042/0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b) and look for `"match": "exact_match"`.

Compare the runtime code on both networks with Foundry. Both lines print the same hash, `0x5af18794d903c03bd9e4e4fea5ccf678a0da56ef78bc779e3dc0b2109be7d988`.

```bash
cast code 0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b --rpc-url https://rpc.mainnet.arc.io | cast keccak
cast code 0xb32feb10b48d753dee8938435ebe1c303ce6955b --rpc-url https://rpc.testnet.arc.io | cast keccak
```

For the payroll contract, the demo payroll on mainnet and the reference payroll on testnet both hash to `0x43b9c6ee77065a2534ec77c0ab7f3c665f0f57afa68912bfabddb77b5a5f5569`.
