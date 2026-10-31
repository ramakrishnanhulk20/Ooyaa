// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Does not cover: multi-factory interaction, create2 address prediction, gas benchmarks.

import {Test, Vm} from "forge-std/Test.sol";
import {PaydayFactory} from "../PaydayFactory.sol";
import {Payroll} from "../Payroll.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract PaydayFactoryTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    MockERC20 internal usdc;

    address internal employer = address(0xE001);

    uint64  internal START;
    uint64  internal constant PERIOD = 120;
    uint256 internal constant TIP    = 1_000;
    uint256 internal constant AMT1   = 10_000;
    uint256 internal constant AMT2   =  5_000;

    PaydayFactory internal factory;

    address[] internal defaultPayees;
    uint256[] internal defaultAmounts;

    function setUp() public {
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockERC20(USDC_ADDR);

        START = uint64(block.timestamp) + PERIOD;

        defaultPayees  = new address[](2);
        defaultAmounts = new uint256[](2);
        defaultPayees[0]  = address(0x1001); defaultAmounts[0] = AMT1;
        defaultPayees[1]  = address(0x1002); defaultAmounts[1] = AMT2;

        factory = new PaydayFactory();
    }

    // ── helper ────────────────────────────────────────────────────────────────
    function _createDefault(address caller) internal returns (address) {
        vm.prank(caller);
        return factory.createPayroll(defaultPayees, defaultAmounts, START, PERIOD, TIP);
    }

    // =========================================================================
    // 27. test_CreateSetsCallerAsEmployer
    // =========================================================================
    function test_CreateSetsCallerAsEmployer() public {
        vm.expectEmit(true, false, false, false, address(factory));
        // We don't know the payroll address ahead of time; check employer + index in assertions below
        emit PaydayFactory.PayrollCreated(employer, address(0), 0); // topic[0] employer is indexed

        // Re-record properly
        vm.recordLogs();
        address payrollAddr = _createDefault(employer);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Verify PayrollCreated event fields
        bytes32 sig = keccak256("PayrollCreated(address,address,uint256)");
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) {
                address evtEmployer = address(uint160(uint256(logs[i].topics[1])));
                address evtPayroll  = address(uint160(uint256(logs[i].topics[2])));
                uint256 evtIndex    = abi.decode(logs[i].data, (uint256));
                assertEq(evtEmployer, employer,     "event employer");
                assertEq(evtPayroll,  payrollAddr,  "event payroll addr");
                assertEq(evtIndex,    0,            "event index 0");
                found = true;
            }
        }
        assertTrue(found, "PayrollCreated event not found");

        // Payroll properties
        Payroll pr = Payroll(payrollAddr);
        assertEq(pr.employer(), employer, "employer set");

        // Factory registry
        assertTrue(factory.isPayroll(payrollAddr), "isPayroll true");
        assertEq(factory.payrollCount(), 1,         "payrollCount 1");
        assertEq(factory.payrollAt(0),   payrollAddr, "payrollAt(0)");
        assertEq(factory.createdBy(employer), 1,    "createdBy count");

        address[] memory list = factory.payrollsCreatedBy(employer, 0, 10);
        assertEq(list.length, 1,           "list length");
        assertEq(list[0],    payrollAddr,  "list[0]");
    }

    // =========================================================================
    // 28. test_IsPayrollOnlyForFactoryPayrolls
    // =========================================================================
    function test_IsPayrollOnlyForFactoryPayrolls() public {
        // Factory-created → true
        address factoryPayroll = _createDefault(employer);
        assertTrue(factory.isPayroll(factoryPayroll));

        // Directly deployed → false
        Payroll direct = new Payroll(employer, defaultPayees, defaultAmounts, START, PERIOD, TIP);
        assertFalse(factory.isPayroll(address(direct)), "direct deploy not in factory");

        // Random address → false
        assertFalse(factory.isPayroll(address(0x1234)), "random addr not in factory");
    }

    // =========================================================================
    // 29. test_ListsAreCapped
    // =========================================================================
    function test_ListsAreCapped() public {
        // Create 150 payrolls from the same employer
        // Each needs distinct START to avoid conflicts; we re-use the same payees/amounts.
        // We just need 150 registrations. Reuse same params (they're separate contracts).
        for (uint256 i = 0; i < 150; i++) {
            vm.prank(employer);
            factory.createPayroll(defaultPayees, defaultAmounts, START, PERIOD, TIP);
        }

        assertEq(factory.payrollCount(), 150, "total 150");
        assertEq(factory.createdBy(employer), 150, "createdBy 150");

        // allPayrolls capped at 100
        address[] memory all200 = factory.allPayrolls(0, 200);
        assertEq(all200.length, 100, "allPayrolls capped at 100");

        // createdBy capped at 100
        address[] memory by200 = factory.payrollsCreatedBy(employer, 0, 200);
        assertEq(by200.length, 100, "payrollsCreatedBy capped at 100");

        // limit=50 respected
        address[] memory all50 = factory.allPayrolls(0, 50);
        assertEq(all50.length, 50, "allPayrolls limit=50");
    }

    // =========================================================================
    // 30. test_ListsAreHistoryNotAuthority
    // =========================================================================
    function test_ListsAreHistoryNotAuthority() public {
        address creatorA  = address(0xA001);
        address newOwnerB = address(0xB001);

        address payrollAddr = _createDefault(creatorA);
        Payroll pr = Payroll(payrollAddr);

        // Transfer employer to B
        vm.prank(creatorA);
        pr.transferEmployer(newOwnerB);
        vm.prank(newOwnerB);
        pr.acceptEmployer();

        // payrollsCreatedBy(A) still lists it (history)
        address[] memory listA = factory.payrollsCreatedBy(creatorA, 0, 10);
        assertEq(listA.length, 1,           "history still has payroll");
        assertEq(listA[0],     payrollAddr, "history correct address");

        // Payroll authority is now B
        assertEq(pr.employer(), newOwnerB, "authority is B");
    }

    // =========================================================================
    // 31. test_PayrollAtOutOfRangeReverts
    // =========================================================================
    function test_PayrollAtOutOfRangeReverts() public {
        // No payrolls created yet; index 0 is out of range.
        vm.expectRevert(PaydayFactory.OffsetOutOfRange.selector);
        factory.payrollAt(0);
    }

    // =========================================================================
    // 32. test_AllPayrollsOffsetBeyondEndReturnsEmpty
    // allPayrolls returns an empty array when offset >= total; no revert.
    // =========================================================================
    function test_AllPayrollsOffsetBeyondEndReturnsEmpty() public {
        // No payrolls; offset 0 returns empty (not a revert).
        address[] memory result = factory.allPayrolls(0, 10);
        assertEq(result.length, 0, "returns empty when offset >= total");

        // After one payroll, offset 1 is still beyond the end.
        _createDefault(employer);
        address[] memory result2 = factory.allPayrolls(1, 10);
        assertEq(result2.length, 0, "returns empty when offset == total");
    }
}
