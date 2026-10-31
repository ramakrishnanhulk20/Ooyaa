STUDIO PROMPT 10: gas tests that hold in every Foundry mode

GOAL: Turn 09's money logic passes every check we ran, on Arc Testnet and Arc Mainnet state. Its gas tests do not hold up. Foundry can run each top-level call in a test as its own transaction (forge test --isolate, and the default in Foundry 1.8), which starts every call cold, as the chain does. Your forge 1.7.1 shares one warm frame by default. Three gas tests give different answers in the two modes, and one of them pins nothing. This turn changes test helpers and tests only, so that every gas assertion holds in both modes.

What we measured (arc-forge 1.7.1, same tests, with and without --isolate):
- test_BudgetCoversTwiceRealTransfer passes shared but fails isolated ("1 != 2"): the 80,000 burn plus a cold transfer exceeds 110,000. Shared, it also passes at a 100,000 budget, so it does not pin the budget.
- test_RealisticTransferGasInRange: 26,319 shared, 64,087 isolated.
- test_fork_TransferCostHasTwoXMargin: 46,333 shared, 74,189 isolated, which fails 2x <= 110,000. Isolated, a gasleft() difference around a top-level call includes the 21,000 transaction cost, which a payee transfer inside run() never pays.

PRESET: max preset (full audit and tests).

CHANGES
1. GasBurnAtTarget.sol, transfer() to burnTarget: record gasleft() at entry, do the normal transfer first, then spin until the gas spent since entry is at least TARGET_TOTAL = 106_500, and return true. With the burn last, the call costs about 106,500 whatever the transfer's own cost or warmth. Replace BURN_COST with TARGET_TOTAL, and fix the comments.
2. test_BudgetCoversTwiceRealTransfer: keep its payroll assertions. Add two direct calls to the mock's transfer to burnTarget, from an account holding mock tokens: call{gas: 110_000} must succeed, call{gas: 100_000} must fail. Fix its comment block.
3. RealisticERC20.sol: use the same burn-last technique, with TARGET_TOTAL = 50_000, close to a real Arc USDC transfer to a fresh address (about 53,000). Remove the padding-slot approach.
4. test_RealisticTransferGasInRange: replace the gasleft() measurement with exact gas limits. call{gas: 49_000} must fail, call{gas: 56_000} must succeed. Rename it test_RealisticTransferCostsAbout50k.
5. test_fork_TransferCostHasTwoXMargin: measure inside one call frame. Add a small TransferMeter contract in the fork test file. Its measure(address to) reads gasleft(), calls USDC.transfer(to, 1), reads gasleft() again and returns the difference. Fund it with vm.deal and call it from the test. Assert 2 x the returned cost <= 110_000 and log it.
6. PayrollInvariant.t.sol, _modelStartedPeriods: it uses closedAtGhost > 0 to mean "closed". Add a bool closedGhost, set when the close handler's close() succeeds, and cap on that instead.
7. Proof, both modes: run the full unit and invariant suite twice, once with `forge test` and once with `forge test --isolate`. Every test must pass in both. Report both counts and the item 5 cost if your sandbox can fork Arc; otherwise say so.
8. Prove item 2 bites, on a scratch copy, then discard it: with PAYEE_TRANSFER_GAS at 100_000, test_BudgetCoversTwiceRealTransfer fails in both modes.

DO NOT
- Do not change contracts/Payroll.sol or contracts/PaydayFactory.sol in any way. Their bytecode is deployed and verified.
- Do not deploy anything. No transactions this turn.
- Do not change anything else.
- Do not create any Circle API key, entity secret, wallet or other credential.

WRITE RULE: after each write, no line may contain "(argument truncated)", and the line count must be what you expect.

REPORT BACK
- The test counts in both modes, and the invariant suite result at the default seed and at --fuzz-seed 1, 2, 3 and 4.
- The direct-call results from items 2 and 4.
- The scratch-copy result from item 8.
- Confirmation that Payroll.sol and PaydayFactory.sol are byte-identical to the start of the turn.
