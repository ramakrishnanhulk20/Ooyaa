STUDIO PROMPT 01: core payroll slice

GOAL: A minimal USDC payroll contract on Arc that pays its payees once per period, strictly in order, and pays a small tip to whoever runs it, with Foundry tests, deployed to Arc Testnet and run once there.

PRESET: max preset (full audit and tests).

BUILD

One contract, contracts/Payroll.sol, Solidity 0.8.28. Keep the scaffold's foundry.toml as it is (evm_version paris).

Token
- USDC through its ERC-20 interface at 0x3600000000000000000000000000000000000000, held as a constant (6 decimals).
- Every USDC movement uses OpenZeppelin SafeERC20.
- No payable functions, no receive or fallback, and never send native value.

No immutables. Every setting lives in storage, so every deployment of this contract has identical runtime bytecode.

constructor(address[] memory payees, uint256[] memory amounts, uint64 startTime, uint64 periodLength, uint256 tipPerRun)
- Sets employer = msg.sender.
- Reverts with a named custom error unless all of these hold:
  - the arrays have the same length;
  - there are 1 to 100 payees;
  - every payee is non-zero, unique (checked with a mapping, not a loop over the list), not address(this), and not the USDC address;
  - every amount is above 0 and at most 1_000_000e6;
  - startTime is at least block.timestamp and at most block.timestamp + 365 days;
  - periodLength is at least 60 seconds and at most 366 days;
  - tipPerRun is at most 10e6.

Storage
- employer, startTime, periodLength, tipPerRun
- the payees array and amountOf(address)
- periodTotal, the sum of all amounts
- nextUnpaid, a uint256 that starts at 0

Periods
- Period n starts at startTime + n * periodLength.
- startedPeriods() returns 0 before startTime, otherwise (block.timestamp - startTime) / periodLength + 1.

Owed
- owed = (startedPeriods() - nextUnpaid) * (periodTotal + tipPerRun).
- Computed by one internal function, _owed(), and used by withdraw, freeBalance and every view that depends on it.
- The tip is inside owed.

Functions
- fund(uint256 amount): anyone may call. Pulls amount from msg.sender with safeTransferFrom (only ever from msg.sender). Emits Funded(from, amount). Reverts on amount 0.
- run(): pays the next unpaid period. nonReentrant (OpenZeppelin ReentrancyGuard). In this order:
  1. Revert NothingDue if nextUnpaid >= startedPeriods().
  2. Revert Underfunded if the USDC balance is below periodTotal + tipPerRun.
  3. Set period = nextUnpaid, then nextUnpaid += 1, before any transfer.
  4. Transfer each payee their amount and emit PayslipIssued(payee, period, amount) for each.
  5. Transfer tipPerRun to msg.sender.
  6. Emit PaydayRun(period, msg.sender, periodTotal, tipPerRun).
- withdraw(uint256 amount, address to): employer only. Requires to != address(0) and amount <= freeBalance(). Transfers, then emits Withdrawn(to, amount).

Views (none may ever revert)
- freeBalance(): balance - owed when the balance exceeds owed, else 0.
- owed(): the public view of _owed().
- dueNow(): true when nextUnpaid < startedPeriods().
- periodStart(uint256 n)
- nextPayday(): the start time of period nextUnpaid.
- runway(): how many unpaid periods (already started or still to come) the balance covers, which is balance / (periodTotal + tipPerRun).
- getPayees(): returns (address[] memory, uint256[] memory).

Events
- Funded(address indexed from, uint256 amount)
- PayslipIssued(address indexed payee, uint256 indexed period, uint256 amount)
- PaydayRun(uint256 indexed period, address indexed runner, uint256 total, uint256 tip)
- Withdrawn(address indexed to, uint256 amount)

NatSpec on every public and external function: what it does, what reverts, what it emits.

RULES (from our threat model; the code must uphold each one)
- C1: USDC leaves the contract only to payees for a started period, as the tip to the caller of a successful run, or to an address the employer names, and then only out of freeBalance.
- C2: owed is defined once, in _owed(). No employer call can take the balance below owed. A started, funded period can always be run.
- C4: each period is paid at most once, and runs go strictly in order through nextUnpaid.
- C6: there is no loop over periods. The only loop is over the payees, at most 100.
- C7: every input listed above is checked, each with its own named custom error.
- C8: correctness never depends on the balance equalling the books. USDC sent straight to the contract can only raise freeBalance.
- C9: employer checks compare msg.sender with the stored employer. No tx.origin anywhere.

TESTS TO WRITE

Put the tests in contracts/test/Payroll.t.sol, using forge-std. In local tests, put a mock ERC-20 at 0x3600000000000000000000000000000000000000 with vm.etch so the constant address works. The file opens with a short comment that says what it does not cover.

1. test_RunPaysEveryPayeeOnce: one run pays each payee exactly their amount and emits one PayslipIssued per payee.
2. test_SecondRunSamePeriodReverts: a second run in the same period reverts NothingDue and moves no USDC.
3. test_RunBeforeStartReverts: a run before startTime reverts NothingDue.
4. test_RunsGoInOrder: after three period starts, three runs pay periods 0, 1 and 2 in that order, and a fourth run reverts.
5. test_TipGoesToCaller: the caller of a run receives tipPerRun, and nobody else receives it.
6. test_UnderfundedRunReverts: with less than periodTotal + tipPerRun in the contract, run reverts Underfunded.
7. test_EmployerCannotWithdrawOwed: fund three periods, warp past three period starts without running, then withdraw(freeBalance()). Afterwards all three runs still succeed.
8. test_WithdrawLeavesTipCovered: fund exactly periodTotal + tipPerRun, warp to the first period. freeBalance() is 0, withdraw(1) reverts, and run succeeds.
9. test_OnlyEmployerWithdraws: withdraw from any other address reverts.
10. test_ConstructorRejects..., one test per constructor rule above: length mismatch, 0 payees, 101 payees, zero payee, duplicate payee, payee equal to the USDC address, amount 0, amount over the cap, startTime in the past, startTime beyond the horizon, periodLength under 60, periodLength over 366 days, tip over the cap.
11. test_DirectTransferOnlyRaisesFreeBalance: USDC sent straight to the contract raises freeBalance and changes nothing else.
12. testFuzz_NeverPaysAPeriodTwice: random warps and random runs. For every period and payee, the total paid never exceeds that payee's amount.
13. Invariant tests, with a handler that calls fund, run and withdraw (as the employer and as random addresses) and warps time:
    - invariant_PaidMatchesRuns: the total paid to payees equals periodTotal * nextUnpaid.
    - invariant_WithdrawOnlyFromFree: total withdrawn never exceeds total funded plus direct transfers, minus what was paid and owed at the moment of each withdraw. In practice: the handler records freeBalance() before each successful withdraw and asserts the amount never exceeded it.

Run every test in the sandbox with forge test and report the count.

DO NOT
- Do not build or change the web app in this turn. Leave src/ exactly as the scaffold made it.
- No owner other than the employer, no pause, no upgradeability or proxy, no fees, no admin functions, no selfdestruct, no delegatecall, no inline assembly.
- No factory, no payee changes, no close, no deferred claims for a payee whose transfer fails. Those come in the next turn. In this turn a payee transfer that reverts makes the run revert.
- Do not add features, fees or rules that are not written here.

DEPLOY
1. Deploy Payroll to Arc Testnet from your managed deployer wallet with:
   - payees: [the deployer wallet's address, 0x1111111111111111111111111111111111111111]
   - amounts: [10000, 10000] (0.01 USDC each)
   - startTime: deployment time + 120 seconds
   - periodLength: 120
   - tipPerRun: 1000 (0.001 USDC)
2. Fund it with 100000 (0.1 testnet USDC) from the deployer wallet: approve exactly 100000, then fund(100000).
3. Once period 0 has started, call run() once.
4. Call run() again in the same period and confirm it reverts with NothingDue.

REPORT BACK
- The number of tests, and the name of each.
- The audit and review findings, with their severity.
- The deployed address, and the transaction hashes for the deploy, the fund and the run.
- The compiler settings: solc version, optimizer on or off and its runs, evm_version.
- The path of the compiled Payroll artifact.
