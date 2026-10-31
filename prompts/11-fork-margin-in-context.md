STUDIO PROMPT 11: pin the C35 margin on real USDC, in run()'s own context

GOAL: Turn 10 works. We ran it ourselves on forge 1.8.5 and on Arc Foundry, with and without --isolate. Every unit and invariant test passes in both modes, and every fork test passes on Arc Testnet and Arc Mainnet state but one: test_fork_TransferCostHasTwoXMargin. TransferMeter measures 57,302, and 2 x 57,302 > 110,000. That figure counts costs the payee budget never pays: the caller's cold access to the USDC address, the extcodesize check and the ABI handling. This turn replaces the measurement with the exact-gas technique you used in turn 10. It changes PayrollFork.t.sol only.

What we measured (binary search on the smallest forwarded gas that makes a real USDC.transfer to a fresh address succeed, same on both networks):
- in run()'s context, where the caller has just read its own USDC balance (Payroll.run() always does this in its Underfunded check before the first payee), with every call cold (--isolate): 48,561;
- the same with a warm frame: 43,990.
So half the budget, 55,000, is enough for the coldest transfer run() can make. That is the C35 rule: the budget is at least twice the real need.

PRESET: max preset (full audit and tests).

CHANGES (contracts/test/PayrollFork.t.sol only)
1. Replace TransferMeter with RunContextTransfer, whose one function is
   tryInRunContext(address to, uint256 g) external returns (bool ok).
   It first reads USDC.balanceOf(address(this)), as run() does. Then it calls address(USDC).call{gas: g}(abi.encodeCall(IERC20.transfer, (to, 1))) and returns ok. No gasleft() arithmetic.
2. Rewrite test_fork_TransferCostHasTwoXMargin:
   - deploy RunContextTransfer and fund it through _fundUSDC;
   - with a fresh address, tryInRunContext(fresh, 55_000) must return true (55,000 is half of PAYEE_TRANSFER_GAS);
   - with another fresh address, tryInRunContext(fresh2, 30_000) must return false, so the check is not vacuous.
   - Its comment states the rule and the measured figures above, in two or three lines.
3. The test must pass with and without --isolate.

DO NOT
- Do not change any other file. Payroll.sol and PaydayFactory.sol are deployed and verified.
- Do not deploy anything. No transactions this turn.
- Do not create any Circle API key, entity secret, wallet or other credential.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.

REPORT BACK
- That the file compiles, and the full unit and invariant suite still passes.
- Whether your sandbox could run the fork test against Arc. We will run it ourselves on both networks and both modes.
- Confirmation that every file other than PayrollFork.t.sol is unchanged.
