---
title: Why Arc
group: concepts
---

Ooyaa is built for Arc because three things about Arc fit a payroll that nobody has to babysit: USDC is the gas token, blocks finalise fast, and the build tool, Arc Studio, is made for exactly this kind of contract.

## USDC is the gas token

On most chains a runner needs one token for gas and another to be paid in. On Arc, USDC pays the fee. A wallet that holds only USDC can press Run payday, receive the tip, and keep the change. The tip and the fee are in the same unit, so the arithmetic is easy to check.

A run on the demo payroll (3 payees) used 185,555 gas on mainnet, which cost about 0.004 USDC at the price that day. The tip is 0.01 USDC. That gap is what makes it worth pressing for a stranger.

There is one thing to keep straight. Arc shows the native balance with 18 decimals, and the USDC token contract at `0x3600000000000000000000000000000000000000` shows the same money with 6 decimals. Ooyaa's contracts use only the 6-decimal token interface. Every amount in the docs, in the contracts and in the app is in that form, where 1 USDC is 1,000,000 units.

## Fast finality

Arc finalises blocks in under a second, and a block that is confirmed is final. For payroll that matters in two places. The app can tell you "paid" as soon as one confirmation arrives, and the proof page does not have to wait out a reorg window before it trusts a payment.

Time on the chain is the block timestamp, with one-second granularity. The contract's clock and the app's countdowns both use it. The app reads the latest block's time instead of the browser's clock, so a visitor with a wrong laptop clock still sees the right countdown.

## Sized for Arc's limits

A payday pays every payee in one transaction, so the cost of a run has to stay bounded. Each payee's transfer gets at most 110,000 gas, which is more than twice the cost of a real USDC transfer to a fresh address on Arc (measured at about 53,000 gas of execution on both networks). The contract is sized so that a run of 100 payees, even if every transfer burned its whole budget, stays under 16,777,216 gas, the per-transaction cap the contract is written against.

In practice a run is much cheaper. In our fork tests against Arc state, a 100-payee run used about 4.3 to 5.0 million gas, depending on how many payee addresses were fresh.

## Built and tested in Arc Studio

Arc Studio is Circle's coding agent for Arc. You describe what you want, and it writes and tests the smart contracts and builds the app around them. Every contract, test and screen in this repository was written by Arc Studio from written prompts. The prompts are in the `prompts/` folder.

The people behind Ooyaa read what Studio wrote, ran its tests again on their own machine, attacked the code on purpose, and sent each finding back to Studio as the next prompt. Studio deployed the contracts to Arc testnet. The mainnet deploy was made from the same source by the Ooyaa team, outside Studio, and then proven to be the same code. See [Verify it yourself](/docs/verify) for how that proof works, and the [Studio project](https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f) for the build history.

## The same USDC address on both networks

USDC sits at `0x3600000000000000000000000000000000000000` on Arc mainnet and on Arc testnet. Because the contracts hard-code that address and use no immutable values, the bytecode on mainnet is identical to the bytecode on testnet. That is what lets the proof page say "same code" and mean it byte for byte.

## Two quirks the proof page handles

Arc records every USDC transfer twice in the logs: once from the token contract (6 decimals) and once from a system address (18 decimals). If you add both up you count every payment twice. The proof page and the CLI read only the token contract's logs.

Arc's public RPC caps `eth_getLogs` at 10,000 blocks per query and rate limits busy clients. The proof tooling pages through history in chunks and retries on rate limits, and the proof page falls back between two public nodes. If a read still fails, it says so instead of showing zeros.
