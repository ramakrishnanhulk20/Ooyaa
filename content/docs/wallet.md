---
title: Get a wallet
group: start
---

To press Run payday you need a wallet on Arc mainnet and a little USDC in it. On Arc, USDC is also the gas token, so the same balance pays for the transaction and receives the tip. You do not need any other token.

## What the app supports

The app connects to browser wallets that add themselves to the page, which means an extension installed in your browser. It does not ask for your seed phrase, your private key or a password, and it has no server that could store them. Your wallet shows each transaction and you approve it yourself.

If a page or a message ever asks you to type a seed phrase to use Ooyaa, it is not Ooyaa. Close it.

## Step 1: install a wallet

Install a browser wallet extension and create a new wallet. Write the recovery phrase on paper and keep it offline. Use a fresh wallet for experiments, with only a few dollars in it.

## Step 2: add Arc mainnet

The app has a Switch to Arc button that asks your wallet to change network. If your wallet does not know Arc yet, add it by hand with these values.

| Field | Value |
|---|---|
| Network name | Arc |
| Chain ID | 5042 |
| RPC URL | `https://rpc.mainnet.arc.io` |
| Currency symbol | USDC |
| Block explorer | `https://explorer.arc.io` |

Your wallet may show the balance with 18 decimals or with 6. Both are the same USDC. On Arc the native balance uses 18 decimals, and the USDC token contract at `0x3600000000000000000000000000000000000000` shows the same money with 6 decimals. Ooyaa amounts always use the 6-decimal form.

## Step 3: put a little USDC on Arc

A payday costs about 0.004 USDC in gas for a 3-payee run, so 0.05 USDC covers a dozen tries. Check the [Arc documentation](https://docs.arc.io) for the current ways to bring USDC onto Arc. Send it to your wallet's address, which is the same on every EVM network.

Check the balance in your wallet with Arc selected. If it shows 0, the app will say "Your wallet needs a little USDC on Arc for gas, about 0.004 USDC."

## Testnet

The contracts are also deployed on Arc testnet (chain 5042002, explorer `https://explorer.testnet.arc.io`, RPC `https://rpc.testnet.arc.io`). The web app sends transactions on mainnet only. Testnet is there so the same code can be checked against it, which the [proof page](/proof) does.
