# Ooyaa spec for Studio turn 08: restore the fork tests, close the fuzz coverage gaps, remove dashes

Turn 07's contract changes are correct, and our local build matches both new testnet contracts byte for byte. Three things went wrong in the tests, found when we re-ran turn 07 on our machine (forge 1.8.5):
1. contracts/test/PayrollFork.t.sol was saved as one truncated line: `// SPDX-License-Iden...(argument truncated)`. All five turn 06 fork tests were lost, and none of turn 07 item 17 was written. The build only showed a pragma warning, so it went unnoticed.
2. test_RealisticTransferGasInRange fails here: "first transfer above 65k: 86259 > 65000".
3. In the invariant run, the last-sequence log shows sc_claim, sc_updatePayee and sc_removePayee at 0, and sc_addPayee and sc_close at 0 or 1, at seeds 1, 2 and 3. The fuzzer almost never exercises payee changes or claims, so the invariants say little about them.

WRITE RULE, for every file this turn: write large files in several smaller edits. After each write, check the file: no line may contain "(argument truncated)", and its line count must be what you expect. A file that fails either check is a failed write. Redo it before moving on.

ITEM A. Restore and finish the fork tests (contracts/test/PayrollFork.t.sol)
A1. Before this turn ran, we placed your own turn 06 version back at contracts/test/PayrollFork.t.sol (258 lines). Start from it and edit it in place. Do not rewrite it in one write.
A2. test_fork_SelfdestructCredit makes a plain ERC-20 transfer and never selfdestructs. Replace that with a real one:
   - fund the test with real USDC;
   - deploy a small contract with value 5e12 + 7 wei whose constructor selfdestructs to the payroll. On Arc, native USDC has 18 decimals and the ERC-20 view has 6, so this credit is 5 units plus 7 wei of dust;
   - assert balanceOf(payroll) and freeBalance() each rise by exactly 5, and owed() is unchanged;
   - then run(), withdraw(freeBalance()) and close() must all succeed.
A3. test_fork_SinglePayeeTransferGas and test_fork_HundredPayeeRunGas never assert that anyone was paid, so an all-deferred run passes both. Assert the payee balances rose, the PayslipIssued count (1, then 100) and 0 PayoutDeferred.
A4. New test_fork_TransferCostHasTwoXMargin (rule C35): measure one real USDC.transfer to a fresh address, using gasleft() before and after. Assert 2 x that cost is at most 110_000. Log the cost with emit log_named_uint.
A5. test_fork_BlocklistedPayeeDeferred returns early, and passes, when it cannot blocklist. Make it fail with a clear message instead.
A6. Proof: `forge test --list --match-path contracts/test/PayrollFork.t.sol` lists exactly these six tests: test_fork_ZeroTipPayroll, test_fork_SinglePayeeTransferGas, test_fork_HundredPayeeRunGas, test_fork_SelfdestructCredit, test_fork_BlocklistedPayeeDeferred, test_fork_TransferCostHasTwoXMargin. They need Arc's USDC precompile. If your sandbox cannot run them against Arc Testnet, say so; we run them ourselves with Arc Foundry.

ITEM B. RealisticERC20 cost (contracts/test-helpers/RealisticERC20.sol, contracts/test/Payroll.t.sol)
B1. We measured on forge 1.8.5: with your two padding writes (_scratchA and _scratchB) a transfer costs 86,259 gas. With only _scratchA it costs 64,087, for both the first and the repeat transfer. Remove _scratchB, so one padding write remains.
B2. In test_RealisticTransferGasInRange, widen the accepted range to 40,000 to 70,000, so it holds across Foundry versions. Keep both emit log_named_uint lines.
B3. Report your forge version (`forge --version`) and the two logged values. Every test that uses RealisticERC20 must still pass, including test_LowGasRunRevertsNeverDefers_Realistic.

ITEM C. Fuzz coverage (contracts/test/PayrollInvariant.t.sol)
The class of bug: a handler that almost never succeeds, so the invariants never see its effects. Fix every instance, including any not listed here.
C1. claim(address who): choose who from knownPayees (index = a fuzzed uint modulo knownPayees.length), not a fuzzed address. Keep claimNothing on fuzzed addresses.
C2. close(): make it rare, so most of each sequence runs on an open payroll. Close only when a fuzzed uint satisfies value % 25 == 0, and keep the sc_run > 0 gate.
C3. Payee changes need every started period paid. Bound warpForward to at most one periodLength per call (today it is up to five), so runs can keep up with time.
C4. New deterministic test in the same file, test_HandlerCoverage. Drive the handler through one fixed sequence that makes every valid handler succeed at least once: fund, warpForward, run, blockPayee, warpForward, run, unblockPayee, claim, withdraw, addPayee, updatePayee, removePayee, startTransfer, cancelTransfer, startTransfer, acceptTransfer, close. Then assert each of the 12 sc_* counters is at least 1, and unexpectedRevert, forbiddenSucceeded and employerGrewShortfall are 0. This proves no valid handler has preconditions that can never be met.
C5. Keep afterInvariant() logging the counters, not asserting them. Its comment must say that Foundry calls it after every run, so the values are from one sequence.
C6. Report the last-sequence log at the default seed and at --fuzz-seed 1, 2, 3 and 4. Target: every counter above 0. If one is still 0, say which one and why.

ITEM D. Small fixes
D1. test_WorstCaseHundredBurningPayeesFitsTxCap: also assert the runner received the tip. Its comment says so, but no assert checks it.
D2. Remove every em-dash (U+2014) and en-dash (U+2013) from every file under contracts/: Payroll.sol, every test, every helper and contracts/test-integration. Rewrite the sentence with a full stop, a colon, commas or the word "to"; never swap in a hyphen.
   - Payroll.sol has one em-dash, in the PAYEE_GAS_RESERVE comment, and en-dashes in the _tryPayUsdc comment. Change comments only, no code.
   - Proof: grep for both characters under contracts/ returns nothing.

SEEDS
Run the full suite, then the invariant suite at the default seed and at --fuzz-seed 1, 2, 3 and 4. Report each result.

KEEP
Every existing test and assertion not named here.
