// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Fork tests against Arc Testnet with the real USDC at 0x3600000000000000000000000000000000000000.
// Run with:
//   forge test --match-path contracts/test/PayrollFork.t.sol --fork-url <ARC_TESTNET_RPC>
//
// Results are labelled "fork" in the report.

import {Test, Vm} from "forge-std/Test.sol";
import {Payroll} from "../Payroll.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFiatTokenV2_1 {
    function blacklist(address) external;
    function blacklister() external view returns (address);
    function isBlacklisted(address) external view returns (bool);
    function configureMinter(address minter, uint256 minterAllowedAmount) external;
    function masterMinter() external view returns (address);
    function mint(address to, uint256 amount) external returns (bool);
}

/// @dev Deployed with `value` wei; its constructor immediately selfdestructs
///      to `target`, forwarding all value. Used in test_fork_SelfdestructCredit
///      to deliver a native-USDC credit to the payroll without going through fund().
contract SelfDestructToPayroll {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @dev Replicates the exact call context Payroll.run() uses for each payee:
///      reads its own USDC balance first (matching run()'s Underfunded check,
///      which warms the USDC address and the contract's own balance slot before
///      the first payee call), then forwards exactly `g` gas to USDC.transfer.
///      Returns true if the forwarded call succeeds, false otherwise.
///      Using an exact forwarded-gas limit instead of gasleft() arithmetic means
///      the result is identical in shared and --isolate modes.
contract RunContextTransfer {
    address internal immutable usdc;

    constructor(address _usdc) {
        usdc = _usdc;
    }

    function tryInRunContext(address to, uint256 g) external returns (bool ok) {
        // Mirror run()'s Underfunded check: read this contract's own USDC balance.
        // This warms the USDC address and the balance slot, exactly as run() does
        // before it forwards PAYEE_TRANSFER_GAS to the first payee's transfer().
        IERC20(usdc).balanceOf(address(this));
        // Forward exactly g gas to the transfer call, return success/failure.
        (ok,) = usdc.call{gas: g}(abi.encodeCall(IERC20.transfer, (to, 1)));
    }
}

contract PayrollForkTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    IERC20  internal usdc = IERC20(USDC_ADDR);

    address internal employer  = address(0xE001);
    address internal payee1    = address(0x1001);
    address internal payee2    = address(0x1002);

    uint64  internal constant PERIOD = 120;
    uint256 internal constant TIP    =  1_000;
    uint256 internal constant AMT1   = 10_000;
    uint256 internal constant AMT2   =  5_000;

    uint64 internal START;

    function setUp() public virtual {
        START = uint64(block.timestamp) + PERIOD;
        // On Arc, native balance IS the USDC balance (18-decimal view).
        // vm.deal sets the native balance; 1 USDC in the 6-decimal ERC-20 view
        // equals 1e12 wei in the 18-decimal native view.
        // Fund the employer with 1000 USDC (1000e6 in 6-dec units = 1000e18 wei).
        _fundUSDC(employer, 1_000e6);
    }

    /// @dev Fund `to` with `amount` USDC (6-decimal units) via vm.deal.
    ///      On Arc native == USDC: 1 ERC-20 unit = 1e12 wei.
    ///      Works on Arc Mainnet and Arc Testnet without relying on a funded whale.
    function _fundUSDC(address to, uint256 amount) internal {
        vm.deal(to, to.balance + amount * 1e12);
    }

    function _newPayroll(
        address[] memory payees,
        uint256[] memory amounts,
        uint256 tip
    ) internal returns (Payroll) {
        vm.prank(employer);
        Payroll pr = new Payroll(employer, payees, amounts, START, PERIOD, tip);
        vm.prank(employer);
        usdc.approve(address(pr), type(uint256).max);
        return pr;
    }

    // =========================================================================
    // fork test 19: zero-tip payroll
    // =========================================================================
    function test_fork_ZeroTipPayroll() public {
        address[] memory ps = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;

        Payroll pr = _newPayroll(ps, as_, 0); // tip = 0

        vm.prank(employer);
        pr.fund(AMT1 + AMT2);

        vm.warp(START + 1);
        pr.run(); // must succeed

        assertEq(usdc.balanceOf(payee1), AMT1, "payee1 paid");
        assertEq(usdc.balanceOf(payee2), AMT2, "payee2 paid");
        assertEq(usdc.balanceOf(address(pr)), 0, "no residue");
    }

    // =========================================================================
    // fork test 20: gas of one payee transfer inside run() with real USDC
    // =========================================================================
    function test_fork_SinglePayeeTransferGas() public {
        address fresh = address(0xFACE);
        address[] memory ps = new address[](1);
        uint256[] memory as_ = new uint256[](1);
        ps[0] = fresh; as_[0] = AMT1;

        Payroll pr = _newPayroll(ps, as_, TIP);

        vm.prank(employer);
        pr.fund(AMT1 + TIP);

        vm.warp(START + 1);

        // Item 14: record balance before run so we assert the delta, not an absolute.
        uint256 balBefore = usdc.balanceOf(fresh);
        vm.recordLogs();

        uint256 gasBefore = gasleft();
        pr.run();
        uint256 gasUsed = gasBefore - gasleft();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        uint256 paidCount  = 0;
        uint256 deferCount = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig)  paidCount++;
            if (logs[i].topics[0] == deferSig)    deferCount++;
        }

        emit log_named_uint("[fork] gas for 1-payee run (real USDC)", gasUsed);
        assertLt(gasUsed, 200_000, "single payee run under 200k gas");
        // A3/14: balance rose by exactly AMT1; assert delta not absolute.
        assertEq(usdc.balanceOf(fresh) - balBefore, AMT1, "A3: payee balance did not rise by AMT1");
        assertEq(paidCount,  1, "A3: expected 1 PayslipIssued");
        assertEq(deferCount, 0, "A3: unexpected PayoutDeferred");
    }

    // =========================================================================
    // fork test 21: 100-payee run with real USDC, every payee fresh
    // =========================================================================
    // Helper: snapshot balances for all 100 payees before run().
    function _snapshotBalances(address[] memory payees) internal view returns (uint256[] memory) {
        uint256[] memory bals = new uint256[](payees.length);
        for (uint256 i = 0; i < payees.length; i++) {
            bals[i] = usdc.balanceOf(payees[i]);
        }
        return bals;
    }

    // Helper: assert each payee's balance rose by `expectedDelta` compared to snapshot.
    function _assertBalancesRose(
        address[] memory payees,
        uint256[] memory snapshots,
        uint256 expectedDelta
    ) internal view {
        for (uint256 i = 0; i < payees.length; i++) {
            assertEq(
                usdc.balanceOf(payees[i]) - snapshots[i],
                expectedDelta,
                "A3: payee balance did not rise by expected amount"
            );
        }
    }

    function test_fork_HundredPayeeRunGas() public {
        address[] memory ps  = new address[](100);
        uint256[] memory as_ = new uint256[](100);
        for (uint256 i = 0; i < 100; i++) {
            ps[i]  = address(uint160(0xF000 + i));
            as_[i] = 100;
        }
        uint256 total = 100 * 100;

        Payroll pr = _newPayroll(ps, as_, TIP);

        vm.prank(employer);
        pr.fund(total + TIP);

        vm.warp(START + 1);

        // Item 14: snapshot balances before run so we assert delta, not absolute.
        // Some addresses 0xF000+i may already hold USDC on the forked chain.
        uint256[] memory balsBefore = _snapshotBalances(ps);
        vm.recordLogs();

        uint256 gasBefore = gasleft();
        pr.run();
        uint256 gasUsed = gasBefore - gasleft();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        uint256 paidCount  = 0;
        uint256 deferCount = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig)  paidCount++;
            if (logs[i].topics[0] == deferSig)    deferCount++;
        }

        emit log_named_uint("[fork] gas for 100-payee run (real USDC)", gasUsed);
        assertLt(gasUsed, 10_000_000, "100-payee run under 10M gas");
        // A3/14: each balance rose by exactly 100; assert delta not absolute.
        _assertBalancesRose(ps, balsBefore, 100);
        assertEq(paidCount,  100, "A3: expected 100 PayslipIssued");
        assertEq(deferCount,   0, "A3: unexpected PayoutDeferred");
    }

    // =========================================================================
    // fork test 22: SELFDESTRUCT credit
    // On Arc, native USDC has 18 decimals. 5e12 + 7 wei / 1e12 = 5 remainder 7,
    // so 5e12 + 7 native wei raises the ERC-20 balanceOf by exactly 5 (5 units in
    // the 6-decimal view) and discards the 7-wei dust.
    // A contract whose constructor selfdestructs to the payroll delivers exactly
    // this credit without going through fund(). owed() must be unchanged and
    // run(), withdraw(freeBalance()), and close() must all still succeed.
    // =========================================================================
    function test_fork_SelfdestructCredit() public {
        address[] memory ps = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        ps[0] = payee1; as_[0] = AMT1;
        ps[1] = payee2; as_[1] = AMT2;

        Payroll pr = _newPayroll(ps, as_, TIP);
        vm.prank(employer);
        pr.fund(AMT1 + AMT2 + TIP);

        uint256 owedBefore  = pr.owed();
        uint256 freeBefore  = pr.freeBalance();
        uint256 balBefore   = usdc.balanceOf(address(pr));

        // Deploy a contract with value == 5e12 + 7 whose constructor selfdestructs
        // to the payroll. On Arc native == USDC (18 dec), so 5e12 + 7 native wei
        // raises the ERC-20 balanceOf by exactly 5 (5e6 in 6-dec units) and
        // discards the 7-wei dust.
        uint256 sendValue   = 5e12 + 7;
        uint256 expectedErc = 5;  // 5e12 / 1e6 == 5 in 6-dec view, dust truncated

        // Give this test contract enough native tokens to pass along.
        vm.deal(address(this), sendValue);
        new SelfDestructToPayroll{value: sendValue}(payable(address(pr)));

        // ERC-20 view rose by exactly 5 and owed is unchanged.
        assertEq(usdc.balanceOf(address(pr)), balBefore  + expectedErc, "A2: balance rose by 5");
        assertEq(pr.freeBalance(),            freeBefore + expectedErc, "A2: freeBalance rose by 5");
        assertEq(pr.owed(),                   owedBefore,               "A2: owed unchanged");

        // run(), withdraw(freeBalance()), and close() all succeed.
        vm.warp(START + 1);
        pr.run();

        uint256 free = pr.freeBalance();
        vm.prank(employer);
        pr.withdraw(free);

        vm.prank(employer);
        pr.close();
    }

    // =========================================================================
    // fork test 23: blocklisted payee on real USDC
    // =========================================================================
    function test_fork_BlocklistedPayeeDeferred() public {
        address blacklistTarget = address(0xB1AC);
        Payroll pr = _buildTenPayeePayroll(blacklistTarget);

        require(
            _tryBlacklist(blacklistTarget),
            "A5: fork test 23 requires a working blacklister; run against Arc Testnet"
        );

        vm.warp(START + 1);
        _runAndCheckFork23(pr, blacklistTarget);
    }

    function _buildTenPayeePayroll(address blacklistTarget) internal returns (Payroll) {
        uint256 N = 10;
        address[] memory ps  = new address[](N);
        uint256[] memory as_ = new uint256[](N);
        for (uint256 i = 0; i < N; i++) {
            ps[i]  = address(uint160(0xA000 + i));
            as_[i] = 1_000;
        }
        ps[4] = blacklistTarget;
        Payroll pr = _newPayroll(ps, as_, TIP);
        vm.prank(employer);
        pr.fund(N * 1_000 + TIP);
        return pr;
    }

    function _tryBlacklist(address target) internal returns (bool) {
        IFiatTokenV2_1 token = IFiatTokenV2_1(USDC_ADDR);
        address blacklister = token.blacklister();
        if (blacklister == address(0)) return false;

        vm.prank(blacklister);
        try token.blacklist(target) {} catch { return false; }

        try token.isBlacklisted(target) returns (bool b) {
            return b;
        } catch {
            return false;
        }
    }

    function _runAndCheckFork23(Payroll pr, address blacklistTarget) internal {
        vm.recordLogs();
        uint256 gasBefore = gasleft();
        pr.run();
        uint256 gasUsed = gasBefore - gasleft();

        (uint256 paid, uint256 deferred) = _countFork23Logs(vm.getRecordedLogs(), blacklistTarget);

        assertEq(paid,    9, "9 payees paid");
        assertEq(deferred, 1, "1 payee deferred");
        assertEq(pr.claimable(blacklistTarget), 1_000, "deferred amount set");
        assertLt(gasUsed, 10_000_000, "run under 10M gas");

        emit log_named_uint("[fork] gas for 10-payee run with 1 blocked (real USDC)", gasUsed);
        emit log("fork test 23: blocklisted payee deferred, others paid");
    }

    function _countFork23Logs(Vm.Log[] memory logs, address blacklistTarget)
        internal pure returns (uint256 paidCount, uint256 deferCount)
    {
        bytes32 payslipSig = keccak256("PayslipIssued(address,uint256,uint256)");
        bytes32 deferSig   = keccak256("PayoutDeferred(address,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == payslipSig) {
                paidCount++;
            } else if (logs[i].topics[0] == deferSig) {
                deferCount++;
                address deferee = address(uint160(uint256(logs[i].topics[1])));
                require(deferee == blacklistTarget, "only blacklisted payee deferred");
            }
        }
    }

    // =========================================================================
    // fork test 24: C35. PAYEE_TRANSFER_GAS (110,000) >= 2x real transfer cost.
    // Measured in run()'s exact context (balance read first, cold frame, --isolate):
    // 48,561 gas cold, 43,990 warm.  Half the budget (55,000) covers either case.
    // Proven with exact forwarded-gas limits via RunContextTransfer, so the result
    // is identical in shared and --isolate modes.
    // =========================================================================
    function test_fork_TransferCostHasTwoXMargin() public {
        // Deploy RunContextTransfer and fund it with enough USDC to cover both calls.
        RunContextTransfer rct = new RunContextTransfer(USDC_ADDR);
        _fundUSDC(address(rct), 10);

        // Half the budget (55,000) must be enough: proves 2x margin holds.
        address fresh = address(0xC35A);
        bool ok55 = rct.tryInRunContext(fresh, 55_000);
        assertTrue(ok55, "C35: transfer must succeed at 55k gas (half of PAYEE_TRANSFER_GAS)");

        // 30,000 must fail: ensures the check is not vacuous (transfer does cost gas).
        address fresh2 = address(0xC35B);
        bool ok30 = rct.tryInRunContext(fresh2, 30_000);
        assertFalse(ok30, "C35: transfer must fail at 30k gas (below real cost)");
    }
}
