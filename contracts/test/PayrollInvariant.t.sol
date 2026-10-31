// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Does not cover: multi-payroll interactions, cross-contract invariants.

import {Test, Vm} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {Payroll} from "../Payroll.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Handler
//
// Valid calls succeed; a failure increments unexpectedRevert.
// Forbidden calls must always revert; a success increments forbiddenSucceeded.
// Ghost shortfall tracks that no employer call increases the gap between
// owed() and the payroll's token balance.
//
// Per-handler success counts are reported for audit (item 9).
// ─────────────────────────────────────────────────────────────────────────────
contract PayrollHandler is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    MockERC20 internal usdc;
    Payroll   internal payroll;

    address internal employer;
    address[] internal knownPayees;

    // ── ghost accounting ──────────────────────────────────────────────────────
    uint256 public totalFunded;
    uint256 public totalPaid;
    uint256 public totalDeferred_ghost;
    uint256 public totalClaimed;
    uint256 public totalWithdrawn;
    uint256 public periodsPaid;
    uint256 public sumScheduledPeriods;

    // ── correctness counters ──────────────────────────────────────────────────
    /// @notice incremented when a forbidden call succeeds (invariant: must stay 0)
    uint256 public forbiddenSucceeded;
    /// @notice incremented when a guaranteed-success call reverts (invariant: must stay 0)
    uint256 public unexpectedRevert;
    /// @notice incremented when an employer call grows the shortfall (invariant: must stay 0)
    uint256 public employerGrewShortfall;
    /// @notice incremented when run is skipped even though the payroll is funded
    ///         for at least what the model says it owes (invariant: must stay 0)
    uint256 public runBlockedWhileFunded;
    /// @notice incremented when an event mismatch is detected in the run handler
    ///         (C12: PayslipIssued must pair with a Transfer, PayoutDeferred must not)
    uint256 public eventMismatch;

    // ── item 2 ghost: startedPeriods model ──────────────────────────────────
    /// @notice Raw started-periods count captured at the moment close() succeeds.
    ///         0 means the payroll has not been closed yet (or was never closed).
    uint256 public closedAtGhost;
    bool    public closedGhost;    // item 6: true once close() succeeds

    // ── per-handler success counts ────────────────────────────────────────────
    uint256 public sc_fund;
    uint256 public sc_run;
    uint256 public sc_withdraw;
    uint256 public sc_claim;
    uint256 public sc_addPayee;
    uint256 public sc_updatePayee;
    uint256 public sc_removePayee;
    uint256 public sc_close;
    uint256 public sc_startTransfer;
    uint256 public sc_acceptTransfer;
    uint256 public sc_cancelTransfer;
    uint256 public sc_blockPayee;
    uint256 public sc_unblockPayee;
    uint256 public sc_warpForward;

    /// @param _paidInSetUp     USDC paid to payees by setUp's pre-run (ghost seed).
    /// @param _deferredInSetUp USDC added to totalDeferred by setUp's pre-run (ghost seed).
    /// @param _periodsInSetUp  Number of periods setUp ran (ghost seed).
    /// @param _periodTotalAtRun periodTotal at the time of setUp's run (ghost seed).
    constructor(
        Payroll _payroll,
        MockERC20 _usdc,
        address _employer,
        address[] memory initialPayees,
        uint256 _paidInSetUp,
        uint256 _deferredInSetUp,
        uint256 _periodsInSetUp,
        uint256 _periodTotalAtRun
    ) {
        payroll  = _payroll;
        usdc     = _usdc;
        employer = _employer;
        for (uint256 i = 0; i < initialPayees.length; i++) {
            knownPayees.push(initialPayees[i]);
        }
        // Seed ghost accounting to match setUp's pre-run so C1/C4/C5 hold from t=0.
        totalPaid           = _paidInSetUp;
        totalDeferred_ghost = _deferredInSetUp;
        periodsPaid         = _periodsInSetUp;
        sumScheduledPeriods = _periodsInSetUp * _periodTotalAtRun;
    }

    // ── item 2 / item 6: model for startedPeriods ────────────────────────────
    // Computes started periods from the clock, independently of the contract.
    // After close, caps at closedAtGhost.  Uses closedGhost (bool) to detect
    // closed state instead of closedAtGhost > 0, which is ambiguous when the
    // payroll was closed before any period started (closedAtGhost would be 0).
    function _modelStartedPeriods() internal view returns (uint256) {
        uint64 startTime = payroll.startTime();
        uint64 periodLen = payroll.periodLength();
        uint256 raw;
        if (block.timestamp < startTime) {
            raw = 0;
        } else {
            raw = (block.timestamp - startTime) / periodLen + 1;
        }
        if (closedGhost && raw > closedAtGhost) {
            return closedAtGhost;
        }
        return raw;
    }

    // ── item 1: model for owed ────────────────────────────────────────────────
    // Computes owed independently: unpaid * (periodTotal + tipPerRun) + sum(claimable).
    // Uses _modelStartedPeriods() so it does not read payroll.owed().
    function _modelOwed() internal view returns (uint256) {
        uint256 sp     = _modelStartedPeriods();
        uint256 np     = payroll.nextUnpaid();
        uint256 unpaid = sp > np ? sp - np : 0;
        uint256 base   = unpaid * (payroll.periodTotal() + payroll.tipPerRun());
        uint256 sumClaim = 0;
        for (uint256 i = 0; i < knownPayees.length; i++) {
            sumClaim += payroll.claimable(knownPayees[i]);
        }
        return base + sumClaim;
    }

    // ── item 4: ghost shortfall using model ──────────────────────────────────
    // Item 4: replace payroll.owed() with the model so the shortfall check is
    // independent of the code under test.
    function _shortfall() internal view returns (uint256) {
        uint256 o   = _modelOwed();
        uint256 bal = usdc.balanceOf(address(payroll));
        return o > bal ? o - bal : 0;
    }

    // ── fund ─────────────────────────────────────────────────────────────────
    // Preconditions: amount > 0 (bound enforces this); employer must not be
    // blocklisted (the token correctly refuses the transferFrom, C34).
    function fund(uint256 rawAmt) external {
        uint256 amt = bound(rawAmt, 1, 1_000_000e6);
        // A blocklisted employer cannot transferFrom. Correct C34 behaviour.
        if (usdc.blocklisted(employer)) return;
        usdc.mint(employer, amt);
        vm.prank(employer);
        usdc.approve(address(payroll), amt);
        vm.prank(employer);
        try payroll.fund(amt) {
            totalFunded += amt;
            sc_fund++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── run ──────────────────────────────────────────────────────────────────
    function run() external {
        if (!payroll.dueNow()) {
            // Forbidden: run when nothing is due
            try payroll.run() {
                forbiddenSucceeded++;
            } catch {}
            return;
        }
        uint256 bal = usdc.balanceOf(address(payroll));
        if (bal < payroll.totalDeferred() + payroll.periodTotal() + payroll.tipPerRun()) {
            // Item 3: if the model says the payroll is funded for what it owes,
            // skipping here would hide a bug where run() refuses a funded payroll.
            if (bal >= _modelOwed()) {
                runBlockedWhileFunded++;
            }
            return;
        }
        // Harness fix 2: the handler is msg.sender for run(); if it is blocklisted
        // the tip transfer will fail. That is correct C34 behaviour, not unexpected.
        if (payroll.tipPerRun() != 0 && usdc.blocklisted(address(this))) return;

        vm.recordLogs();
        uint256 periodTotalAtRun = payroll.periodTotal();
        try payroll.run() {
            Vm.Log[] memory logs = vm.getRecordedLogs();
            bytes32 payslipSig   = keccak256("PayslipIssued(address,uint256,uint256)");
            bytes32 deferSig     = keccak256("PayoutDeferred(address,uint256,uint256)");
            // ERC-20 Transfer(address,address,uint256): topic[0] is the sig,
            // topic[1] is `from`, topic[2] is `to`, data is `value`.
            bytes32 transferSig  = keccak256("Transfer(address,address,uint256)");

            uint256 paidThisRun = 0;
            // Item 6 (C12): collect Transfer log entries from the USDC address.
            // Map: recipient => amount transferred (from payroll).
            // We use a fixed-size parallel array for simplicity; size == logs.length is an
            // upper bound since at most one Transfer per log entry.
            address[] memory transferTo  = new address[](logs.length);
            uint256[] memory transferAmt = new uint256[](logs.length);
            uint256 transferCount = 0;
            address payrollAddr = address(payroll);
            address runner = address(this);

            for (uint256 i = 0; i < logs.length; i++) {
                if (logs[i].emitter == USDC_ADDR && logs[i].topics[0] == transferSig) {
                    address from = address(uint160(uint256(logs[i].topics[1])));
                    address to   = address(uint160(uint256(logs[i].topics[2])));
                    uint256 amt  = abi.decode(logs[i].data, (uint256));
                    if (from == payrollAddr) {
                        transferTo[transferCount]  = to;
                        transferAmt[transferCount] = amt;
                        transferCount++;
                    }
                }
            }

            // Item 6: verify event pairing.
            for (uint256 i = 0; i < logs.length; i++) {
                if (logs[i].topics[0] == payslipSig) {
                    address payee = address(uint160(uint256(logs[i].topics[1])));
                    uint256 amt   = abi.decode(logs[i].data, (uint256));
                    paidThisRun  += amt;
                    // Must find a Transfer(payroll -> payee, amt) in the same call.
                    bool found = false;
                    for (uint256 j = 0; j < transferCount; j++) {
                        if (transferTo[j] == payee && transferAmt[j] == amt) {
                            found = true; break;
                        }
                    }
                    if (!found) eventMismatch++;
                } else if (logs[i].topics[0] == deferSig) {
                    address payee = address(uint160(uint256(logs[i].topics[1])));
                    uint256 amt   = abi.decode(logs[i].data, (uint256));
                    totalDeferred_ghost += amt;
                    // Must NOT find a Transfer to that payee.
                    for (uint256 j = 0; j < transferCount; j++) {
                        if (transferTo[j] == payee) {
                            eventMismatch++; break;
                        }
                    }
                }
            }
            // Item 6: if tip is non-zero, exactly one Transfer(payroll -> runner, tipPerRun).
            if (payroll.tipPerRun() != 0) {
                uint256 tipTransfers = 0;
                for (uint256 j = 0; j < transferCount; j++) {
                    if (transferTo[j] == runner && transferAmt[j] == payroll.tipPerRun()) {
                        tipTransfers++;
                    }
                }
                if (tipTransfers != 1) eventMismatch++;
            }

            totalPaid           += paidThisRun;
            periodsPaid         += 1;
            sumScheduledPeriods += periodTotalAtRun;
            sc_run++;
        } catch {
            // Preconditions met but run reverted. Not expected.
            unexpectedRevert++;
        }
    }

    // ── withdraw (valid) ─────────────────────────────────────────────────────
    // Preconditions: freeBalance > 0; employer must not be blocklisted (C34).
    function withdraw(uint256 rawAmt) external {
        uint256 shortBefore = _shortfall();
        uint256 free = payroll.freeBalance();
        if (free == 0) return;
        uint256 amt = bound(rawAmt, 1, free);

        // Harness fix 2: if the employer is blocklisted the token will refuse
        // the transfer. That is correct C34 behaviour, not an unexpected revert.
        if (usdc.blocklisted(employer)) return;

        vm.prank(employer);
        try payroll.withdraw(amt) {
            totalWithdrawn += amt;
            sc_withdraw++;
            // Item 5: count any shortfall growth in its dedicated counter.
            uint256 shortAfter = _shortfall();
            if (shortAfter > shortBefore) {
                employerGrewShortfall++;
            }
        } catch {
            unexpectedRevert++;
        }
    }

    // ── withdraw above freeBalance (forbidden, employer) ─────────────────────
    function withdrawAboveFree_employer(uint256 rawExtra) external {
        uint256 free = payroll.freeBalance();
        uint256 bal  = usdc.balanceOf(address(payroll));
        if (bal <= free) return;
        uint256 extra  = bound(rawExtra, 1, bal - free);
        uint256 badAmt = free + extra;

        vm.prank(employer);
        try payroll.withdraw(badAmt) {
            forbiddenSucceeded++;
        } catch {}
    }

    // ── withdraw from random address (forbidden) ──────────────────────────────
    function withdrawFromRando(uint256 rawAmt, address rando) external {
        if (rando == employer || rando == address(0) || rando == address(payroll)) return;
        uint256 amt = bound(rawAmt, 1, 1_000_000e6);

        vm.prank(rando);
        try payroll.withdraw(amt) {
            forbiddenSucceeded++;
        } catch {}
    }

    // ── claim with nothing to claim (forbidden) ───────────────────────────────
    function claimNothing(address who) external {
        if (payroll.claimable(who) != 0) return;

        vm.prank(who);
        try payroll.claim() {
            forbiddenSucceeded++;
        } catch {}
    }

    // ── claim (valid) ────────────────────────────────────────────────────────
    // C1: pick who from knownPayees (using the fuzzed uint as index) so the
    // fuzzer is directed at addresses that may actually have claimable amounts.
    // claimNothing covers fuzzed-address paths.
    function claim(uint256 seed) external {
        if (knownPayees.length == 0) return;
        address who = knownPayees[seed % knownPayees.length];
        uint256 claimableAmt = payroll.claimable(who);
        if (claimableAmt == 0) return;
        if (usdc.blocklisted(who)) return; // blocked payee cannot claim (safeTransfer would revert)

        vm.prank(who);
        try payroll.claim() {
            totalClaimed += claimableAmt;
            sc_claim++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── payee change while locked (forbidden) ────────────────────────────────
    function payeeChangeWhileLocked(address newPayee, uint256 rawAmt) external {
        if (payroll.closed()) return;
        if (payroll.nextUnpaid() >= payroll.startedPeriods()) return;

        uint256 amt  = bound(rawAmt, 1, 1_000_000e6);
        address safe = (newPayee == address(0) || newPayee == address(payroll) || newPayee == USDC_ADDR)
            ? address(0x9999) : newPayee;

        vm.prank(employer);
        try payroll.addPayee(safe, amt) {
            forbiddenSucceeded++;
        } catch {}

        if (knownPayees.length > 0 && payroll.isPayee(knownPayees[0])) {
            vm.prank(employer);
            try payroll.updatePayee(knownPayees[0], amt) {
                forbiddenSucceeded++;
            } catch {}

            if (payroll.payeeCount() > 1) {
                vm.prank(employer);
                try payroll.removePayee(knownPayees[0]) {
                    forbiddenSucceeded++;
                } catch {}
            }
        }
    }

    // ── payee change after close (forbidden) ─────────────────────────────────
    function payeeChangeAfterClose(address newPayee, uint256 rawAmt) external {
        if (!payroll.closed()) return;

        uint256 amt    = bound(rawAmt, 1, 1_000_000e6);
        address target = (newPayee == address(0)) ? address(0x8888) : newPayee;

        vm.prank(employer);
        try payroll.addPayee(target, amt) {
            forbiddenSucceeded++;
        } catch {}

        if (knownPayees.length > 0 && payroll.isPayee(knownPayees[0])) {
            vm.prank(employer);
            try payroll.updatePayee(knownPayees[0], amt) {
                forbiddenSucceeded++;
            } catch {}

            if (payroll.payeeCount() > 1) {
                vm.prank(employer);
                try payroll.removePayee(knownPayees[0]) {
                    forbiddenSucceeded++;
                } catch {}
            }
        }
    }

    // ── acceptEmployer from non-pending (forbidden) ───────────────────────────
    function acceptFromNonPending(address rando) external {
        address pending = payroll.pendingEmployer();
        if (rando == pending || rando == address(0)) return;

        vm.prank(rando);
        try payroll.acceptEmployer() {
            forbiddenSucceeded++;
        } catch {}
    }

    // ── addPayee ─────────────────────────────────────────────────────────────
    // Item 5: shortfall growth counted in employerGrewShortfall.
    // Item 8: catch block increments unexpectedRevert.
    function addPayee(address payee, uint256 rawAmt) external {
        if (payroll.closed()) return;
        if (payroll.nextUnpaid() < payroll.startedPeriods()) return;
        if (payroll.payeeCount() >= 100) return;
        if (payee == address(0) || payee == address(payroll) || payee == USDC_ADDR) return;
        if (payroll.isPayee(payee)) return;

        uint256 shortBefore = _shortfall();
        uint256 amt = bound(rawAmt, 1, 1_000_000e6);
        vm.prank(employer);
        try payroll.addPayee(payee, amt) {
            // Only push to knownPayees if not already present (a removed payee
            // that is re-added must not appear twice in the list, or the
            // DeferredMatchesClaims invariant would double-count its claimable).
            bool found = false;
            for (uint256 i = 0; i < knownPayees.length; i++) {
                if (knownPayees[i] == payee) { found = true; break; }
            }
            if (!found) knownPayees.push(payee);
            sc_addPayee++;
            // Item 5: count shortfall growth in its own counter.
            if (_shortfall() > shortBefore) employerGrewShortfall++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── updatePayee ──────────────────────────────────────────────────────────
    // Item 5: shortfall growth counted in employerGrewShortfall.
    // Item 7: pick payee from knownPayees by index so the fuzzer hits real payees.
    // Item 8: catch block increments unexpectedRevert.
    function updatePayee(uint256 seed, uint256 rawAmt) external {
        if (payroll.closed()) return;
        if (payroll.nextUnpaid() < payroll.startedPeriods()) return;
        if (knownPayees.length == 0) return;
        address payee = knownPayees[seed % knownPayees.length];
        if (!payroll.isPayee(payee)) return;

        uint256 shortBefore = _shortfall();
        uint256 amt = bound(rawAmt, 1, 1_000_000e6);
        vm.prank(employer);
        try payroll.updatePayee(payee, amt) {
            sc_updatePayee++;
            // Item 5: count shortfall growth in its own counter.
            if (_shortfall() > shortBefore) employerGrewShortfall++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── removePayee ──────────────────────────────────────────────────────────
    // Item 5: shortfall growth counted in employerGrewShortfall.
    // Item 7: pick payee from knownPayees by index so the fuzzer hits real payees.
    // Item 8: catch block increments unexpectedRevert.
    function removePayee(uint256 seed) external {
        if (payroll.closed()) return;
        if (payroll.nextUnpaid() < payroll.startedPeriods()) return;
        if (payroll.payeeCount() <= 1) return;
        if (knownPayees.length == 0) return;
        address payee = knownPayees[seed % knownPayees.length];
        if (!payroll.isPayee(payee)) return;

        uint256 shortBefore = _shortfall();
        vm.prank(employer);
        try payroll.removePayee(payee) {
            sc_removePayee++;
            // Item 5: count shortfall growth in its own counter.
            if (_shortfall() > shortBefore) employerGrewShortfall++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── close ────────────────────────────────────────────────────────────────
    // Item 5: shortfall growth counted in employerGrewShortfall.
    // Item 8: catch block increments unexpectedRevert.
    // C2: rate-limit close so most of each sequence runs on an open payroll.
    //     Only close when the fuzzed uint satisfies value % 25 == 0, and keep
    //     the sc_run > 0 gate so close cannot happen before any run is exercised.
    function close(uint256 value) external {
        if (payroll.closed()) return;
        if (sc_run == 0) return;
        if (value % 25 != 0) return;  // 1-in-25 chance of closing
        uint256 shortBefore = _shortfall();
        // Item 2: capture the clock-model started-periods count before close succeeds.
        uint256 clockModelNow = _modelStartedPeriods();
        vm.prank(employer);
        try payroll.close() {
            // Item 2/6: store the clock-model snapshot and set closedGhost so that
            // _modelStartedPeriods() caps correctly even when closedAtGhost is 0
            // (payroll closed before any period started).
            closedAtGhost = clockModelNow;
            closedGhost   = true;
            sc_close++;
            // Item 5: count shortfall growth in its own counter.
            if (_shortfall() > shortBefore) employerGrewShortfall++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── startTransfer (split from old handover) ───────────────────────────────
    // Harness fix 4: skip address(payroll) and address(USDC). These now revert
    // InvalidNewEmployer, so they must not be in the valid-call path.
    // Item 8: catch block increments unexpectedRevert.
    function startTransfer(address newEmp) external {
        if (newEmp == address(0) || newEmp == employer) return;
        if (newEmp == address(payroll) || newEmp == USDC_ADDR) return;
        if (payroll.employer() != employer) return;

        vm.prank(employer);
        try payroll.transferEmployer(newEmp) {
            sc_startTransfer++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── transferToSelfOrToken (forbidden) ────────────────────────────────────
    // Harness fix 4: both calls must always revert InvalidNewEmployer.
    function transferToSelfOrToken(bool useToken) external {
        if (payroll.employer() != employer) return;
        address bad = useToken ? USDC_ADDR : address(payroll);

        vm.prank(employer);
        try payroll.transferEmployer(bad) {
            forbiddenSucceeded++;
        } catch {}
    }

    // ── acceptTransfer ────────────────────────────────────────────────────────
    // Item 8: catch block increments unexpectedRevert.
    function acceptTransfer() external {
        address pending = payroll.pendingEmployer();
        if (pending == address(0)) return;

        vm.prank(pending);
        try payroll.acceptEmployer() {
            employer = pending;
            sc_acceptTransfer++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── cancelTransfer ────────────────────────────────────────────────────────
    // Item 8: catch block increments unexpectedRevert.
    function cancelTransfer() external {
        if (payroll.pendingEmployer() == address(0)) return;
        if (payroll.employer() != employer) return;

        vm.prank(employer);
        try payroll.cancelEmployerTransfer() {
            sc_cancelTransfer++;
        } catch {
            unexpectedRevert++;
        }
    }

    // ── blockPayee ────────────────────────────────────────────────────────────
    function blockPayee(uint256 seed) external {
        if (knownPayees.length == 0) return;
        address p = knownPayees[seed % knownPayees.length];
        if (!usdc.blocklisted(p)) {
            usdc.setBlocklist(p, true);
            sc_blockPayee++;
        }
    }

    // ── unblockPayee ──────────────────────────────────────────────────────────
    function unblockPayee(uint256 seed) external {
        if (knownPayees.length == 0) return;
        address p = knownPayees[seed % knownPayees.length];
        if (usdc.blocklisted(p)) {
            usdc.setBlocklist(p, false);
            sc_unblockPayee++;
        }
    }

    // ── warpForward ──────────────────────────────────────────────────────────
    // C3: bound to at most 1 periodLength per call so runs can keep up with time
    // and payee-change handlers (which require nextUnpaid >= startedPeriods)
    // remain reachable even as the fuzzer warps forward frequently.
    function warpForward(uint256 rawSeconds) external {
        uint256 secs = bound(rawSeconds, 0, uint256(payroll.periodLength()));
        vm.warp(block.timestamp + secs);
        sc_warpForward++;
    }

    // ── getters ───────────────────────────────────────────────────────────────
    function knownPayeeAt(uint256 i) external view returns (address) {
        return knownPayees[i];
    }

    function knownPayeeCount() external view returns (uint256) {
        return knownPayees.length;
    }

    function shortfall() external view returns (uint256) {
        return _shortfall();
    }

    /// @notice Expose the model owed value for invariant_BalanceCoversOwed and
    ///         invariant_OwedMatchesModel (item 4).
    function modelOwed() external view returns (uint256) {
        return _modelOwed();
    }

    /// @notice Expose the model startedPeriods for invariant_StartedPeriodsMatchesClock.
    function modelStartedPeriods() external view returns (uint256) {
        return _modelStartedPeriods();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────
contract PayrollInvariantTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    MockERC20 internal usdc;

    address internal employer = address(0xE001);
    address internal payee1   = address(0x1001);
    address internal payee2   = address(0x1002);

    uint64  internal START;
    uint64  internal constant PERIOD = 120;
    uint256 internal constant TIP    = 1_000;
    uint256 internal constant AMT1   = 10_000;
    uint256 internal constant AMT2   =  5_000;

    Payroll        internal payroll;
    PayrollHandler internal handler;

    uint256 internal initialBalance;

    function setUp() public {
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockERC20(USDC_ADDR);

        START = uint64(block.timestamp) + PERIOD;

        address[] memory payees  = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        payees[0]  = payee1; amounts[0] = AMT1;
        payees[1]  = payee2; amounts[1] = AMT2;

        payroll = new Payroll(employer, payees, amounts, START, PERIOD, TIP);

        // Fund generously: 50 full periods + extra free balance for withdraw handler.
        usdc.mint(employer, 200 * (AMT1 + AMT2 + TIP));
        vm.prank(employer);
        usdc.approve(address(payroll), type(uint256).max);
        vm.prank(employer);
        // Fund 51 periods: 50 are exactly owed obligations, 1 extra creates free balance.
        payroll.fund(51 * (AMT1 + AMT2 + TIP));

        // Record the balance BEFORE the setUp's pre-run so initialBalance is the
        // starting point for the C1 conservation invariant. Ghost accounting then
        // captures the setUp run's payouts via seedGhost().
        initialBalance = usdc.balanceOf(address(payroll));

        // Pre-seed a deferred claim so sc_claim can be hit immediately.
        // Blocklist payee2, run period 0 (period 0 starts at START),
        // unblock payee2. Now claimable[payee2] = AMT2 and totalDeferred = AMT2.
        usdc.setBlocklist(payee2, true);
        vm.warp(START);             // period 0 starts now
        payroll.run();              // period 0 run: payee1 paid, payee2 deferred
        usdc.setBlocklist(payee2, false);
        // Handler will warp further when it wants to run more periods.

        // Construct handler with ghost accounting seeded to match the setUp's pre-run:
        //   totalPaid   = AMT1  (payee1 received its period-0 amount directly)
        //   deferred    = AMT2  (payee2 was blocklisted; AMT2 added to totalDeferred)
        //   periodsPaid = 1     (tipsPaid formula = TIP * periodsPaid = TIP * 1 = TIP)
        //   periodTotal = AMT1 + AMT2 (schedule at run time)
        handler = new PayrollHandler(payroll, usdc, employer, payees, AMT1, AMT2, 1, AMT1 + AMT2);

        targetContract(address(handler));
    }

    // =========================================================================
    // C1: Money only leaves by rules
    // Harness fix 5: assert the employer is never the payroll address itself.
    // =========================================================================
    function invariant_MoneyOnlyLeavesByRules() public view {
        uint256 currentBal = usdc.balanceOf(address(payroll));
        uint256 tipsPaid   = payroll.tipPerRun() * handler.periodsPaid();

        uint256 inflow  = initialBalance + handler.totalFunded();
        uint256 outflow = currentBal
            + handler.totalPaid()
            + handler.totalWithdrawn()
            + handler.totalClaimed()
            + tipsPaid;

        assertEq(inflow, outflow, "C1: money conservation violated");

        // Harness fix 5: employer must never be the payroll contract itself.
        assertFalse(payroll.employer() == address(payroll),
            "C1/C10: employer is the payroll contract - free balance would be unrecoverable");
    }

    // =========================================================================
    // C2: balance >= owed, freeBalance definition holds
    // Item 4: use model owed (not payroll.owed()) so M02 is visible here.
    // =========================================================================
    function invariant_BalanceCoversOwed() public view {
        uint256 bal   = usdc.balanceOf(address(payroll));
        uint256 o     = handler.modelOwed();
        uint256 free  = payroll.freeBalance();

        // Real definition: freeBalance == bal - owed when bal > owed, else 0.
        uint256 expected = bal > o ? bal - o : 0;
        assertEq(free, expected, "C2: freeBalance does not equal max(bal - owed, 0)");

        assertGe(bal, payroll.totalDeferred(),
            "C2: balance covers totalDeferred");
    }

    // =========================================================================
    // C4: totalPaid + totalClaimed + totalDeferred == sum of periodTotals at each run
    // Harness fix 3: claim() moves money out of totalDeferred, so the ledger
    // must count it: totalPaid + totalClaimed + payroll.totalDeferred() == sumScheduledPeriods.
    // =========================================================================
    function invariant_PaidNeverExceedsSchedule() public view {
        uint256 accountedFor = handler.totalPaid() + handler.totalClaimed() + payroll.totalDeferred();
        assertEq(accountedFor, handler.sumScheduledPeriods(),
            "C4: totalPaid + totalClaimed + totalDeferred != sum of scheduled periods");
    }

    // =========================================================================
    // C5: totalDeferred == sum of claimable entries
    // =========================================================================
    function invariant_DeferredMatchesClaims() public view {
        uint256 sumClaimable = 0;
        uint256 n = handler.knownPayeeCount();
        for (uint256 i = 0; i < n; i++) {
            sumClaimable += payroll.claimable(handler.knownPayeeAt(i));
        }
        assertEq(payroll.totalDeferred(), sumClaimable,
            "C5: totalDeferred != sum of claimable entries");
    }

    // =========================================================================
    // periodTotal always equals sum of amountOf over current payee list
    // =========================================================================
    function invariant_PeriodTotalMatchesAmounts() public view {
        (address[] memory addrs, uint256[] memory amts) = payroll.getPayees();
        uint256 sum = 0;
        for (uint256 i = 0; i < amts.length; i++) {
            sum += amts[i];
        }
        assertEq(payroll.periodTotal(), sum,
            "periodTotal != sum of amountOf over current payees");
    }

    // =========================================================================
    // No forbidden call ever succeeded
    // =========================================================================
    function invariant_NoForbiddenCallSucceeds() public view {
        assertEq(handler.forbiddenSucceeded(), 0,
            "a forbidden call succeeded");
    }

    // =========================================================================
    // No guaranteed-success call ever reverted unexpectedly
    // =========================================================================
    function invariant_NoUnexpectedRevert() public view {
        assertEq(handler.unexpectedRevert(), 0,
            "a guaranteed-success call reverted");
    }

    // =========================================================================
    // No employer call ever grew the shortfall (owed - balance)
    // Item 6: replaces the old body with the real assertion.
    // =========================================================================
    function invariant_EmployerNeverGrowsShortfall() public view {
        assertEq(handler.employerGrewShortfall(), 0,
            "an employer call grew the shortfall (owed exceeded balance after the call)");
    }

    // =========================================================================
    // Item 1: owed() matches the independent model
    // model = (modelStartedPeriods - nextUnpaid, clamped to 0) * (periodTotal + tipPerRun)
    //       + sum of claimable over knownPayees.
    // With M02 applied (owed() drops tipPerRun), this fails when unpaid > 0.
    // =========================================================================
    function invariant_OwedMatchesModel() public view {
        assertEq(payroll.owed(), handler.modelOwed(),
            "owed() diverges from independent model");
    }

    // =========================================================================
    // Item 2: startedPeriods() matches the clock-derived model
    // =========================================================================
    function invariant_StartedPeriodsMatchesClock() public view {
        assertEq(payroll.startedPeriods(), handler.modelStartedPeriods(),
            "startedPeriods() diverges from clock model");
    }

    // =========================================================================
    // Item 3: a funded payroll with a due period must always run
    // =========================================================================
    function invariant_FundedDuePeriodAlwaysRuns() public view {
        assertEq(handler.runBlockedWhileFunded(), 0,
            "run was skipped on a payroll funded for its full owed amount");
    }

    // =========================================================================
    // Item 6 (C12): PayslipIssued/PayoutDeferred events must match Transfers
    // =========================================================================
    function invariant_EventsMatchTransfers() public view {
        assertEq(handler.eventMismatch(), 0,
            "C12: PayslipIssued/PayoutDeferred event did not match Transfer log");
    }

    // =========================================================================
    // Item 5: totalDeferred_ghost - totalClaimed == payroll.totalDeferred()
    // Identity holds because: ghost increments when run defers (same as contract),
    // totalClaimed increments by claimableAmt when claim succeeds (same as contract).
    // =========================================================================
    function invariant_GhostDeferredMatchesContract() public view {
        assertEq(
            handler.totalDeferred_ghost() - handler.totalClaimed(),
            payroll.totalDeferred(),
            "totalDeferred_ghost - totalClaimed != payroll.totalDeferred()"
        );
    }

    // =========================================================================
    // C4: test_HandlerCoverage
    // Deterministic test that drives the handler through one fixed sequence
    // making every valid handler succeed at least once. Proves no valid handler
    // has preconditions that can never be met.
    // Sequence (comments show which sc_ counter each call increments):
    //   fund, warpForward, run, blockPayee, warpForward, run,
    //   unblockPayee, claim, withdraw, addPayee, updatePayee, removePayee,
    //   startTransfer, cancelTransfer, startTransfer, acceptTransfer, close.
    // =========================================================================
    function test_HandlerCoverage() public {
        // 1. fund: add free balance so withdraw can succeed later.
        handler.fund(1_000_000);
        assertEq(handler.sc_fund(), 1, "fund not hit");

        // 2. warpForward: advance to period 1 (setUp left us at START after period 0).
        handler.warpForward(PERIOD);
        // sc_warpForward is informational; not in the required 12.

        // 3. run: pay period 1 (payee2 is unblocked so both payees paid).
        handler.run();
        assertEq(handler.sc_run(), 1, "run not hit");

        // 4. blockPayee: block knownPayees[0] = payee1.
        handler.blockPayee(0);
        assertEq(handler.sc_blockPayee(), 1, "blockPayee not hit");

        // 5. warpForward: advance to period 2.
        handler.warpForward(PERIOD);

        // 6. run: pay period 2; payee1 blocked so deferred, payee2 paid.
        handler.run();
        assertEq(handler.sc_run(), 2, "run second not hit");

        // 7. unblockPayee: unblock payee1.
        handler.unblockPayee(0);
        // sc_unblockPayee is informational; not in the required 12.

        // 8. claim: payee1 claims its period-2 deferred amount.
        //    knownPayees[0] = payee1; setUp also deferred payee2 (period 0).
        //    payee2's claimable was seeded in setUp; payee1 was deferred in step 6.
        handler.claim(0);
        assertEq(handler.sc_claim(), 1, "claim not hit");

        // 9. withdraw: employer withdraws some free balance.
        handler.withdraw(500);
        assertEq(handler.sc_withdraw(), 1, "withdraw not hit");

        // 10. addPayee: add a new payee while schedule is unlocked
        //     (nextUnpaid == startedPeriods after the two runs above).
        handler.addPayee(address(0x9991), 100);
        assertEq(handler.sc_addPayee(), 1, "addPayee not hit");

        // 11. updatePayee: update payee1's amount (knownPayees[0] = payee1, so seed=0).
        handler.updatePayee(0, 12_000);
        assertEq(handler.sc_updatePayee(), 1, "updatePayee not hit");

        // 12. removePayee: remove payee2 (knownPayees[1] = payee2, so seed=1).
        handler.removePayee(1);
        assertEq(handler.sc_removePayee(), 1, "removePayee not hit");

        // 13. startTransfer: initiate employer handover to 0xE002.
        handler.startTransfer(address(0xE002));
        assertEq(handler.sc_startTransfer(), 1, "startTransfer not hit");

        // 14. cancelTransfer: cancel the pending transfer.
        handler.cancelTransfer();
        assertEq(handler.sc_cancelTransfer(), 1, "cancelTransfer not hit");

        // 15. startTransfer again: initiate a second transfer to 0xE002.
        handler.startTransfer(address(0xE002));
        assertEq(handler.sc_startTransfer(), 2, "startTransfer (2nd) not hit");

        // 16. acceptTransfer: the new employer accepts.
        handler.acceptTransfer();
        assertEq(handler.sc_acceptTransfer(), 1, "acceptTransfer not hit");

        // 17. close: rate-limit gate passes when value % 25 == 0; sc_run > 0 is met.
        handler.close(0);
        assertEq(handler.sc_close(), 1, "close not hit");

        // All 12 required sc_ counters are at least 1.
        assertGe(handler.sc_fund(),           1, "sc_fund == 0");
        assertGe(handler.sc_run(),            1, "sc_run == 0");
        assertGe(handler.sc_withdraw(),       1, "sc_withdraw == 0");
        assertGe(handler.sc_claim(),          1, "sc_claim == 0");
        assertGe(handler.sc_addPayee(),       1, "sc_addPayee == 0");
        assertGe(handler.sc_updatePayee(),    1, "sc_updatePayee == 0");
        assertGe(handler.sc_removePayee(),    1, "sc_removePayee == 0");
        assertGe(handler.sc_close(),          1, "sc_close == 0");
        assertGe(handler.sc_startTransfer(),  1, "sc_startTransfer == 0");
        assertGe(handler.sc_acceptTransfer(), 1, "sc_acceptTransfer == 0");
        assertGe(handler.sc_cancelTransfer(), 1, "sc_cancelTransfer == 0");
        assertGe(handler.sc_blockPayee(),     1, "sc_blockPayee == 0");

        // Correctness counters must stay zero throughout.
        assertEq(handler.unexpectedRevert(),     0, "unexpected revert in coverage test");
        assertEq(handler.forbiddenSucceeded(),   0, "forbidden call succeeded in coverage test");
        assertEq(handler.employerGrewShortfall(),0, "employer grew shortfall in coverage test");
    }

    // =========================================================================
    // Item 9 (item 8 comment fix): afterInvariant: log handler success counters.
    //
    // Foundry calls afterInvariant() once after every run (one sequence each),
    // immediately after all invariant functions pass for that sequence (or after
    // shrinking a failure). Because handler storage is reverted between sequences,
    // the values shown here are from the last sequence of the last invariant run.
    // They are logged for human review, not asserted; the deterministic
    // test_HandlerCoverage above proves every handler is reachable.
    // =========================================================================
    function afterInvariant() public view {
        console.log("--- handler coverage (last sequence) ---");
        console.log("sc_fund:           ", handler.sc_fund());
        console.log("sc_run:            ", handler.sc_run());
        console.log("sc_withdraw:       ", handler.sc_withdraw());
        console.log("sc_claim:          ", handler.sc_claim());
        console.log("sc_addPayee:       ", handler.sc_addPayee());
        console.log("sc_updatePayee:    ", handler.sc_updatePayee());
        console.log("sc_removePayee:    ", handler.sc_removePayee());
        console.log("sc_close:          ", handler.sc_close());
        console.log("sc_startTransfer:  ", handler.sc_startTransfer());
        console.log("sc_acceptTransfer: ", handler.sc_acceptTransfer());
        console.log("sc_cancelTransfer: ", handler.sc_cancelTransfer());
        console.log("sc_blockPayee:     ", handler.sc_blockPayee());
    }
}
