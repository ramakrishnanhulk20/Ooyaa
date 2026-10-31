---
title: Quick start
group: start
---

You can run a real payday on Arc mainnet in about two minutes. It costs a few thousandths of a USDC in gas, and the demo payroll pays you a 0.01 USDC tip for doing it.

## Run a payday

You need a browser wallet with a little USDC on Arc. If you do not have one yet, follow [Get a wallet](/docs/wallet) first. About 0.05 USDC is plenty.

1. Open the [home page](/). The card on the right is the demo payroll. It shows the next payday, how many paydays it is funded for, and three payslips.
2. Read the card. When a payday is due, the header says Payday due (or N paydays due if several are waiting) and the line under the button says "Earn a 0.01 USDC tip for running it."
3. Press Run payday. If no wallet is connected, the card says "Connect a wallet to run payday. You will sign once." and opens the connect dialog. Connect, then press the button again. If your wallet is on another network, the button reads Switch to Arc.
4. Before anything reaches your wallet, the app asks the contract whether the run would succeed. If it would not, you see why and nothing is sent.
5. Approve the transaction in your wallet. The button reads "Waiting for your wallet..." and then "Paying 3 people...".
6. The three payslips are stamped PAID. The card shows a line like "Period 0039 paid: 0.03 USDC to 3 people, and your 0.01 USDC tip." A message pops up with a View on explorer link to your transaction.

The network fee for a 3-payee run is about 0.004 USDC. The tip is 0.01 USDC, so you end up a little ahead.

## Try to run it twice

Press the button again. If another period is already waiting, that one runs next, because missed paydays are paid one per transaction in order.

When nothing is due, the button reads Run payday again. Press it and the card answers "Refused by the contract: this payday is already paid. Nothing was signed." The contract checks this before your wallet is asked for anything. That is the rule the contract enforces: each period is paid once.

## See your run on the proof page

Open the [proof page](/proof). It reads Arc in your browser and shows the eight checks, the totals, every USDC movement, and a list of the wallets that have run payday. A wallet that is neither the employer nor a payee counts as outside. After your run, click Run again on the proof sheet to re-read the chain, and your wallet should appear in the list.

You can also check from a terminal. See [Verify it yourself](/docs/verify).

## Create your own payroll

Once you have run the demo, make a payroll of your own: two or three of your own wallets, a short pay period such as 2 minutes, and a few cents each. Fund it, wait for the first period to start, then run it from a different wallet and watch the tip arrive. The steps are in [Create a payroll](/docs/create-payroll).
