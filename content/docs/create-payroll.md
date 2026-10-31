---
title: Create a payroll
group: guides
---

Creating a payroll means calling `createPayroll` on the factory. The caller becomes the employer. The new payroll starts empty, so it needs USDC before it can pay anyone.

Salaries are public. Every payee address and amount you enter is stored on Arc and cannot be hidden later. Use small amounts while you are learning, and never put money in that you cannot afford to lose. Ooyaa has not been audited. See [Limits](/docs/limits).

## What you decide

| Setting | Meaning | Allowed |
|---|---|---|
| Payees | The wallets to pay, in the order they will be paid | 1 to 100, each different, none empty, none the USDC contract, none the payroll itself |
| Amounts | USDC per payee per period, in 6-decimal units (10000 is 0.01 USDC) | At least 1 unit, at most 1,000,000 USDC each |
| First payday | When period 0 starts, as a Unix timestamp | From now to 365 days ahead |
| Period length | Seconds between paydays | 60 seconds to 366 days |
| Tip | USDC paid to whoever runs each payday | 0 to 10 USDC |

Each payroll belongs to the wallet that creates it. Nobody else, including the Ooyaa team, has any say over it.

## In the app

Open the Create page from the top navigation, or use the link under the home page's hero. You will:

1. Enter each payee's address and amount. The page checks every field as you type and shows what is wrong, for example a duplicate address or an amount above the limit.
2. Choose how often to pay and when the first payday is. For a first try, pick a 2-minute period and a first payday 2 minutes away.
3. Set the tip. The default is 0.01 USDC.
4. Choose how many paydays to fund now.
5. Create the payroll, allow the payroll to pull the USDC (the exact amount, never unlimited), and fund it. That is up to three signatures. Each step is simulated first, and a refusal is shown in plain words before anything is signed.

When it is done you land on `/p/<your payroll address>`, which shows the live card with its countdown. Keep about 0.02 USDC extra in the wallet for gas.

The first payday time is computed from the latest block's timestamp, not from your computer's clock. If you take too long to sign, the factory can refuse the payroll with `StartTimeTooEarly`. Pick a start a few minutes ahead and try again.

## From a terminal

You can do the same with Foundry's `cast`. The values below make a 2-payee payroll that pays every 2 minutes, starting in 5 minutes, with a 0.01 USDC tip.

```bash
FACTORY=0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b
RPC=https://rpc.mainnet.arc.io
START=$(( $(cast block latest --field timestamp --rpc-url $RPC) + 300 ))

cast send $FACTORY \
  "createPayroll(address[],uint256[],uint64,uint64,uint256)" \
  "[0xPAYEE_ONE,0xPAYEE_TWO]" "[10000,10000]" $START 120 10000 \
  --rpc-url $RPC --account <your keystore name>
```

Find the new payroll's address in the `PayrollCreated` event of the receipt, or ask the factory:

```bash
cast call $FACTORY "payrollsCreatedBy(address,uint256,uint256)(address[])" \
  <your address> 0 20 --rpc-url $RPC
```

Then fund it. Funding is two transactions: allow, then fund.

```bash
USDC=0x3600000000000000000000000000000000000000
cast send $USDC "approve(address,uint256)" <payroll> <amount> --rpc-url $RPC --account <your keystore name>
cast send <payroll> "fund(uint256)" <amount> --rpc-url $RPC --account <your keystore name>
```

## How much to fund

Each period costs the sum of the payee amounts plus the tip. For the example above that is 10000 + 10000 + 10000 = 30000 units (0.03 USDC). Funding 5 paydays is 150000 units (0.15 USDC).

`fund` pulls the money from the wallet that calls it, so approve exactly the amount you fund. After funding, the payroll's `runway` shows how many paydays the free balance covers.

## After it is live

- Wait for the first period to start, then run it from a different wallet to see the tip arrive. See [Run a payday](/docs/run-payday).
- Top up any time with `fund`. Anyone can fund a payroll.
- Take back money you do not need with `withdraw(amount)`. You can only withdraw the free balance, which excludes anything owed for started periods.
- Change the payee list with `addPayee`, `updatePayee` and `removePayee`, but only when every started period has been paid. The change applies from the next period.
- Stop for good with `close()`. Periods that had already started still run.
- Hand the payroll to another address with `transferEmployer` and `acceptEmployer`.

The full list of functions, with what each one reverts on, is in [Contracts](/docs/contracts).

## Mistakes to avoid

- Check every payee address twice. Money paid to a wrong address cannot be recovered, and the contract has no way to know who owns an address.
- Do not use an address you do not control as a payee while testing.
- If creation reverts, the error name tells you which rule you broke. [Contracts](/docs/contracts) lists each one in plain words.
- Creating a payroll costs gas that grows with the number of payees. The 3-payee demo payroll used 2,057,305 gas.
