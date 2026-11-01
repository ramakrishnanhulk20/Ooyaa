// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Does not cover: PaydayFactory integration, multi-contract invariants
// (see PayrollInvariant.t.sol), mainnet USDC behavior.

import {Test, Vm} from "forge-std/Test.sol";
import {Payroll} from "../Payroll.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {GasBurningERC20} from "../test-helpers/GasBurningERC20.sol";
import {RealisticERC20} from "../test-helpers/RealisticERC20.sol";
import {BadReturnERC20} from "../test-helpers/BadReturnERC20.sol";
import {GasBurnAtTarget} from "../test-helpers/GasBurnAtTarget.sol";

contract PayrollTest is Test {
    // ── canonical USDC address ──────────────────────────────────────────────
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    MockERC20 internal usdc;

    // ── actors ──────────────────────────────────────────────────────────────
    address internal payee1   = address(0x1001);
    address internal payee2   = address(0x1002);
    address internal payee3   = address(0x1003);
    address internal employer = address(0xE001);

    // ── schedule constants ───────────────────────────────────────────────────
    uint256 internal constant AMT1   = 10_000;
    uint256 internal constant AMT2   =  5_000;
    uint64  internal constant PERIOD = 120;      // seconds
    uint256 internal constant TIP    =  1_000;
    uint256 internal constant PERIOD_TOTAL = AMT1 + AMT2; // 15_000

    uint64 internal START;

    // ── contract under test ──────────────────────────────────────────────────
    Payroll internal payroll;

    // ─────────────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        // Etch mock USDC at canonical address
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockERC20(USDC_ADDR);

        START = uint64(block.timestamp) + PERIOD;

        address[] memory payees  = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        payees[0]  = payee1; amounts[0] = AMT1;
        payees[1]  = payee2; amounts[1] = AMT2;

        vm.prank(employer);
        payroll = new Payroll(employer, payees, amounts, START, PERIOD, TIP);

        // Seed employer with enough USDC
        usdc.mint(employer, 1e12);

        // Approve payroll to pull funds
        vm.prank(employer);
        usdc.approve(address(payroll), type(uint256).max);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    function _fund(uint256 n) internal {
        uint256 amount = n * (PERIOD_TOTAL + TIP);
        vm.prank(employer);
        payroll.fund(amount);
    }

    // =========================================================================
    // 1. test_RunPaysEveryPayeeOnce
    // =========================================================================
    function test_RunPaysEveryPayeeOnce() public {
        _fund(1);
        vm.warp(START + 1);

        vm.expectEmit(true, true, false, true, address(payroll));
        emit Payroll.PayslipIssued(payee1, 0, AMT1);
        vm.expectEmit(true, true, false, true, address(payroll));
        emit Payroll.PayslipIssued(payee2, 0, AMT2);

        payroll.run();

        assertEq(usdc.balanceOf(payee1), AMT1);
        assertEq(usdc.balanceOf(payee2), AMT2);
    }

    // =========================================================================
    // 2. test_SecondRunSamePeriodReverts
    // =========================================================================
    function test_SecondRunSamePeriodReverts() public {
        _fund(2);
        vm.warp(START + 1);

        payroll.run(); // period 0: ok

        uint256 bal1 = usdc.balanceOf(payee1);
        uint256 bal2 = usdc.balanceOf(payee2);

        vm.expectRevert(Payroll.NothingDue.selector);
        payroll.run();

        assertEq(usdc.balanceOf(payee1), bal1);
        assertEq(usdc.balanceOf(payee2), bal2);
    }

    // =========================================================================
    // 3. test_RunBeforeStartReverts
    // =========================================================================
    function test_RunBeforeStartReverts() public {
        _fund(1);
        // do NOT warp. still before START
        vm.expectRevert(Payroll.NothingDue.selector);
        payroll.run();
    }

    // =========================================================================
    // 4. test_RunsGoInOrder
    // =========================================================================
    function test_RunsGoInOrder() public {
        _fund(3);

        // period 0
        vm.warp(START + 1);
        vm.expectEmit(true, false, false, true, address(payroll));
        emit Payroll.PaydayRun(0, address(this), PERIOD_TOTAL, 0, TIP);
        payroll.run();

        // period 1
        vm.warp(START + PERIOD + 1);
        vm.expectEmit(true, false, false, true, address(payroll));
        emit Payroll.PaydayRun(1, address(this), PERIOD_TOTAL, 0, TIP);
        payroll.run();

        // period 2
        vm.warp(START + 2 * PERIOD + 1);
        vm.expectEmit(true, false, false, true, address(payroll));
        emit Payroll.PaydayRun(2, address(this), PERIOD_TOTAL, 0, TIP);
        payroll.run();

        vm.expectRevert(Payroll.NothingDue.selector);
        payroll.run();
    }

    // =========================================================================
    // 5. test_TipGoesToCaller
    // =========================================================================
    function test_TipGoesToCaller() public {
        _fund(1);
        vm.warp(START + 1);

        address runner = address(0xCAFE);
        vm.prank(runner);
        payroll.run();

        assertEq(usdc.balanceOf(runner), TIP,  "runner should get tip");
        assertEq(usdc.balanceOf(payee1), AMT1, "payee1 exact amount");
        assertEq(usdc.balanceOf(payee2), AMT2, "payee2 exact amount");
    }

    // =========================================================================
    // 6. test_UnderfundedRunReverts
    // =========================================================================
    function test_UnderfundedRunReverts() public {
        uint256 short = PERIOD_TOTAL + TIP - 1;
        vm.prank(employer);
        payroll.fund(short);

        vm.warp(START + 1);
        vm.expectRevert(Payroll.Underfunded.selector);
        payroll.run();
    }

    // =========================================================================
    // 7. test_EmployerCannotWithdrawOwed
    // =========================================================================
    function test_EmployerCannotWithdrawOwed() public {
        _fund(3);
        // Warp past 3 period starts. Nothing run yet.
        vm.warp(START + 2 * PERIOD + 1);

        // freeBalance() == 0 (everything owed)
        assertEq(payroll.freeBalance(), 0);

        vm.prank(employer);
        vm.expectRevert(Payroll.WithdrawExceedsFree.selector);
        payroll.withdraw(1);

        // Now run all 3 periods
        payroll.run(); // period 0
        payroll.run(); // period 1
        payroll.run(); // period 2
    }

    // =========================================================================
    // 8. test_WithdrawLeavesTipCovered
    // =========================================================================
    function test_WithdrawLeavesTipCovered() public {
        _fund(1); // exactly periodTotal + TIP
        vm.warp(START + 1);

        assertEq(payroll.freeBalance(), 0);

        vm.prank(employer);
        vm.expectRevert(Payroll.WithdrawExceedsFree.selector);
        payroll.withdraw(1);

        payroll.run(); // should succeed
    }

    // =========================================================================
    // 9. test_BlockedPayeeDoesNotBlockOthers
    // =========================================================================
    function test_BlockedPayeeDoesNotBlockOthers() public {
        // Build payroll with 3 payees
        address[] memory p = new address[](3);
        uint256[] memory a = new uint256[](3);
        p[0] = payee1; a[0] = AMT1;
        p[1] = payee2; a[1] = AMT2;
        p[2] = payee3; a[2] = AMT1;
        uint256 total3 = AMT1 + AMT2 + AMT1;

        Payroll pr3 = new Payroll(employer, p, a, START, PERIOD, TIP);
        vm.prank(employer);
        usdc.approve(address(pr3), type(uint256).max);

        vm.prank(employer);
        pr3.fund(total3 + TIP);

        // Blocklist payee2
        usdc.setBlocklist(payee2, true);

        vm.warp(START + 1);

        vm.expectEmit(true, true, false, true, address(pr3));
        emit Payroll.PayslipIssued(payee1, 0, AMT1);
        vm.expectEmit(true, true, false, true, address(pr3));
        emit Payroll.PayoutDeferred(payee2, 0, AMT2);
        vm.expectEmit(true, true, false, true, address(pr3));
        emit Payroll.PayslipIssued(payee3, 0, AMT1);

        pr3.run();

        assertEq(usdc.balanceOf(payee1), AMT1, "payee1 paid");
        assertEq(usdc.balanceOf(payee2), 0,    "payee2 not paid");
        assertEq(usdc.balanceOf(payee3), AMT1, "payee3 paid");

        assertEq(pr3.claimable(payee2), AMT2, "claimable set");
        assertEq(pr3.totalDeferred(),   AMT2,  "totalDeferred set");

        // freeBalance excludes deferred
        assertEq(pr3.freeBalance(), 0);

        // Employer cannot withdraw deferred
        vm.prank(employer);
        vm.expectRevert(Payroll.WithdrawExceedsFree.selector);
        pr3.withdraw(AMT2);

        // payee2 cannot claim while blocked (safeTransfer reverts)
        vm.prank(payee2);
        vm.expectRevert();
        pr3.claim();

        // Unblock payee2
        usdc.setBlocklist(payee2, false);

        vm.prank(payee2);
        pr3.claim();
        assertEq(usdc.balanceOf(payee2), AMT2, "payee2 claimed");

        // payee1 has nothing to claim
        vm.prank(payee1);
        vm.expectRevert(Payroll.NothingToClaim.selector);
        pr3.claim();
    }

    // =========================================================================
    // 10. test_DeferredClaimStaysOwedAfterClose
    //     Fix: use vm.startPrank/stopPrank so mint+approve+fund all run as employer
    // =========================================================================
    function test_DeferredClaimStaysOwedAfterClose() public {
        // Block payee2
        usdc.setBlocklist(payee2, true);
        _fund(1);
        vm.warp(START + 1);
        payroll.run(); // period 0, payee2 deferred

        assertGt(payroll.totalDeferred(), 0);

        // Close
        vm.prank(employer);
        payroll.close();

        // freeBalance excludes deferred
        assertEq(payroll.freeBalance(), 0);

        // Unblock and claim after close
        usdc.setBlocklist(payee2, false);
        vm.prank(payee2);
        payroll.claim();
        assertEq(usdc.balanceOf(payee2), AMT2);
    }

    // =========================================================================
    // 11. test_ScheduleLockedWhileStartedPeriodUnpaid
    // =========================================================================
    function test_ScheduleLockedWhileStartedPeriodUnpaid() public {
        _fund(1);
        vm.warp(START + 1); // period 0 started but not run

        vm.prank(employer);
        vm.expectRevert(Payroll.ScheduleLocked.selector);
        payroll.addPayee(payee3, AMT1);

        vm.prank(employer);
        vm.expectRevert(Payroll.ScheduleLocked.selector);
        payroll.updatePayee(payee1, 20_000);

        vm.prank(employer);
        vm.expectRevert(Payroll.ScheduleLocked.selector);
        payroll.removePayee(payee1);

        // Run period 0. Unlock schedule.
        payroll.run();

        // Now changes succeed
        vm.prank(employer);
        payroll.addPayee(payee3, AMT1);

        vm.prank(employer);
        payroll.updatePayee(payee1, 20_000);

        vm.prank(employer);
        payroll.removePayee(payee1);
    }

    // =========================================================================
    // 12. test_ScheduleChangeAppliesFromNextPeriod
    // =========================================================================
    function test_ScheduleChangeAppliesFromNextPeriod() public {
        // Single payee setup
        address[] memory p1 = new address[](1);
        uint256[] memory a1 = new uint256[](1);
        p1[0] = payee1; a1[0] = AMT1;

        Payroll pr = new Payroll(employer, p1, a1, START, PERIOD, TIP);
        vm.prank(employer);
        usdc.approve(address(pr), type(uint256).max);

        uint256 B = 20_000;
        vm.prank(employer);
        pr.fund(10 * (1_000_000 + TIP));

        // Periods 0 to 2: pay AMT1
        vm.warp(START + 1);
        pr.run();
        vm.warp(START + PERIOD + 1);
        pr.run();
        vm.warp(START + 2 * PERIOD + 1);
        pr.run();

        uint256 paidA = usdc.balanceOf(payee1);
        assertEq(paidA, 3 * AMT1, "3 * AMT1 paid");

        // Between periods: update to B
        vm.prank(employer);
        pr.updatePayee(payee1, B);

        // Periods 3 to 5: pay B
        vm.warp(START + 3 * PERIOD + 1);
        pr.run();
        vm.warp(START + 4 * PERIOD + 1);
        pr.run();
        vm.warp(START + 5 * PERIOD + 1);
        pr.run();

        uint256 paidB = usdc.balanceOf(payee1) - paidA;
        assertEq(paidB, 3 * B, "3 * B paid");

        // Add payee2, remove payee1
        vm.prank(employer);
        pr.addPayee(payee2, AMT2);
        vm.prank(employer);
        pr.removePayee(payee1);

        // Periods 6 to 7: payee1 gets nothing, payee2 gets AMT2
        vm.warp(START + 6 * PERIOD + 1);
        pr.run();
        vm.warp(START + 7 * PERIOD + 1);
        pr.run();

        assertEq(usdc.balanceOf(payee1), 3 * AMT1 + 3 * B, "payee1 no more after remove");
        assertEq(usdc.balanceOf(payee2), 2 * AMT2, "payee2 got 2 periods");
    }

    // =========================================================================
    // 13. test_RemoveLastPayeeReverts
    // =========================================================================
    function test_RemoveLastPayeeReverts() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;

        Payroll pr = new Payroll(employer, p, a, START, PERIOD, TIP);

        vm.prank(employer);
        vm.expectRevert(Payroll.LastPayee.selector);
        pr.removePayee(payee1);
    }

    // =========================================================================
    // 14. test_AddPayeeRejectsBadInputs
    // =========================================================================
    function test_AddPayeeRejectsBadInputs() public {
        vm.prank(employer);
        vm.expectRevert(Payroll.ZeroPayee.selector);
        payroll.addPayee(address(0), AMT1);

        vm.prank(employer);
        vm.expectRevert(abi.encodeWithSelector(Payroll.DuplicatePayee.selector, payee1));
        payroll.addPayee(payee1, AMT1);

        vm.prank(employer);
        vm.expectRevert(Payroll.PayeeIsThis.selector);
        payroll.addPayee(address(payroll), AMT1);

        vm.prank(employer);
        vm.expectRevert(Payroll.PayeeIsUsdc.selector);
        payroll.addPayee(USDC_ADDR, AMT1);

        vm.prank(employer);
        vm.expectRevert(Payroll.ZeroAmount.selector);
        payroll.addPayee(payee3, 0);

        vm.prank(employer);
        vm.expectRevert(Payroll.AmountTooLarge.selector);
        payroll.addPayee(payee3, 1_000_001e6);

        // 101st payee
        address[] memory p100 = new address[](100);
        uint256[] memory a100 = new uint256[](100);
        for (uint256 i = 0; i < 100; i++) {
            p100[i] = address(uint160(0x5000 + i));
            a100[i] = 1;
        }
        Payroll full = new Payroll(employer, p100, a100, START, PERIOD, TIP);
        vm.prank(employer);
        vm.expectRevert(Payroll.TooManyPayees.selector);
        full.addPayee(address(0x9999), 1);
    }

    // =========================================================================
    // 15. test_UpdatePayeeRejectsBadInputs
    // =========================================================================
    function test_UpdatePayeeRejectsBadInputs() public {
        vm.prank(employer);
        vm.expectRevert(Payroll.PayeeNotFound.selector);
        payroll.updatePayee(address(0xDEAD), AMT1);

        vm.prank(employer);
        vm.expectRevert(Payroll.ZeroAmount.selector);
        payroll.updatePayee(payee1, 0);

        vm.prank(employer);
        vm.expectRevert(Payroll.AmountTooLarge.selector);
        payroll.updatePayee(payee1, 1_000_001e6);
    }

    // =========================================================================
    // 16. test_HundredPayeeLimit
    // =========================================================================
    function test_HundredPayeeLimit() public {
        address[] memory p100 = new address[](100);
        uint256[] memory a100 = new uint256[](100);
        for (uint256 i = 0; i < 100; i++) {
            p100[i] = address(uint160(0x5000 + i));
            a100[i] = 1;
        }
        Payroll full = new Payroll(employer, p100, a100, START, PERIOD, TIP);

        assertEq(full.payeeCount(), 100);

        vm.prank(employer);
        vm.expectRevert(Payroll.TooManyPayees.selector);
        full.addPayee(address(0x9999), 1);

        vm.prank(employer);
        full.removePayee(p100[0]);

        vm.prank(employer);
        full.addPayee(address(0x9999), 1);

        assertEq(full.payeeCount(), 100);
    }

    // =========================================================================
    // 17. test_ConstructorRejects (15 sub-tests)
    // =========================================================================
    function test_ConstructorRejects_LengthMismatch() public {
        address[] memory p = new address[](2);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; p[1] = payee2; a[0] = AMT1;
        vm.expectRevert(Payroll.LengthMismatch.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_EmptyPayeeList() public {
        address[] memory p = new address[](0);
        uint256[] memory a = new uint256[](0);
        vm.expectRevert(Payroll.EmptyPayeeList.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_TooManyPayees() public {
        address[] memory p = new address[](101);
        uint256[] memory a = new uint256[](101);
        for (uint256 i = 0; i < 101; i++) { p[i] = address(uint160(0x5000 + i)); a[i] = 1; }
        vm.expectRevert(Payroll.TooManyPayees.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_ZeroPayee() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = address(0); a[0] = AMT1;
        vm.expectRevert(Payroll.ZeroPayee.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_DuplicatePayee() public {
        address[] memory p = new address[](2);
        uint256[] memory a = new uint256[](2);
        p[0] = payee1; p[1] = payee1; a[0] = AMT1; a[1] = AMT1;
        vm.expectRevert(abi.encodeWithSelector(Payroll.DuplicatePayee.selector, payee1));
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_PayeeIsThis() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        Payroll pr = new Payroll(employer, p, a, START, PERIOD, TIP);
        vm.prank(employer);
        vm.expectRevert(Payroll.PayeeIsThis.selector);
        pr.addPayee(address(pr), AMT2);
    }

    function test_ConstructorRejects_PayeeIsUsdc() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = USDC_ADDR; a[0] = AMT1;
        vm.expectRevert(Payroll.PayeeIsUsdc.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_ZeroAmount() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = 0;
        vm.expectRevert(Payroll.ZeroAmount.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_AmountTooLarge() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = 1_000_001e6;
        vm.expectRevert(Payroll.AmountTooLarge.selector);
        new Payroll(employer, p, a, START, PERIOD, TIP);
    }

    function test_ConstructorRejects_StartTimeTooEarly() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        vm.expectRevert(Payroll.StartTimeTooEarly.selector);
        new Payroll(employer, p, a, uint64(block.timestamp) - 1, PERIOD, TIP);
    }

    function test_ConstructorRejects_StartTimeTooLate() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        uint64 tooLate = uint64(block.timestamp + 366 days);
        vm.expectRevert(Payroll.StartTimeTooLate.selector);
        new Payroll(employer, p, a, tooLate, PERIOD, TIP);
    }

    function test_ConstructorRejects_PeriodLengthTooShort() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        vm.expectRevert(Payroll.PeriodLengthTooShort.selector);
        new Payroll(employer, p, a, START, 59, TIP);
    }

    function test_ConstructorRejects_PeriodLengthTooLong() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        vm.expectRevert(Payroll.PeriodLengthTooLong.selector);
        new Payroll(employer, p, a, START, uint64(366 days) + 1, TIP);
    }

    function test_ConstructorRejects_TipTooLarge() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        vm.expectRevert(Payroll.TipTooLarge.selector);
        new Payroll(employer, p, a, START, PERIOD, 10e6 + 1);
    }

    function test_ConstructorRejects_ZeroEmployer() public {
        address[] memory p = new address[](1);
        uint256[] memory a = new uint256[](1);
        p[0] = payee1; a[0] = AMT1;
        vm.expectRevert(Payroll.ZeroEmployer.selector);
        new Payroll(address(0), p, a, START, PERIOD, TIP);
    }

    // =========================================================================
    // 18. test_CloseStopsFuturePeriods
    // =========================================================================
    function test_CloseStopsFuturePeriods() public {
        _fund(10); // generous
        vm.warp(START + 2 * PERIOD + 1);

        vm.prank(employer);
        payroll.close();

        vm.warp(START + 12 * PERIOD + 1);

        uint256 expectedOwed = 3 * (PERIOD_TOTAL + TIP);
        assertEq(payroll.owed(), expectedOwed, "owed is capped at 3");

        payroll.run(); // period 0
        payroll.run(); // period 1
        payroll.run(); // period 2

        vm.expectRevert(Payroll.NothingDue.selector);
        payroll.run();

        // fund() still succeeds after close
        vm.startPrank(employer);
        usdc.mint(employer, 1);
        usdc.approve(address(payroll), 1);
        payroll.fund(1);
        vm.stopPrank();

        // addPayee reverts Closed
        vm.prank(employer);
        vm.expectRevert(Payroll.Closed.selector);
        payroll.addPayee(payee3, AMT1);

        // withdraw freeBalance succeeds (no `to` param)
        uint256 free = payroll.freeBalance();
        vm.prank(employer);
        payroll.withdraw(free);
    }

    // =========================================================================
    // 19. test_CloseAfterLongBacklog
    // =========================================================================
    function test_CloseAfterLongBacklog() public {
        vm.warp(START + 10_000 * uint256(PERIOD) + 1);

        vm.prank(employer);
        payroll.close();

        payroll.owed();
        payroll.getState();
    }

    // =========================================================================
    // 20. test_EmployerHandover
    // =========================================================================
    function test_EmployerHandover() public {
        address newEmployer = address(0xB055);
        address rando       = address(0xDEAD);

        vm.prank(employer);
        vm.expectEmit(true, true, false, false, address(payroll));
        emit Payroll.EmployerTransferStarted(employer, newEmployer);
        payroll.transferEmployer(newEmployer);

        assertEq(payroll.pendingEmployer(), newEmployer);

        // Random address cannot accept
        vm.prank(rando);
        vm.expectRevert(Payroll.NotPendingEmployer.selector);
        payroll.acceptEmployer();

        // newEmployer accepts
        vm.prank(newEmployer);
        vm.expectEmit(true, true, false, false, address(payroll));
        emit Payroll.EmployerTransferred(employer, newEmployer);
        payroll.acceptEmployer();

        assertEq(payroll.employer(), newEmployer);

        // Old employer loses rights
        vm.prank(employer);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.close();

        vm.prank(employer);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.addPayee(payee3, AMT1);

        // New employer: withdraw(0) reverts WithdrawZero
        vm.prank(newEmployer);
        vm.expectRevert(Payroll.WithdrawZero.selector);
        payroll.withdraw(0);

        // SameEmployer guard
        vm.prank(newEmployer);
        vm.expectRevert(Payroll.SameEmployer.selector);
        payroll.transferEmployer(newEmployer);

        // ZeroNewEmployer guard
        vm.prank(newEmployer);
        vm.expectRevert(Payroll.ZeroNewEmployer.selector);
        payroll.transferEmployer(address(0));
    }

    // =========================================================================
    // 21. test_OnlyEmployerFunctions
    // =========================================================================
    function test_OnlyEmployerFunctions() public {
        address rando = address(0xDEAD);

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.withdraw(1);

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.addPayee(payee3, AMT1);

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.updatePayee(payee1, 999);

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.removePayee(payee1);

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.close();

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.transferEmployer(address(0xBEEF));

        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.cancelEmployerTransfer();
    }

    // =========================================================================
    // 22. test_DirectTransferOnlyRaisesFreeBalance
    // =========================================================================
    function test_DirectTransferOnlyRaisesFreeBalance() public {
        _fund(1);

        uint256 freeBefore  = payroll.freeBalance();
        uint256 extra       = 5_000;

        usdc.mint(address(this), extra);
        usdc.transfer(address(payroll), extra);

        assertEq(payroll.freeBalance(), freeBefore + extra, "freeBalance raised");
        assertEq(payroll.nextUnpaid(),  0,                  "nextUnpaid unchanged");
        assertEq(payroll.periodTotal(), PERIOD_TOTAL,       "periodTotal unchanged");
        assertEq(payroll.employer(),    employer,           "employer unchanged");
        assertEq(payroll.startTime(),   START,              "startTime unchanged");
        assertEq(payroll.closed(),      false,              "closed unchanged");
    }

    // =========================================================================
    // 23. test_ViewsNeverRevert
    // =========================================================================
    function test_ViewsNeverRevert() public {
        // a) before startTime
        _callAllViews();

        // b) after startTime, underfunded
        vm.warp(START + 1);
        _callAllViews();

        // c) after run with deferred (block payee2 then run)
        usdc.setBlocklist(payee2, true);
        _fund(1);
        payroll.run();
        _callAllViews();

        // d) after close
        usdc.setBlocklist(payee2, false);
        vm.prank(employer);
        payroll.close();
        _callAllViews();
    }

    function _callAllViews() internal view {
        payroll.getState();
        payroll.owed();
        payroll.freeBalance();
        payroll.startedPeriods();
        payroll.dueNow();
        payroll.periodStart(0);
        payroll.periodStart(type(uint256).max);
        payroll.periodStart(type(uint256).max / 120);
        payroll.nextPayday();
        payroll.runway();
        payroll.getPayees();
        payroll.payeeCount();
        payroll.isPayee(address(0));
    }

    // =========================================================================
    // turn 06 test 6: test_TransferEmployerRejectsSelfAndToken
    // =========================================================================
    function test_TransferEmployerRejectsSelfAndToken() public {
        // Transferring to address(this) (the payroll itself) must revert InvalidNewEmployer.
        vm.prank(employer);
        vm.expectRevert(Payroll.InvalidNewEmployer.selector);
        payroll.transferEmployer(address(payroll));

        // Transferring to the USDC address must also revert InvalidNewEmployer.
        vm.prank(employer);
        vm.expectRevert(Payroll.InvalidNewEmployer.selector);
        payroll.transferEmployer(USDC_ADDR);

        // Confirming pendingEmployer is still unset.
        assertEq(payroll.pendingEmployer(), address(0), "pendingEmployer must stay zero");
    }

    // =========================================================================
    // turn 06 test 6a: test_LowGasRunRevertsNeverDefers (realistic transfer cost)
    //
    // Uses a storage-writing token that costs ~50k gas per transfer, comparable to
    // Arc's real USDC. Under the 63/64 rule, a run with too little gas always
    // reverts. It never reaches the InsufficientGasForRun check. What this test
    // proves is stronger: at no gas level does run() successfully defer a payee.
    // Either run() reverts cleanly (not a deferral) or all payees are paid outright.
    // =========================================================================
    function test_LowGasRunRevertsNeverDefers_Realistic() public {
        // Etch the realistic (storage-writing) ERC-20 at the USDC address.
        RealisticERC20 rUsdc = new RealisticERC20("Real USDC", "rUSDC", 6);
        vm.etch(USDC_ADDR, address(rUsdc).code);
        RealisticERC20 rToken = RealisticERC20(USDC_ADDR);

        // Fresh payroll with 2 payees using the realistic token.
        address[] memory ps = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;
        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, TIP);

        rToken.mint(employer, 1e12);
        vm.prank(employer);
        rToken.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(5 * (PERIOD_TOTAL + TIP));
        vm.warp(s + 1);

        // Gas levels that span below and above the InsufficientGasForRun threshold.
        // With the new 110,000 budget the per-payee gas check threshold is:
        //   (110_000 * 64 / 63) + 50_000  ≈ 111_746 + 50_000 = 161_746 per payee call.
        // At gas levels below this, run() must revert, never defer.
        uint256[8] memory gasLimits = [
            uint256(100_000),
            uint256(150_000),
            uint256(200_000),
            uint256(300_000),
            uint256(400_000),
            uint256(600_000),
            uint256(800_000),
            uint256(2_000_000)
        ];

        for (uint256 g = 0; g < gasLimits.length; g++) {
            vm.recordLogs();
            (bool ok,) = address(pr).call{gas: gasLimits[g]}(abi.encodeCall(Payroll.run, ()));
            Vm.Log[] memory logs = vm.getRecordedLogs();

            bytes32 deferSig = keccak256("PayoutDeferred(address,uint256,uint256)");
            for (uint256 i = 0; i < logs.length; i++) {
                assertFalse(logs[i].topics[0] == deferSig,
                    "PayoutDeferred emitted at low gas (realistic token)");
            }
            // ok == true means all payees were paid outright.
            // ok == false means run() reverted cleanly without deferring anyone.
            // A reverted call rolls back all state changes. Asserting nextUnpaid
            // unchanged would prove nothing about contract behaviour.
            (ok); // silence unused-variable warning
        }
        // Item 11: confirm run() succeeds with adequate gas (a run-that-always-reverts
        // would pass the no-deferral loop above but would fail here).
        vm.warp(block.timestamp + PERIOD + 1);
        (bool okFull,) = address(pr).call(abi.encodeCall(Payroll.run, ()));
        assertTrue(okFull, "Item 11: run() must succeed with adequate gas (realistic token)");
    }

    // =========================================================================
    // turn 06 test 6b: test_GasBurningPayeeIsDeferredOthersPaid (gas-capped call)
    //
    // Calls run() with an explicit 2,000,000 gas limit via a low-level call so
    // that removing the {gas: PAYEE_TRANSFER_GAS} cap in _tryPayUsdc would cause
    // the gas-burning payee to consume all remaining gas, leaving the later
    // payees without enough for their own transfers and reverting InsufficientGasForRun.
    // With the cap in place, only the gas-burning payee's budget is consumed and
    // the other 9 payees receive PayslipIssued.
    // =========================================================================
    function test_GasBurningPayeeIsDeferredOthersPaid_Capped() public {
        // Etch the gas-burning token at USDC address.
        GasBurningERC20 burner = new GasBurningERC20("Gas USDC", "gUSDC", 6);
        vm.etch(USDC_ADDR, address(burner).code);
        GasBurningERC20 gbUsdc = GasBurningERC20(USDC_ADDR);

        uint256 N = 10;
        address[] memory ps = new address[](N);
        uint256[] memory as_ = new uint256[](N);
        address gasBurnerPayee = address(0xB0B1);

        for (uint256 i = 0; i < N; i++) {
            ps[i] = address(uint160(0x7100 + i));
            as_[i] = 1_000;
        }
        ps[2] = gasBurnerPayee;

        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, TIP);
        gbUsdc.setGasBurner(gasBurnerPayee);

        uint256 total = N * 1_000;
        gbUsdc.mint(employer, total + TIP + 1_000);
        vm.prank(employer);
        gbUsdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(total + TIP);
        vm.warp(s + 1);

        // Call run() with an explicit 2,000,000 gas cap via low-level call.
        // With the per-payee PAYEE_TRANSFER_GAS cap, the gas burner is limited to
        // 110k, and the remaining 9 payees each get their own 110k budget.
        vm.recordLogs();
        (bool ok,) = address(pr).call{gas: 2_000_000}(abi.encodeCall(Payroll.run, ()));
        assertTrue(ok, "run() must succeed with 2M gas and capped payee budgets");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 paidCount  = 0;
        uint256 deferCount = 0;
        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");

        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig) {
                paidCount++;
                address paidPayee = address(uint160(uint256(logs[i].topics[1])));
                assertTrue(paidPayee != gasBurnerPayee, "gas burner should not be in paid");
            } else if (logs[i].topics[0] == deferSig) {
                deferCount++;
                address deferredPayee = address(uint160(uint256(logs[i].topics[1])));
                assertEq(deferredPayee, gasBurnerPayee, "only gas burner deferred");
            }
        }

        assertEq(paidCount,  N - 1, "9 payees paid");
        assertEq(deferCount, 1,     "1 payee deferred (gas burner)");
        assertEq(pr.claimable(gasBurnerPayee), 1_000, "deferred claim set");
    }

    // =========================================================================
    // turn 06 test 6c: test_ExactBoundary extended to cover period 0
    //
    // Covers: at startTime - 1 (period 0 not started, dueNow false, changes allowed)
    //         at exactly startTime (period 0 started, dueNow true, changes revert ScheduleLocked)
    // The existing test_ExactBoundary only covers period 1. This test proves that
    // changing `block.timestamp < startTime` to `<=` in _startedPeriodsRaw() would
    // break the boundary at period 0, making this test fail.
    // =========================================================================
    function test_ExactBoundaryPeriod0() public {
        _fund(5);

        // === At startTime - 1: period 0 has NOT started ===
        vm.warp(START - 1);

        assertEq(payroll.startedPeriods(), 0, "period 0 not started yet");
        assertFalse(payroll.dueNow(), "not due one second before start");

        // Payee changes are allowed (no started period is unpaid)
        vm.prank(employer);
        payroll.addPayee(payee3, AMT1);
        vm.prank(employer);
        payroll.removePayee(payee3);

        // === At exactly startTime: period 0 has started ===
        vm.warp(START);

        assertEq(payroll.startedPeriods(), 1, "period 0 started at exactly startTime");
        assertTrue(payroll.dueNow(), "dueNow true at exactly startTime");

        // Payee changes revert ScheduleLocked (period 0 started, not yet run)
        vm.prank(employer);
        vm.expectRevert(Payroll.ScheduleLocked.selector);
        payroll.addPayee(payee3, AMT1);

        vm.prank(employer);
        vm.expectRevert(Payroll.ScheduleLocked.selector);
        payroll.updatePayee(payee1, 20_000);

        // run() succeeds at exactly startTime
        payroll.run(); // period 0

        // After run, schedule is unlocked again
        vm.prank(employer);
        payroll.addPayee(payee3, AMT1);
        vm.prank(employer);
        payroll.removePayee(payee3);
    }

    // =========================================================================
    // 24. test_RunEventsMatchTransfers
    // =========================================================================
    function test_RunEventsMatchTransfers() public {
        usdc.setBlocklist(payee2, true);
        _fund(1);
        vm.warp(START + 1);

        uint256 balBefore = usdc.balanceOf(address(payroll));

        vm.recordLogs();
        payroll.run();
        uint256 balAfter = usdc.balanceOf(address(payroll));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 paidSum     = 0;
        uint256 deferredSum = 0;
        uint256 pdPaid      = 0;
        uint256 pdDeferred  = 0;

        bytes32 payslipSig   = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig     = keccak256("PayoutDeferred(address,uint256,uint256)");
        bytes32 paydayRunSig = keccak256("PaydayRun(uint256,address,uint256,uint256,uint256)");

        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig) {
                paidSum += abi.decode(logs[i].data, (uint256));
            } else if (logs[i].topics[0] == deferSig) {
                deferredSum += abi.decode(logs[i].data, (uint256));
            } else if (logs[i].topics[0] == paydayRunSig) {
                (pdPaid, pdDeferred,) = abi.decode(logs[i].data, (uint256, uint256, uint256));
            }
        }

        assertEq(paidSum,     pdPaid,      "PayslipIssued sum == PaydayRun.paid");
        assertEq(deferredSum, pdDeferred,  "PayoutDeferred sum == PaydayRun.deferred");
        assertEq(pdPaid + pdDeferred, PERIOD_TOTAL, "paid+deferred == periodTotal");
        assertEq(balBefore - balAfter, pdPaid + TIP, "balance decreased by paid+TIP");
    }

    // =========================================================================
    // 25. test_GasHundredPayees
    // =========================================================================
    function test_GasHundredPayees() public {
        address[] memory p100 = new address[](100);
        uint256[] memory a100 = new uint256[](100);
        for (uint256 i = 0; i < 100; i++) {
            p100[i] = address(uint160(0x5000 + i));
            a100[i] = 100;
        }
        uint256 total100 = 100 * 100;

        Payroll pr = new Payroll(employer, p100, a100, START, PERIOD, TIP);
        vm.prank(employer);
        usdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(total100 + TIP);

        vm.warp(START + 1);

        uint256 gasBefore = gasleft();
        pr.run();
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("gas used (100 payees)", gasUsed);
        assertLt(gasUsed, 10_000_000, "run() under 10M gas for 100 payees");
    }

    // =========================================================================
    // 26. testFuzz_NeverPaysAPeriodTwice
    // =========================================================================
    function testFuzz_NeverPaysAPeriodTwice(uint8 extraRuns, uint64 warpExtra) public {
        uint256 nRuns   = bound(extraRuns, 1, 5);
        uint256 warpAmt = bound(warpExtra, 0, uint256(PERIOD) * 10);

        _fund(nRuns + 1);

        vm.warp(START + 1 + warpAmt);

        uint256 started = payroll.startedPeriods();
        uint256 maxRuns = started > nRuns ? nRuns : started;

        uint256 bal1Before = usdc.balanceOf(payee1);
        uint256 bal2Before = usdc.balanceOf(payee2);

        for (uint256 i = 0; i < maxRuns; i++) {
            if (!payroll.dueNow()) break;
            payroll.run();
        }

        if (!payroll.dueNow()) {
            vm.expectRevert(Payroll.NothingDue.selector);
            payroll.run();
        }

        uint256 runsCompleted = payroll.nextUnpaid();
        assertLe(usdc.balanceOf(payee1) - bal1Before, runsCompleted * AMT1, "payee1 not over-paid");
        assertLe(usdc.balanceOf(payee2) - bal2Before, runsCompleted * AMT2, "payee2 not over-paid");
    }

    // =========================================================================
    // test_FundAfterCloseCoversOwed
    // Fix (spec 11): start with a balance that covers exactly one of the three
    // owed periods before closing, as originally specified.
    // =========================================================================
    function test_FundAfterCloseCoversOwed() public {
        uint256 onePeriodCost = PERIOD_TOTAL + TIP;

        // Fund exactly one period worth before closing
        _fund(1);

        // Warp past 3 period starts without running
        vm.warp(START + 2 * PERIOD + 1);

        // Close: closedAt == 3 (raw)
        vm.prank(employer);
        payroll.close();

        // owed = 3 × onePeriodCost, balance = 1 × onePeriodCost
        assertEq(payroll.owed(), 3 * onePeriodCost, "owed is 3 periods");

        // run() succeeds for period 0 (balance covers it)
        payroll.run(); // period 0

        // run() now reverts Underfunded: only 0 balance left
        vm.expectRevert(Payroll.Underfunded.selector);
        payroll.run();

        // Fund the remaining 2 periods + 1 extra unit via fund() after close
        uint256 remaining = 2 * onePeriodCost + 1;
        usdc.mint(address(this), remaining);
        usdc.approve(address(payroll), remaining);
        payroll.fund(remaining);

        // Periods 1 and 2 run successfully
        payroll.run(); // period 1
        payroll.run(); // period 2

        assertEq(payroll.owed(), 0, "nothing owed after all runs");

        uint256 free = payroll.freeBalance();
        assertEq(free, 1, "free is the 1 extra unit");

        vm.prank(employer);
        payroll.withdraw(free);

        assertEq(usdc.balanceOf(address(payroll)), 0, "payroll drained");

        vm.prank(employer);
        vm.expectRevert(Payroll.WithdrawExceedsFree.selector);
        payroll.withdraw(1);
    }

    // =========================================================================
    // test_AcceptEmployerClearsPending (turn 04)
    // =========================================================================
    function test_AcceptEmployerClearsPending() public {
        address newEmp = address(0xB055);

        vm.prank(employer);
        payroll.transferEmployer(newEmp);
        assertEq(payroll.pendingEmployer(), newEmp, "pending set");
        assertEq(payroll.getState().pendingEmployer, newEmp, "getState pending set");

        vm.prank(newEmp);
        payroll.acceptEmployer();

        assertEq(payroll.pendingEmployer(), address(0), "pending cleared");
        assertEq(payroll.getState().pendingEmployer, address(0), "getState pending cleared");
        assertEq(payroll.employer(), newEmp, "employer updated");

        vm.prank(newEmp);
        vm.expectRevert(Payroll.NotPendingEmployer.selector);
        payroll.acceptEmployer();
    }

    // =========================================================================
    // test_RemovePayeeUpdatesPeriodTotal (turn 04)
    // =========================================================================
    function test_RemovePayeeUpdatesPeriodTotal() public {
        address A = address(0x0A01);
        address B = address(0x0B01);
        address C = address(0x0C01);
        uint256 amtA = 3_000;
        uint256 amtB = 4_000;
        uint256 amtC = 5_000;

        address[] memory ps = new address[](3);
        uint256[] memory as_ = new uint256[](3);
        ps[0] = A; as_[0] = amtA;
        ps[1] = B; as_[1] = amtB;
        ps[2] = C; as_[2] = amtC;

        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, TIP);

        uint256 costPerPeriod = amtA + amtB + amtC + TIP;

        usdc.mint(employer, costPerPeriod * 10);
        vm.prank(employer);
        usdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(costPerPeriod * 5);

        vm.warp(s + 1);
        pr.run(); // period 0

        vm.prank(employer);
        pr.removePayee(B);

        uint256 newTotal = amtA + amtC;
        assertEq(pr.periodTotal(), newTotal, "periodTotal after remove");

        vm.warp(s + PERIOD + 1);
        assertEq(pr.owed(), newTotal + TIP, "owed uses new periodTotal");

        vm.recordLogs();
        pr.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 paydaySig = keccak256("PaydayRun(uint256,address,uint256,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == paydaySig) {
                (uint256 paid, uint256 deferred,) = abi.decode(logs[i].data, (uint256, uint256, uint256));
                assertEq(paid + deferred, newTotal, "PaydayRun paid+deferred == newTotal");
            }
        }

        assertEq(pr.owed(), 0, "nothing owed after run");
        assertEq(pr.freeBalance(), usdc.balanceOf(address(pr)), "no funds stuck for B");
    }

    // =========================================================================
    // test_RunKeepsDeferredClaimsCovered (turn 04)
    // =========================================================================
    function test_RunKeepsDeferredClaimsCovered() public {
        address payee3_ = address(0x1003);
        uint256 amt3 = 5_000;

        address[] memory ps = new address[](3);
        uint256[] memory as_ = new uint256[](3);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;
        ps[2] = payee3_; as_[2] = amt3;

        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, TIP);

        uint256 fullPeriodCost = AMT1 + AMT2 + amt3 + TIP;

        usdc.mint(employer, fullPeriodCost * 2);
        vm.prank(employer);
        usdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(fullPeriodCost * 2);

        usdc.setBlocklist(payee2, true);
        vm.warp(s + 1);
        pr.run();

        uint256 D = pr.claimable(payee2);
        assertEq(D, AMT2, "deferred = AMT2");
        assertEq(pr.totalDeferred(), D);

        usdc.setBlocklist(payee2, false);
        vm.warp(s + PERIOD + 1);

        uint256 curBal = usdc.balanceOf(address(pr));
        uint256 target = D + (AMT1 + AMT2 + amt3) + TIP - 1;

        if (curBal > target) {
            uint256 toWithdraw = curBal - target;
            if (pr.freeBalance() >= toWithdraw) {
                vm.prank(employer);
                pr.withdraw(toWithdraw);
            } else {
                usdc.burn(address(pr), toWithdraw);
            }
        } else {
            usdc.mint(employer, target - curBal);
            vm.startPrank(employer);
            usdc.approve(address(pr), target - curBal);
            pr.fund(target - curBal);
            vm.stopPrank();
        }

        assertEq(usdc.balanceOf(address(pr)), target, "balance is target");

        vm.expectRevert(Payroll.Underfunded.selector);
        pr.run();

        vm.prank(payee2);
        pr.claim();
        assertEq(usdc.balanceOf(payee2), D, "payee2 received D");
        assertEq(pr.totalDeferred(), 0);

        usdc.mint(address(this), 1);
        usdc.approve(address(pr), 1);
        pr.fund(1);

        pr.run();
    }

    // =========================================================================
    // spec test 1: test_RunwayCountsOnlyFuturePeriods
    // =========================================================================
    function test_RunwayCountsOnlyFuturePeriods() public {
        // Fund exactly 3 periods, warp to 3rd period start without running
        uint256 cost = PERIOD_TOTAL + TIP;
        _fund(3); // balance = 3 * cost

        // Warp to start of period 2 (third period): 3 periods started, none run
        vm.warp(START + 2 * PERIOD + 1);

        // owed() == balance (all 3 periods owed), freeBalance == 0, runway == 0
        assertEq(payroll.owed(), 3 * cost,    "owed is 3 periods");
        assertEq(payroll.freeBalance(), 0,    "no free balance");
        assertEq(payroll.runway(), 0,         "runway is 0");

        // Fund 2 more periods
        _fund(2);

        // Now freeBalance = 2 * cost (3 periods still owed, 5 total funded)
        assertEq(payroll.freeBalance(), 2 * cost, "free = 2 periods");
        assertEq(payroll.runway(), 2,             "runway is 2");
    }

    // =========================================================================
    // spec test 2: test_RunwayZeroAfterClose
    // =========================================================================
    function test_RunwayZeroAfterClose() public {
        _fund(10);
        vm.warp(START + 1);
        payroll.run(); // period 0 paid, lots of free balance

        vm.prank(employer);
        payroll.close();

        assertEq(payroll.runway(), 0, "runway is 0 after close");
    }

    // =========================================================================
    // spec test 3: test_NextPaydayAfterClose
    // =========================================================================
    function test_NextPaydayAfterClose() public {
        _fund(5);
        // Warp past 3 periods without running
        vm.warp(START + 2 * PERIOD + 1);

        vm.prank(employer);
        payroll.close(); // closedAt = 3

        // nextPayday() == periodStart(0) (next unpaid period)
        assertEq(payroll.nextPayday(), payroll.periodStart(0), "nextPayday = period 0 start");

        // Run all 3 owed periods
        payroll.run(); // period 0
        assertEq(payroll.nextPayday(), payroll.periodStart(1), "nextPayday = period 1 start");
        payroll.run(); // period 1
        assertEq(payroll.nextPayday(), payroll.periodStart(2), "nextPayday = period 2 start");
        payroll.run(); // period 2

        // All owed periods paid (nextUnpaid == closedAt == 3)
        assertEq(payroll.nextPayday(), type(uint256).max, "no payday when done");
    }

    // =========================================================================
    // spec test 4: test_PeriodStartNeverReverts
    // =========================================================================
    function test_PeriodStartNeverReverts() public view {
        // Extreme values return type(uint256).max
        assertEq(payroll.periodStart(type(uint256).max / 120), type(uint256).max);
        assertEq(payroll.periodStart(type(uint256).max), type(uint256).max);

        // Small values are deterministic
        assertEq(payroll.periodStart(0), START);
        assertEq(payroll.periodStart(1), START + PERIOD);
    }

    function testFuzz_PeriodStartNeverRevertsAndMonotonic(uint256 a, uint256 b) public view {
        // Never reverts
        uint256 va = payroll.periodStart(a);
        uint256 vb = payroll.periodStart(b);

        // Monotonic: if a < b then periodStart(a) <= periodStart(b)
        if (a < b) {
            assertLe(va, vb, "periodStart is not monotonic");
        }
    }

    // =========================================================================
    // spec test 5: test_ZeroTipRunsWithoutZeroTransfer
    // =========================================================================
    function test_ZeroTipRunsWithoutZeroTransfer() public {
        // tip = 0 exercises the no-zero-transfer path in run() to confirm it never sends 0 USDC
        address[] memory ps = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;

        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, 0); // tip = 0

        vm.prank(employer);
        usdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(PERIOD_TOTAL); // no tip needed

        vm.warp(s + 1);

        // Record all Transfer events
        vm.recordLogs();
        pr.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // ERC-20 Transfer event sig
        bytes32 transferSig = keccak256("Transfer(address,address,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == USDC_ADDR && logs[i].topics[0] == transferSig) {
                uint256 amount = abi.decode(logs[i].data, (uint256));
                assertGt(amount, 0, "zero-value transfer found");
            }
        }

        // PaydayRun tip field is 0
        bytes32 paydaySig = keccak256("PaydayRun(uint256,address,uint256,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == paydaySig) {
                (,, uint256 tip) = abi.decode(logs[i].data, (uint256, uint256, uint256));
                assertEq(tip, 0, "PaydayRun tip should be 0");
            }
        }
    }

    // =========================================================================
    // spec test 6: test_WithdrawPaysEmployerOnly
    // =========================================================================
    function test_WithdrawPaysEmployerOnly() public {
        _fund(2);
        vm.warp(START + 1);
        payroll.run(); // run period 0, now some free balance

        // Fund more to create freeBalance
        _fund(1);
        uint256 free = payroll.freeBalance();
        assertGt(free, 0);

        uint256 empBalBefore = usdc.balanceOf(employer);

        vm.prank(employer);
        payroll.withdraw(free);

        // Funds went to employer only
        assertEq(usdc.balanceOf(employer), empBalBefore + free, "employer received funds");
        assertEq(payroll.freeBalance(), 0, "freeBalance drained");

        // Non-employer cannot withdraw
        address rando = address(0xDEAD);
        vm.prank(rando);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.withdraw(1);
    }

    // =========================================================================
    // spec test 7: test_CancelEmployerTransfer
    // =========================================================================
    function test_CancelEmployerTransfer() public {
        address newEmp = address(0xB055);

        // Cannot cancel when nothing pending
        vm.prank(employer);
        vm.expectRevert(Payroll.NoPendingTransfer.selector);
        payroll.cancelEmployerTransfer();

        // Non-employer cannot cancel
        vm.prank(newEmp);
        vm.expectRevert(Payroll.NotEmployer.selector);
        payroll.cancelEmployerTransfer();

        // Start a transfer
        vm.prank(employer);
        payroll.transferEmployer(newEmp);
        assertEq(payroll.pendingEmployer(), newEmp);

        // Cancel it and check event
        vm.prank(employer);
        vm.expectEmit(true, true, false, false, address(payroll));
        emit Payroll.EmployerTransferCancelled(employer, newEmp);
        payroll.cancelEmployerTransfer();

        assertEq(payroll.pendingEmployer(), address(0), "pending cleared after cancel");

        // Old pending address can no longer accept
        vm.prank(newEmp);
        vm.expectRevert(Payroll.NotPendingEmployer.selector);
        payroll.acceptEmployer();
    }

    // =========================================================================
    // spec test 8: test_GasBurningPayeeIsDeferredOthersPaid
    // =========================================================================
    function test_GasBurningPayeeIsDeferredOthersPaid() public {
        // Deploy GasBurningERC20 and etch it at the USDC address
        GasBurningERC20 burner = new GasBurningERC20("Gas USDC", "gUSDC", 6);
        vm.etch(USDC_ADDR, address(burner).code);
        GasBurningERC20 gbUsdc = GasBurningERC20(USDC_ADDR);

        // 10 payees, the third one (index 2) is the gas burner
        uint256 N = 10;
        address[] memory ps = new address[](N);
        uint256[] memory as_ = new uint256[](N);
        address gasBurnerPayee = address(0xB0B0);

        for (uint256 i = 0; i < N; i++) {
            ps[i] = address(uint160(0x7000 + i));
            as_[i] = 1_000;
        }
        ps[2] = gasBurnerPayee;

        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, TIP);

        // Set the gas burner
        gbUsdc.setGasBurner(gasBurnerPayee);

        uint256 total = N * 1_000;
        gbUsdc.mint(employer, total + TIP + 1_000);
        vm.prank(employer);
        gbUsdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(total + TIP);

        vm.warp(s + 1);

        vm.recordLogs();
        pr.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 paidCount    = 0;
        uint256 deferCount   = 0;
        bytes32 payslipSig   = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig     = keccak256("PayoutDeferred(address,uint256,uint256)");

        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig) {
                paidCount++;
                // confirm gasBurnerPayee is NOT in paid
                address paidPayee = address(uint160(uint256(logs[i].topics[1])));
                assertTrue(paidPayee != gasBurnerPayee, "gas burner should not be paid");
            } else if (logs[i].topics[0] == deferSig) {
                deferCount++;
                address deferredPayee = address(uint160(uint256(logs[i].topics[1])));
                assertEq(deferredPayee, gasBurnerPayee, "only gas burner deferred");
            }
        }

        assertEq(paidCount,  N - 1, "9 payees paid");
        assertEq(deferCount, 1,     "1 payee deferred");
        assertEq(pr.claimable(gasBurnerPayee), 1_000, "deferred claim set");
    }

    // =========================================================================
    // spec test 9: test_LowGasRunRevertsNeverDefers
    // =========================================================================
    function test_LowGasRunRevertsNeverDefers() public {
        _fund(5);
        vm.warp(START + 1);

        // Step gas from 50_000 (too little) to 400_000 (sufficient).
        // With the 110,000 budget the per-payee gas check threshold is:
        //   (110_000 * 64 / 63) + 50_000 ≈ 111_746 + 50_000 = 161_746.
        uint256[8] memory gasLimits = [
            uint256(50_000),
            uint256(100_000),
            uint256(130_000),
            uint256(160_000),
            uint256(200_000),
            uint256(250_000),
            uint256(300_000),
            uint256(400_000)
        ];

        for (uint256 g = 0; g < gasLimits.length; g++) {
            vm.recordLogs();
            // Call run with limited gas via a low-level call
            (bool ok,) = address(payroll).call{gas: gasLimits[g]}(abi.encodeCall(Payroll.run, ()));

            Vm.Log[] memory logs = vm.getRecordedLogs();
            bytes32 deferSig = keccak256("PayoutDeferred(address,uint256,uint256)");

            // No deferral event ever emitted regardless of success/failure.
            for (uint256 i = 0; i < logs.length; i++) {
                assertFalse(logs[i].topics[0] == deferSig, "PayoutDeferred emitted at low gas");
            }
            // A reverted call rolls back all state, so nextUnpaid is unchanged after
            // any revert. Asserting it here would prove nothing about the contract.
            // The meaningful invariant is the absence of any PayoutDeferred event above.
            // ok == true: all payees paid (nextUnpaid advanced by 1).
            // ok == false: run() reverted cleanly without deferring anyone.
            (ok); // silence unused-variable warning
        }
        // Item 11: confirm that run() actually succeeds when given adequate gas.
        // Warp to a fresh period and call with no explicit gas limit.
        vm.warp(block.timestamp + PERIOD + 1);
        (bool okFull,) = address(payroll).call(abi.encodeCall(Payroll.run, ()));
        assertTrue(okFull, "Item 11: run() must succeed with adequate gas");
    }

    // =========================================================================
    // spec test 10: test_ExactBoundary
    // =========================================================================
    function test_ExactBoundary() public {
        _fund(5);
        // Run period 0 first so schedule is unlocked
        vm.warp(START + 1);
        payroll.run();

        // === At periodStart(1) - 1: period 1 has NOT started ===
        uint256 beforeStart1 = payroll.periodStart(1) - 1;
        vm.warp(beforeStart1);

        assertFalse(payroll.dueNow(), "period 1 not due yet");

        // Payee change succeeds (schedule unlocked, period 1 not started)
        vm.prank(employer);
        payroll.addPayee(payee3, AMT1);
        vm.prank(employer);
        payroll.removePayee(payee3);

        // === At exactly periodStart(1): period 1 has started ===
        vm.warp(payroll.periodStart(1));

        assertTrue(payroll.dueNow(), "period 1 due at its start");

        // Payee changes revert ScheduleLocked (period 1 started, not yet run)
        vm.prank(employer);
        vm.expectRevert(Payroll.ScheduleLocked.selector);
        payroll.addPayee(payee3, AMT1);

        // close() at periodStart(1) owes period 1
        vm.prank(employer);
        payroll.close();
        assertGt(payroll.owed(), 0, "period 1 owed after close at its start");

        // After close, payee changes revert Closed (not ScheduleLocked)
        vm.prank(employer);
        vm.expectRevert(Payroll.Closed.selector);
        payroll.addPayee(payee3, AMT1);

        // Run period 1
        payroll.run();

        // Two runs in the same block: the second reverts NothingDue
        vm.expectRevert(Payroll.NothingDue.selector);
        payroll.run();
    }

    // =========================================================================
    // turn 07/10: test_RealisticTransferCostsAbout50k (item 13 / item 4)
    //
    // RealisticERC20.TARGET_TOTAL = 50,000: every transfer() costs exactly that
    // many gas units, regardless of slot warmth (burn-last technique).
    // Proven with exact gas limits instead of gasleft() measurements:
    //   call{gas: 49,000} must fail (insufficient budget).
    //   call{gas: 56,000} must succeed (budget covers TARGET_TOTAL + dispatch).
    // 56,000 = 50,000 (body+burn) + ~6,000 (call dispatch, argument decode,
    // blocklist check, return handling): generous upper bound.
    // These limits are independent of slot warmth, so the test passes in both
    // shared and isolated (--isolate) Foundry modes.
    // =========================================================================
    function test_RealisticTransferCostsAbout50k() public {
        RealisticERC20 rUsdc = new RealisticERC20("Real USDC", "rUSDC", 6);
        rUsdc.mint(address(this), 1_000_000);

        address fresh = address(0xFACE1);
        bytes memory callData = abi.encodeCall(rUsdc.transfer, (fresh, 1));

        // Must fail at 49,000 (below TARGET_TOTAL).
        (bool ok49,) = address(rUsdc).call{gas: 49_000}(callData);
        assertFalse(ok49, "item 4: transfer must fail at 49k gas");

        // Must succeed at 56,000 (TARGET_TOTAL + ample dispatch headroom).
        (bool ok56,) = address(rUsdc).call{gas: 56_000}(callData);
        assertTrue(ok56, "item 4: transfer must succeed at 56k gas");
    }

    // =========================================================================
    // turn 07: test_WorstCaseHundredBurningPayeesFitsTxCap (item 15, rule C6)
    // All 100 payees are gas burners so every payee budget is fully consumed.
    // The runner is NOT a burner so the tip transfer succeeds.
    // The run must fit in one transaction under Arc's EIP-7825 cap (16,777,216).
    // =========================================================================
    function test_WorstCaseHundredBurningPayeesFitsTxCap() public {
        GasBurningERC20 burner = new GasBurningERC20("Gas USDC", "gUSDC", 6);
        vm.etch(USDC_ADDR, address(burner).code);
        GasBurningERC20 gbUsdc = GasBurningERC20(USDC_ADDR);

        uint256 N = 100;
        address[] memory ps  = new address[](N);
        uint256[] memory as_ = new uint256[](N);
        for (uint256 i = 0; i < N; i++) {
            ps[i]  = address(uint160(0xC000 + i));
            as_[i] = 100;
            // Register every payee as a gas burner
            gbUsdc.setGasBurner(ps[i], true);
        }

        uint256 total = N * 100;
        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, TIP);

        gbUsdc.mint(employer, total + TIP + 1_000);
        vm.prank(employer);
        gbUsdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(total + TIP);
        vm.warp(s + 1);

        uint256 ARC_TX_CAP = 16_777_216;
        uint256 TX_BASE    = 21_000;

        vm.recordLogs();
        uint256 gasBefore = gasleft();
        (bool ok,) = address(pr).call{gas: ARC_TX_CAP - TX_BASE}(abi.encodeCall(Payroll.run, ()));
        uint256 gasUsed = gasBefore - gasleft();
        assertTrue(ok, "run() must succeed with full burner set");

        emit log_named_uint("test_WorstCase100BurningPayees gasUsed", gasUsed);
        assertLt(gasUsed + TX_BASE, ARC_TX_CAP, "C6: worst-case run exceeds EIP-7825 cap");

        // Verify all 100 payees deferred and tip went to the runner (not a burner)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 deferCount = 0;
        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == deferSig) deferCount++;
        }
        assertEq(deferCount, N, "all 100 payees must be deferred");
        assertEq(pr.totalDeferred(), total, "totalDeferred equals period total");
        // D1: assert the runner (address(this)) received the tip.
        assertEq(gbUsdc.balanceOf(address(this)), TIP, "D1: runner did not receive the tip");
    }

    // =========================================================================
    // turn 07: test_ShortReturnDataIsDeferred (item 16)
    // transfer() returns 1 to 31 bytes. _tryPayUsdc must treat this as a refusal
    // (return false), deferring the payee rather than reverting.
    // This test must FAIL against the old _tryPayUsdc (which called abi.decode
    // and would revert on malformed data, causing the whole run to revert).
    // =========================================================================
    function test_ShortReturnDataIsDeferred() public {
        BadReturnERC20 bad = new BadReturnERC20("Bad USDC", "bUSDC", 6);
        vm.etch(USDC_ADDR, address(bad).code);
        BadReturnERC20 badUsdc = BadReturnERC20(USDC_ADDR);
        // Configure AFTER etch so the storage is set on the etched address.
        // vm.etch copies code only; storage set before etch is not visible at the new address.
        badUsdc.setReturnLength(payee1, 15); // malformed: 15 bytes
        badUsdc.setReturnLength(payee2,  0); // normal: no return data (accepted since code exists)

        address[] memory ps  = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;
        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, 0);

        badUsdc.mint(employer, (AMT1 + AMT2) * 5);
        vm.prank(employer);
        badUsdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(AMT1 + AMT2);
        vm.warp(s + 1);

        vm.recordLogs();
        pr.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        uint256 deferred = 0;
        uint256 paid     = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == deferSig) {
                deferred++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), payee1, "only payee1 deferred");
            } else if (logs[i].topics[0] == payslipSig) {
                paid++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), payee2, "payee2 paid");
            }
        }
        assertEq(deferred, 1, "payee1 must be deferred (short return data)");
        assertEq(paid,     1, "payee2 must be paid");
        assertEq(pr.claimable(payee1), AMT1, "payee1 has deferred claim");
    }

    // =========================================================================
    // turn 07: test_NonBooleanWordIsDeferred (item 16)
    // transfer() returns the word 2 (not 0 or 1). _tryPayUsdc must treat this
    // as a refusal, deferring the payee rather than accepting or reverting.
    // This test must FAIL against the old _tryPayUsdc (which called
    // abi.decode(data, (bool)) and would revert on a non-bool word).
    // =========================================================================
    function test_NonBooleanWordIsDeferred() public {
        BadReturnERC20 bad = new BadReturnERC20("Bad USDC", "bUSDC", 6);
        vm.etch(USDC_ADDR, address(bad).code);
        BadReturnERC20 badUsdc = BadReturnERC20(USDC_ADDR);
        // Configure AFTER etch (vm.etch copies code only; storage set before etch is lost).
        // payee1 returns word 2 (non-boolean) → deferred
        // payee2 returns word 1 (true) → accepted
        badUsdc.setReturnLength(payee1, 32);
        badUsdc.setReturnLength(payee2, 32);
        badUsdc.setReturnWord(payee1, 2); // non-boolean
        badUsdc.setReturnWord(payee2, 1); // true, accepted

        address[] memory ps  = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;
        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, 0);

        badUsdc.mint(employer, (AMT1 + AMT2) * 5);
        vm.prank(employer);
        badUsdc.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(AMT1 + AMT2);
        vm.warp(s + 1);

        vm.recordLogs();
        pr.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        uint256 deferred = 0;
        uint256 paid     = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == deferSig) {
                deferred++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), payee1, "only payee1 deferred");
            } else if (logs[i].topics[0] == payslipSig) {
                paid++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), payee2, "payee2 paid");
            }
        }
        assertEq(deferred, 1, "payee1 must be deferred (non-bool word 2)");
        assertEq(paid,     1, "payee2 must be paid");
        assertEq(pr.claimable(payee1), AMT1, "payee1 has deferred claim");
    }

    // =========================================================================
    // turn 09/10: test_BudgetCoversTwiceRealTransfer (item 9 / item 2, rule C35)
    //
    // GasBurnAtTarget.TARGET_TOTAL = 106,500 (burn-last technique): every transfer()
    // to burnTarget consumes exactly 106,500 gas regardless of slot warmth.
    //
    // Part A: payroll run assertions.
    //   Both payees paid (2 PayslipIssued, 0 PayoutDeferred) when run() uses its
    //   normal 110,000-gas budget.  Passes in shared and isolated modes because the
    //   total cost (106,500) is constant.
    //
    // Part B: direct call assertions (item 2).
    //   call{gas: 110,000} to transfer(burnTarget, amount) must succeed.
    //   call{gas: 100,000} to transfer(burnTarget, amount) must fail (106,500 > 100,000).
    //   These two calls pin the pass/fail boundary across both Foundry modes.
    //   Fails if PAYEE_TRANSFER_GAS is lowered to 100,000 (M38).
    // =========================================================================
    function test_BudgetCoversTwiceRealTransfer() public {
        GasBurnAtTarget burner = new GasBurnAtTarget("BurnUSDC", "bUSDC", 6);
        vm.etch(USDC_ADDR, address(burner).code);
        GasBurnAtTarget bat = GasBurnAtTarget(USDC_ADDR);

        // Set the burn target AFTER etch (vm.etch copies code only; storage set after).
        bat.setBurnTarget(payee1);

        // ── Part A: payroll run ───────────────────────────────────────────────
        address[] memory ps  = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;   // burn target: 106,500 gas total
        ps[1] = payee2; as_[1] = AMT2;   // normal transfer

        uint64 s = uint64(block.timestamp + PERIOD);
        Payroll pr = new Payroll(employer, ps, as_, s, PERIOD, 0);

        bat.mint(employer, (AMT1 + AMT2) * 5);
        vm.prank(employer);
        bat.approve(address(pr), type(uint256).max);
        vm.prank(employer);
        pr.fund(AMT1 + AMT2);
        vm.warp(s + 1);

        vm.recordLogs();
        pr.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        uint256 paidCount  = 0;
        uint256 deferCount = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig)  paidCount++;
            if (logs[i].topics[0] == deferSig)    deferCount++;
        }
        assertEq(paidCount,  2, "C35 A: both payees must be paid at 110k budget");
        assertEq(deferCount, 0, "C35 A: no payee must be deferred at 110k budget");
        assertEq(bat.balanceOf(payee1), AMT1, "C35 A: payee1 balance rose");
        assertEq(bat.balanceOf(payee2), AMT2, "C35 A: payee2 balance rose");

        // ── Part B: direct gas-limit calls (item 2) ──────────────────────────
        // Fund a fresh holder so balance is non-zero for the direct calls.
        address holder = address(0xB47);
        bat.mint(holder, AMT1 * 10);
        bytes memory callData = abi.encodeCall(bat.transfer, (payee1, AMT1));

        // 110,000 must succeed: 106,500 total cost fits inside the budget.
        vm.prank(holder);
        (bool ok110,) = address(bat).call{gas: 110_000}(callData);
        assertTrue(ok110, "C35 B: transfer must succeed at 110k gas");

        // 100,000 must fail: 106,500 total cost exceeds the budget.
        vm.prank(holder);
        (bool ok100,) = address(bat).call{gas: 100_000}(callData);
        assertFalse(ok100, "C35 B: transfer must fail at 100k gas");
    }

    // =========================================================================
    // turn 09: test_CloseBeforeStartOwesNothing (item 12, rule C11)
    //
    // close() before startTime: owed() is 0, startedPeriods() stays 0 even after
    // warping past startTime, run() reverts NothingDue, and withdraw(freeBalance())
    // returns the whole funded balance to the employer.
    // =========================================================================
    function test_CloseBeforeStartOwesNothing() public {
        _fund(3);

        // Still before START: no periods started.
        assertEq(payroll.startedPeriods(), 0, "no periods started yet");
        assertEq(payroll.owed(), 0, "nothing owed before start");

        // Close before any period starts.
        vm.prank(employer);
        payroll.close();
        assertTrue(payroll.closed(), "payroll must be closed");

        // Warp well past startTime.
        vm.warp(START + 10 * PERIOD + 1);

        // startedPeriods() is capped at closedAt (which is 0) so it stays 0.
        assertEq(payroll.startedPeriods(), 0, "C11: startedPeriods stays 0 after close at 0");
        assertEq(payroll.owed(), 0, "C11: owed stays 0 after close at 0");

        // run() reverts NothingDue (no periods started under the cap).
        vm.expectRevert(Payroll.NothingDue.selector);
        payroll.run();

        // The entire funded balance is free and can be withdrawn.
        uint256 funded = 3 * (PERIOD_TOTAL + TIP);
        uint256 balBefore = usdc.balanceOf(employer);
        assertEq(payroll.freeBalance(), funded, "C11: full funded amount is free");

        vm.prank(employer);
        payroll.withdraw(funded);

        assertEq(usdc.balanceOf(employer) - balBefore, funded, "C11: full balance returned to employer");
        assertEq(usdc.balanceOf(address(payroll)), 0, "C11: payroll balance is zero after withdrawal");
    }

    // =========================================================================
    // 33. test_CloseTwiceReverts
    // =========================================================================
    function test_CloseTwiceReverts() public {
        // First close must succeed.
        vm.prank(employer);
        payroll.close();
        assertTrue(payroll.closed(), "payroll closed after first close");

        // Second close must revert AlreadyClosed.
        vm.expectRevert(Payroll.AlreadyClosed.selector);
        vm.prank(employer);
        payroll.close();
    }

    // =========================================================================
    // 34. test_FundEmitsFunded
    // =========================================================================
    function test_FundEmitsFunded() public {
        uint256 amount = 3 * (PERIOD_TOTAL + TIP);
        vm.expectEmit(true, false, false, true, address(payroll));
        emit Payroll.Funded(employer, amount);
        vm.prank(employer);
        payroll.fund(amount);
    }

    // =========================================================================
    // 35. test_WithdrawEmitsWithdrawn
    // =========================================================================
    function test_WithdrawEmitsWithdrawn() public {
        _fund(3);
        uint256 free = payroll.freeBalance();

        vm.expectEmit(true, false, false, true, address(payroll));
        emit Payroll.Withdrawn(employer, free);
        vm.prank(employer);
        payroll.withdraw(free);
    }

    // =========================================================================
    // 36. test_ClaimEmitsClaimed
    // claim() emits Claimed(payee, amount) after a deferred payout.
    // Deferral is triggered by blocklisting payee1 so the USDC transfer fails.
    // =========================================================================
    function test_ClaimEmitsClaimed() public {
        // Blocklist payee1 so its transfer fails and triggers deferral.
        usdc.setBlocklist(payee1, true);

        _fund(1);
        vm.warp(START + 1);
        payroll.run();

        // Unblock payee1 so claim() can actually transfer.
        usdc.setBlocklist(payee1, false);

        uint256 deferred = payroll.claimable(payee1);
        assertTrue(deferred > 0, "deferred share must be positive");

        vm.expectEmit(true, false, false, true, address(payroll));
        emit Payroll.Claimed(payee1, deferred);
        vm.prank(payee1);
        payroll.claim();

        assertEq(usdc.balanceOf(payee1), deferred, "payee1 receives deferred amount");
    }
}
