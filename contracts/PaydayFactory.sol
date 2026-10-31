// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Payroll} from "./Payroll.sol";

/// @title PaydayFactory
/// @notice Ownerless registry that deploys one Payroll contract per employer and
///         keeps an append-only directory of every payroll it has created. The
///         factory has no admin, no fees, and no ability to affect deployed payrolls.
contract PaydayFactory {
    /// @notice True if and only if the address was deployed by this factory.
    ///         Set once inside createPayroll; never cleared.
    mapping(address => bool) public isPayroll;

    /// @dev Global ordered list of every payroll address this factory has created.
    address[] private _allPayrolls;

    /// @dev Per-employer history: maps the address that called createPayroll to
    ///      the list of payroll addresses created in those calls. Append-only.
    mapping(address => address[]) private _createdBy;

    /// @notice Emitted each time createPayroll deploys a new Payroll.
    /// @param employer  The caller who became employer of the new payroll.
    /// @param payroll   The newly deployed Payroll address.
    /// @param index     Its zero-based position in the global all-payrolls list.
    event PayrollCreated(address indexed employer, address indexed payroll, uint256 index);

    /// @notice Reverted by payrollAt when the index is out of range.
    error OffsetOutOfRange();

    /// @notice Deploy a Payroll with the caller as employer, register it, and
    ///         append it to both the global list and the caller's per-employer list.
    /// @dev Reverts with any of the Payroll constructor's named errors when the
    ///      arguments are invalid (see Payroll constructor). Emits PayrollCreated.
    /// @param payees       Initial payee addresses, 1 to 100 entries.
    /// @param amounts      Per-period USDC amounts (6-decimal units), one per payee.
    /// @param startTime    Timestamp at which period 0 starts (block.timestamp to +365 days).
    /// @param periodLength Seconds per period (60 s to 366 days).
    /// @param tipPerRun    USDC tip paid to the run() caller each period (0 to 10e6).
    /// @return payroll     Address of the newly deployed Payroll contract.
    function createPayroll(
        address[] calldata payees,
        uint256[] calldata amounts,
        uint64 startTime,
        uint64 periodLength,
        uint256 tipPerRun
    ) external returns (address payroll) {
        Payroll p = new Payroll(msg.sender, payees, amounts, startTime, periodLength, tipPerRun);
        payroll = address(p);
        isPayroll[payroll] = true;
        uint256 index = _allPayrolls.length;
        _allPayrolls.push(payroll);
        _createdBy[msg.sender].push(payroll);
        emit PayrollCreated(msg.sender, payroll, index);
    }

    /// @notice Total number of payrolls ever deployed by this factory.
    /// @dev Never reverts.
    /// @return Total count of payrolls in the global list.
    function payrollCount() external view returns (uint256) {
        return _allPayrolls.length;
    }

    /// @notice Look up a payroll by its global index.
    /// @dev Reverts OffsetOutOfRange when index >= payrollCount().
    /// @param index Zero-based position in the global all-payrolls list.
    /// @return The payroll address at that index.
    function payrollAt(uint256 index) external view returns (address) {
        if (index >= _allPayrolls.length) revert OffsetOutOfRange();
        return _allPayrolls[index];
    }

    /// @notice Return a page of all payrolls ever deployed by this factory.
    /// @dev Never reverts. Returns an empty array when offset is past the end.
    ///      The returned slice is capped at 100 entries regardless of limit.
    /// @param offset Zero-based start index.
    /// @param limit  Maximum entries to return (silently capped at 100).
    /// @return Payroll addresses in deployment order, up to limit entries.
    function allPayrolls(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = _allPayrolls.length;
        if (offset >= total) return new address[](0);
        uint256 cap = limit > 100 ? 100 : limit;
        uint256 end = offset + cap;
        if (end > total) end = total;
        uint256 len = end - offset;
        address[] memory result = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = _allPayrolls[offset + i];
        }
        return result;
    }

    /// @notice Number of payrolls originally deployed by employer.
    /// @dev This is a historical count. It never decreases after a two-step
    ///      employer handover on the Payroll contract.
    /// @param employer The address that called createPayroll.
    /// @return Number of payrolls that employer originally created.
    function createdBy(address employer) external view returns (uint256) {
        return _createdBy[employer].length;
    }

    /// @notice Return a page of payrolls originally deployed by employer.
    /// @dev Never reverts. Returns an empty array when offset is past the end.
    ///      The returned slice is capped at 100 entries regardless of limit.
    ///      This is a history list: after a Payroll's employer handover the entry
    ///      remains here under the original creator. Use Payroll.employer() for
    ///      the live authority.
    /// @param employer The address that called createPayroll.
    /// @param offset   Zero-based start index into that employer's list.
    /// @param limit    Maximum entries to return (silently capped at 100).
    /// @return Payroll addresses in creation order, up to limit entries.
    function payrollsCreatedBy(address employer, uint256 offset, uint256 limit) external view returns (address[] memory) {
        address[] storage list = _createdBy[employer];
        uint256 total = list.length;
        if (offset >= total) return new address[](0);
        uint256 cap = limit > 100 ? 100 : limit;
        uint256 end = offset + cap;
        if (end > total) end = total;
        uint256 len = end - offset;
        address[] memory result = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = list[offset + i];
        }
        return result;
    }
}
