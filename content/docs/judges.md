---
title: For judges
group: more
---

This page is a map. For each thing a reviewer is asked to look at, it says where to see it and how to check it with one click or one command. Every claim here can be tested without trusting us.

The project in one paragraph: payday runs without the employer being online. Anyone can press Run payday and earn a small USDC tip, each payee is paid exactly once per period in order, and a proof page re-checks every cent live from the chain.

## Real USDC moving on Arc mainnet, shown with contract addresses and transaction hashes

Contracts on Arc mainnet (chain 5042):

| Contract | Address |
|---|---|
| PaydayFactory | [`0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b`](https://explorer.arc.io/address/0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b) |
| Demo payroll (3 payees, 0.01 USDC each, hourly, 0.01 USDC tip) | [`0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A`](https://explorer.arc.io/address/0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A) |

Transactions to open on [explorer.arc.io](https://explorer.arc.io):

- Factory deployed: [`0x8ddfb41d...91d26e`](https://explorer.arc.io/tx/0x8ddfb41d4d6832025de23bf958cdeb27bc270e7f6636110cf7cf807efa91d26e), block 28261674.
- Demo payroll created: [`0xff12ca15...84af34`](https://explorer.arc.io/tx/0xff12ca1562da948689d1e7e9de970a43ae9e038e9f0f24fd1afe9c844184af34), block 28272851.
- Demo payroll funded with 1.5 USDC: [`0x07c16596...a4cd3e`](https://explorer.arc.io/tx/0x07c1659635188454406d6d7d46acc9beba1fe589384683bc2a4e0f0850a4cd3e), block 28273044.
- First payday, which moved USDC to three payees and a tip to the runner: [`0x0692c42d...c07fec`](https://explorer.arc.io/tx/0x0692c42dd090bf022e41b9bb57d130ec6c1402615e0abb10d6ba9f1674c07fec), block 28281381. Its logs show three `PayslipIssued` events and one `PaydayRun`.

One click: open the [proof page](/proof). It lists every USDC movement through every payroll made by the factory, each with a link to its transaction, and counts the distinct wallets. It marks each wallet that has run payday as OUTSIDE or OURS. A wallet is ours when it is the employer or a payee. When this page was written, one outside wallet had run 37 of the 38 paydays.

One command: `bun run prove --payroll 0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A` re-reads the chain and prints each transaction link, the totals and the line `RESULT: 8 passed, 0 failed, 0 skipped`. See [Verify it yourself](/docs/verify).

## Use of Arc Studio across the build: contracts, testing, and app

The Arc Studio project: [studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f](https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f).

- Contracts: `contracts/Payroll.sol` and `contracts/PaydayFactory.sol` were written by Studio from written prompts.
- Testing: the Foundry tests, the fork tests and the app tests were written by Studio. 89 Foundry tests, 6 fork tests (on Arc's Foundry build) and 228 app tests pass.
- App: every screen in `src/` was built by Studio, including the proof page and the command-line proof tool.
- Build log: the prompts, in order, are in the `prompts/` folder of the [repository](https://github.com/ramakrishnanhulk20/ooyaa).
- Deployment: Studio deployed the contracts to Arc testnet. The mainnet deploy was made by the Ooyaa team from the same source, outside Studio, and then proven to be the same code.

One click: the proof page's Built in Arc Studio panel shows the project link, the addresses and the test counts. One command: `bun run prove` checks that the mainnet bytecode equals a local build of the repository (C1), equals Studio's testnet deployment (C2), and has an exact-match verified source on Sourcify (C3). See [Why Arc](/docs/why-arc) for the story of the build.

## A working product

The live app is at the [home page](/). The demo payroll is live on screen one, before any wallet is connected, with a countdown to the next payday, how many paydays it is funded for, and the three payslips.

A reviewer with a wallet and a few cents of USDC on Arc can:

1. Press Run payday and see three payslips stamped PAID. The tip arrives in the wallet.
2. Press it again and be refused before anything is signed.
3. Open the [proof page](/proof) and see the eight checks pass and the sheet stamped VERIFIED.
4. Read [Create a payroll](/docs/create-payroll) and make a payroll of their own with a 2-minute period.

The steps are in the [quick start](/docs/quick-start), and the full list of functions is in [Contracts](/docs/contracts). The pages are laid out to work at phone width, checked at 375 px.

## Potential to go further

Who it is for: small teams, DAOs and contractors paid in USDC on a schedule, who want a public record and no one to babysit a payment script. The tip pays strangers to do the one job that normally needs a server, and the proof page shows who did it.

What exists today is the contracts, the app and the proof tooling. These are ideas for what comes next, and none of them is in the contracts yet:

- Pay lines in other Circle stablecoins alongside USDC.
- Importing a payee list from a CSV, and exporting statements in a format accountants can use.
- An optional way for an employer to put spare reserve to work from the employer's own wallet, kept apart from the money a payroll owes.

## Where each required item is

| Item | Where |
|---|---|
| Arc Studio project URL | [studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f](https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f) |
| Live app | The [home page](/) |
| Contract addresses and an example transaction | The first section of this page |
| Public repository | https://github.com/ramakrishnanhulk20/ooyaa |
| What the project does and how Studio was used | This page, [Overview](/docs/overview) and [Why Arc](/docs/why-arc) |
