// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Payroll
/// @notice USDC payroll contract for one employer. A fixed payee list is paid
///         once per period, strictly in order. Anyone may call run() to process
///         the next due period and earn a small USDC tip. A payee whose transfer
///         fails (e.g. Circle blocklist) receives a deferred claim instead of
///         halting the payroll. The employer can add, update and remove payees
///         between periods, close the contract to cap future obligations, and
///         transfer the employer role in a two-step process.
contract Payroll is ReentrancyGuard {
    /// @dev USDC ERC-20 on Arc (mainnet and testnet share this address).
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    /// @dev Gas budget forwarded to each payee's USDC.transfer call in run().
    ///      Sized to satisfy two rules:
    ///      C6 (worst case): a 100-payee run where every payee burns its full budget
    ///      must fit in one transaction under Arc's EIP-7825 limit of 16,777,216 gas.
    ///      At 110,000 the worst case is about 100 * (111,746 + 44,000) + fixed costs
    ///      ≈ 15.6 M gas, safely below the cap.
    ///      C35 (2x margin): the budget must be at least twice the measured cost of a
    ///      real Arc USDC transfer to a fresh address (~53,000 gas of execution),
    ///      so 110,000 keeps the required 2x margin.
    uint256 private constant PAYEE_TRANSFER_GAS = 110_000;

    /// @dev Minimum gas that must remain, beyond PAYEE_TRANSFER_GAS, before each
    ///      transfer attempt so that a payee whose transfer fails can still be
    ///      recorded as deferred. About 3,000 gas remains after a deferral that
    ///      burned the full budget. If the rest of the run (the tip transfer and
    ///      PaydayRun emit) then runs short, the whole run reverts. C35 allows
    ///      this because the runner simply did not supply enough gas. The reserve
    ///      does NOT cover the tip; it only covers the accounting needed to defer
    ///      a payee and continue to the next one.
    uint256 private constant PAYEE_GAS_RESERVE = 50_000;

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    /// @notice Reverted by the constructor when employer_ is address(0).
    error ZeroEmployer();
    /// @notice Reverted by the constructor when payees and amounts have different lengths.
    error LengthMismatch();
    /// @notice Reverted by the constructor when the payee list is empty.
    error EmptyPayeeList();
    /// @notice Reverted by the constructor and addPayee when the payee count would exceed 100.
    error TooManyPayees();
    /// @notice Reverted when a payee address is address(0).
    error ZeroPayee();
    /// @notice Reverted when the same payee address appears more than once.
    error DuplicatePayee(address payee);
    /// @notice Reverted when a payee address equals address(this).
    error PayeeIsThis();
    /// @notice Reverted when a payee address equals the USDC contract address.
    error PayeeIsUsdc();
    /// @notice Reverted when a payee amount is zero.
    error ZeroAmount();
    /// @notice Reverted when a payee amount exceeds 1_000_000e6 (one million USDC).
    error AmountTooLarge();
    /// @notice Reverted by the constructor when startTime_ is before block.timestamp.
    error StartTimeTooEarly();
    /// @notice Reverted by the constructor when startTime_ is more than 365 days ahead.
    error StartTimeTooLate();
    /// @notice Reverted by the constructor when periodLength_ is under 60 seconds.
    error PeriodLengthTooShort();
    /// @notice Reverted by the constructor when periodLength_ is over 366 days.
    error PeriodLengthTooLong();
    /// @notice Reverted by the constructor when tipPerRun_ exceeds 10e6 (10 USDC).
    error TipTooLarge();
    /// @notice Reverted by run() when no started period is waiting to be paid.
    error NothingDue();
    /// @notice Reverted by run() when the USDC balance is too low to cover
    ///         totalDeferred + periodTotal + tipPerRun.
    error Underfunded();
    /// @notice Reverted by run() when gas remaining before a payee transfer is
    ///         insufficient to give that payee its full PAYEE_TRANSFER_GAS budget
    ///         plus PAYEE_GAS_RESERVE for the remainder of the function.
    error InsufficientGasForRun();
    /// @notice Reverted by employer-only functions when msg.sender is not the employer.
    error NotEmployer();
    /// @notice Reverted by acceptEmployer() when msg.sender is not pendingEmployer.
    error NotPendingEmployer();
    /// @notice Reverted by cancelEmployerTransfer() when pendingEmployer is address(0).
    error NoPendingTransfer();
    /// @notice Reverted by transferEmployer() when the proposed new employer is address(0).
    error ZeroNewEmployer();
    /// @notice Reverted by transferEmployer() when the proposed new employer equals the current one.
    error SameEmployer();
    /// @notice Reverted by transferEmployer() when the proposed new employer is address(this) or the
    ///         USDC contract address. Either would make the free balance permanently unrecoverable
    ///         because those addresses cannot call withdraw().
    error InvalidNewEmployer();
    /// @notice Reverted by withdraw() when amount exceeds freeBalance().
    error WithdrawExceedsFree();
    /// @notice Reverted by fund() when amount is zero.
    error ZeroFundAmount();
    /// @notice Reverted by claim() when claimable[msg.sender] is zero.
    error NothingToClaim();
    /// @notice Reverted by addPayee, updatePayee and removePayee when a started
    ///         period has not yet been run (nextUnpaid < startedPeriods()).
    error ScheduleLocked();
    /// @notice Reverted by updatePayee and removePayee when the address is not a payee.
    error PayeeNotFound();
    /// @notice Reverted by removePayee when removing the last payee (use close instead).
    error LastPayee();
    /// @notice Reverted by close() when the payroll is already closed.
    error AlreadyClosed();
    /// @notice Reverted by addPayee, updatePayee and removePayee when the payroll is closed.
    error Closed();
    /// @notice Reverted by withdraw() when amount is zero.
    error WithdrawZero();

    // -------------------------------------------------------------------------
    // State snapshot struct
    // -------------------------------------------------------------------------

    /// @notice A point-in-time snapshot returned by getState().
    struct PayrollState {
        address employer;
        address pendingEmployer;
        uint64 startTime;
        uint64 periodLength;
        uint256 tipPerRun;
        uint256 periodTotal;
        uint256 nextUnpaid;
        uint256 startedPeriods;
        uint256 owed;
        uint256 freeBalance;
        uint256 balance;
        uint256 runway;
        uint256 totalDeferred;
        uint256 payeeCount;
        bool closed;
        uint256 closedAt;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Address with employer authority (withdraw, payee changes, close, transfer).
    address public employer;

    /// @notice Proposed new employer awaiting acceptEmployer(); zero when no transfer is pending.
    address public pendingEmployer;

    /// @notice Timestamp at which period 0 starts.
    uint64 public startTime;

    /// @notice Duration of each period in seconds.
    uint64 public periodLength;

    /// @notice USDC tip (6-decimal units) transferred to the run() caller each period.
    uint256 public tipPerRun;

    /// @dev Dense ordered list of current payee addresses.
    address[] private _payees;

    /// @notice 1-based index of each payee in _payees; zero means not a payee.
    mapping(address => uint256) public indexPlusOne;

    /// @notice Per-period USDC amount for each payee (6-decimal units).
    mapping(address => uint256) public amountOf;

    /// @notice Sum of all current payee amounts; updated on every payee change.
    uint256 public periodTotal;

    /// @notice Index of the next period to be paid; starts at 0 and increments in run().
    uint256 public nextUnpaid;

    /// @notice Accumulated USDC owed to each payee via deferred payouts; claimable by that payee only.
    mapping(address => uint256) public claimable;

    /// @notice Sum of all claimable amounts across all payees.
    uint256 public totalDeferred;

    /// @notice True after close() is called; caps future period obligations.
    bool public closed;

    /// @notice Raw (uncapped) started-period count at the moment close() was called.
    ///         Periods below this index still run; nothing at or above is ever owed.
    uint256 public closedAt;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when USDC is deposited via fund().
    /// @param from   Depositor address (always msg.sender).
    /// @param amount USDC deposited (6-decimal units).
    event Funded(address indexed from, uint256 amount);

    /// @notice Emitted once per payee for each period successfully paid in run().
    ///         Never emitted for a deferred amount.
    /// @param payee  Payee who received the transfer.
    /// @param period Zero-based index of the period just paid.
    /// @param amount USDC transferred.
    event PayslipIssued(address indexed payee, uint256 indexed period, uint256 amount);

    /// @notice Emitted when a payee's transfer fails in run() and the amount is
    ///         held for the payee to claim later.
    /// @param payee  Payee whose transfer failed.
    /// @param period Zero-based index of the period being run.
    /// @param amount USDC added to claimable[payee].
    event PayoutDeferred(address indexed payee, uint256 indexed period, uint256 amount);

    /// @notice Emitted at the end of every successful run().
    ///         paid + deferred == periodTotal; tip is tipPerRun (0 when tipPerRun is 0).
    /// @param period   Zero-based index of the period just paid.
    /// @param runner   Address that called run() and received the tip.
    /// @param paid     Total USDC transferred directly to payees.
    /// @param deferred Total USDC deferred to claimable balances.
    /// @param tip      USDC transferred to runner (0 when tipPerRun is 0).
    event PaydayRun(uint256 indexed period, address indexed runner, uint256 paid, uint256 deferred, uint256 tip);

    /// @notice Emitted when a payee successfully calls claim().
    /// @param payee  Claimant (always msg.sender).
    /// @param amount USDC transferred.
    event Claimed(address indexed payee, uint256 amount);

    /// @notice Emitted when the employer successfully calls withdraw().
    /// @param to     Recipient of the withdrawal (always the employer).
    /// @param amount USDC transferred.
    event Withdrawn(address indexed to, uint256 amount);

    /// @notice Emitted when a payee is added via addPayee().
    /// @param payee      New payee address.
    /// @param amount     Per-period USDC amount.
    /// @param fromPeriod First period index the change applies to (startedPeriods() at call time).
    event PayeeAdded(address indexed payee, uint256 amount, uint256 fromPeriod);

    /// @notice Emitted when a payee's amount is updated via updatePayee().
    /// @param payee      Existing payee address.
    /// @param amount     New per-period USDC amount.
    /// @param fromPeriod First period index the change applies to (startedPeriods() at call time).
    event PayeeUpdated(address indexed payee, uint256 amount, uint256 fromPeriod);

    /// @notice Emitted when a payee is removed via removePayee().
    /// @param payee      Removed payee address.
    /// @param fromPeriod First period index the change applies to (startedPeriods() at call time).
    event PayeeRemoved(address indexed payee, uint256 fromPeriod);

    /// @notice Emitted when close() is called.
    /// @param closedAt Raw started-period count at the moment of close.
    event PayrollClosed(uint256 closedAt);

    /// @notice Emitted when transferEmployer() records a pending transfer.
    /// @param current The current employer.
    /// @param pending The proposed new employer.
    event EmployerTransferStarted(address indexed current, address indexed pending);

    /// @notice Emitted when acceptEmployer() completes the transfer.
    /// @param previous The outgoing employer.
    /// @param current  The new employer.
    event EmployerTransferred(address indexed previous, address indexed current);

    /// @notice Emitted when cancelEmployerTransfer() clears a pending transfer.
    /// @param current   The employer who cancelled.
    /// @param cancelled The pending address that was cleared.
    event EmployerTransferCancelled(address indexed current, address indexed cancelled);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Set up the payroll schedule.
    /// @dev Validates each payee and amount inside the loop; a revert anywhere
    ///      rolls back all storage written so far. After the loop, validates
    ///      the time and period parameters. Uniqueness is tracked via
    ///      indexPlusOne, never a payee-list loop.
    /// @param employer_    Address that will hold employer authority. Non-zero.
    /// @param payees       Payee addresses, 1 to 100, all unique, non-zero, not
    ///                     address(this), and not the USDC address.
    /// @param amounts      Per-period USDC amount for each payee; each > 0 and
    ///                     at most 1_000_000e6.
    /// @param startTime_   Timestamp for period 0: must be >= block.timestamp
    ///                     and <= block.timestamp + 365 days.
    /// @param periodLength_ Seconds per period: 60 s to 366 days.
    /// @param tipPerRun_   USDC tip per run() call: 0 to 10e6.
    constructor(
        address employer_,
        address[] memory payees,
        uint256[] memory amounts,
        uint64 startTime_,
        uint64 periodLength_,
        uint256 tipPerRun_
    ) {
        if (employer_ == address(0)) revert ZeroEmployer();
        if (payees.length != amounts.length) revert LengthMismatch();
        if (payees.length == 0) revert EmptyPayeeList();
        if (payees.length > 100) revert TooManyPayees();

        uint256 len = payees.length;
        for (uint256 i = 0; i < len; i++) {
            address payee = payees[i];
            uint256 amount = amounts[i];

            if (payee == address(0)) revert ZeroPayee();
            if (indexPlusOne[payee] != 0) revert DuplicatePayee(payee);
            if (payee == address(this)) revert PayeeIsThis();
            if (payee == address(USDC)) revert PayeeIsUsdc();
            if (amount == 0) revert ZeroAmount();
            if (amount > 1_000_000e6) revert AmountTooLarge();

            periodTotal += amount;
            amountOf[payee] = amount;
            _payees.push(payee);
            indexPlusOne[payee] = _payees.length;
        }

        if (startTime_ < uint64(block.timestamp)) revert StartTimeTooEarly();
        if (startTime_ > uint64(block.timestamp + 365 days)) revert StartTimeTooLate();
        if (periodLength_ < 60) revert PeriodLengthTooShort();
        if (periodLength_ > 366 days) revert PeriodLengthTooLong();
        if (tipPerRun_ > 10e6) revert TipTooLarge();

        employer = employer_;
        startTime = startTime_;
        periodLength = periodLength_;
        tipPerRun = tipPerRun_;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Count of periods that have started, ignoring the closed cap.
    ///      Returns 0 before startTime, otherwise
    ///      (block.timestamp - startTime) / periodLength + 1.
    ///      Never reverts.
    function _startedPeriodsRaw() internal view returns (uint256) {
        if (block.timestamp < startTime) return 0;
        return (block.timestamp - startTime) / periodLength + 1;
    }

    /// @dev Count of started periods, capped at closedAt once closed.
    ///      Used by every function that needs the current obligation boundary.
    ///      Never reverts.
    function _startedPeriodsCapped() internal view returns (uint256) {
        uint256 raw = _startedPeriodsRaw();
        if (closed && raw > closedAt) return closedAt;
        return raw;
    }

    /// @dev Total USDC this contract is obligated to pay out. Defined exactly once
    ///      so every caller shares the same answer:
    ///        (startedPeriods - nextUnpaid) * (periodTotal + tipPerRun) + totalDeferred
    ///      Never reverts. Used by freeBalance(), withdraw(), and run().
    function _owed() internal view returns (uint256) {
        uint256 sp = _startedPeriodsCapped();
        uint256 unpaid = sp > nextUnpaid ? sp - nextUnpaid : 0;
        return unpaid * (periodTotal + tipPerRun) + totalDeferred;
    }

    /// @dev Attempt a USDC transfer to `to` using at most PAYEE_TRANSFER_GAS.
    ///      Return-data acceptance rules (matching SafeERC20):
    ///        0 bytes:        accepted only when the token has code.
    ///        1 to 31 bytes:  malformed; treated as a refusal (return false).
    ///        ≥32 bytes:      decode the first word as uint256; return true only
    ///                        when it equals 1 (i.e. the boolean true). Any other
    ///                        word (including 0 for false, or 2+) returns false.
    ///      Returns false when the call reverts, triggering deferral.
    ///      Never reverts.
    function _tryPayUsdc(address to, uint256 amount) internal returns (bool) {
        (bool success, bytes memory data) = address(USDC).call{gas: PAYEE_TRANSFER_GAS}(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        if (!success) return false;
        uint256 len = data.length;
        if (len == 0) {
            // No return data: accepted only when the token has code (i.e. it is a contract).
            return address(USDC).code.length > 0;
        }
        if (len < 32) {
            // Malformed return data: treat as refusal, never revert.
            return false;
        }
        // Decode only the first 32 bytes. Return true iff the word equals 1 (true).
        uint256 word;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            word := mload(add(data, 32))
        }
        return word == 1;
    }

    // -------------------------------------------------------------------------
    // Public views (none may revert)
    // -------------------------------------------------------------------------

    /// @notice Number of periods that have started, capped at closedAt after close.
    /// @dev Never reverts.
    /// @return Number of started periods.
    function startedPeriods() public view returns (uint256) {
        return _startedPeriodsCapped();
    }

    /// @notice Total USDC the contract is obligated to pay out right now.
    /// @dev Never reverts. Equals
    ///      (startedPeriods - nextUnpaid) * (periodTotal + tipPerRun) + totalDeferred.
    /// @return Total owed in USDC base units.
    function owed() public view returns (uint256) {
        return _owed();
    }

    /// @notice USDC the employer may withdraw without underfunding any due period.
    /// @dev Never reverts. Returns 0 when balance <= owed().
    /// @return Withdrawable USDC balance.
    function freeBalance() public view returns (uint256) {
        uint256 bal = USDC.balanceOf(address(this));
        uint256 o = _owed();
        return bal > o ? bal - o : 0;
    }

    /// @notice True when at least one started period is waiting to be run.
    /// @dev Never reverts.
    /// @return True if nextUnpaid < startedPeriods().
    function dueNow() public view returns (bool) {
        return nextUnpaid < _startedPeriodsCapped();
    }

    /// @notice Start timestamp of period n.
    /// @dev Overflow-safe for all n: guards both the multiplication and the
    ///      addition, returning type(uint256).max as a sentinel when either
    ///      would overflow. periodLength is at least 60, so division by zero
    ///      never occurs. Never reverts for any n.
    /// @param n Zero-based period index.
    /// @return Start timestamp of that period, or type(uint256).max when the
    ///         result would overflow uint256.
    function periodStart(uint256 n) public view returns (uint256) {
        uint256 st = uint256(startTime);
        uint256 pl = uint256(periodLength);
        // Guard both the multiplication and the addition in one check:
        // n * pl > type(uint256).max - st  iff  n > (type(uint256).max - st) / pl.
        // periodLength >= 60 so pl is never 0.
        if (n > (type(uint256).max - st) / pl) return type(uint256).max;
        return st + n * pl;
    }

    /// @notice Start timestamp of the next period to be paid.
    /// @dev Never reverts. Returns type(uint256).max when the payroll is closed
    ///      and all owed periods have been paid (nextUnpaid >= closedAt), meaning
    ///      no further payday is scheduled. Otherwise returns periodStart(nextUnpaid).
    /// @return Start timestamp of period nextUnpaid, or type(uint256).max when done.
    function nextPayday() public view returns (uint256) {
        if (closed && nextUnpaid >= closedAt) return type(uint256).max;
        return periodStart(nextUnpaid);
    }

    /// @notice How many full future periods the current free balance covers.
    /// @dev Never reverts. Returns 0 when closed, when freeBalance() is 0, or
    ///      when periodTotal + tipPerRun is zero. Counts only periods beyond
    ///      what is already owed, i.e. freeBalance() / (periodTotal + tipPerRun).
    /// @return Number of additional periods fundable at current free balance.
    function runway() public view returns (uint256) {
        if (closed) return 0;
        uint256 free = freeBalance();
        if (free == 0) return 0;
        uint256 costPerPeriod = periodTotal + tipPerRun;
        if (costPerPeriod == 0) return 0;
        return free / costPerPeriod;
    }

    /// @notice Number of payees currently in the schedule.
    /// @dev Never reverts.
    /// @return Current payee count.
    function payeeCount() public view returns (uint256) {
        return _payees.length;
    }

    /// @notice True if addr is currently a payee.
    /// @dev Never reverts.
    /// @param addr Address to check.
    /// @return True when indexPlusOne[addr] != 0.
    function isPayee(address addr) public view returns (bool) {
        return indexPlusOne[addr] != 0;
    }

    /// @notice Return all current payees and their per-period amounts.
    /// @dev Never reverts. Order matches the internal dense array.
    /// @return addrs Current payee addresses.
    /// @return amts  Per-period USDC amount for each payee.
    function getPayees() public view returns (address[] memory addrs, uint256[] memory amts) {
        uint256 len = _payees.length;
        addrs = new address[](len);
        amts = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            addrs[i] = _payees[i];
            amts[i] = amountOf[_payees[i]];
        }
    }

    /// @notice Return a full point-in-time snapshot of payroll state.
    /// @dev Never reverts. Reads all computed values in one call for frontends
    ///      and off-chain consumers that would otherwise need many separate calls.
    /// @return s PayrollState struct with all current values.
    function getState() public view returns (PayrollState memory s) {
        s.employer = employer;
        s.pendingEmployer = pendingEmployer;
        s.startTime = startTime;
        s.periodLength = periodLength;
        s.tipPerRun = tipPerRun;
        s.periodTotal = periodTotal;
        s.nextUnpaid = nextUnpaid;
        s.startedPeriods = startedPeriods();
        s.owed = owed();
        s.freeBalance = freeBalance();
        s.balance = USDC.balanceOf(address(this));
        s.runway = runway();
        s.totalDeferred = totalDeferred;
        s.payeeCount = _payees.length;
        s.closed = closed;
        s.closedAt = closedAt;
    }

    // -------------------------------------------------------------------------
    // State-changing functions
    // -------------------------------------------------------------------------

    /// @notice Pull `amount` USDC from msg.sender into this contract.
    /// @dev Allowed at any time, including after close, so a closed payroll can be
    ///      topped up to pay periods it already owes. Reverts ZeroFundAmount on 0.
    ///      Emits Funded.
    /// @param amount USDC to deposit (6-decimal units).
    function fund(uint256 amount) external {
        if (amount == 0) revert ZeroFundAmount();
        SafeERC20.safeTransferFrom(USDC, msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Pay the next unpaid period. Anyone may call and earns tipPerRun.
    /// @dev nonReentrant. Advances nextUnpaid before any transfer (CEI).
    ///      Each payee transfer is attempted via _tryPayUsdc with a capped gas
    ///      budget of PAYEE_TRANSFER_GAS (110,000). Before each transfer, the function
    ///      checks that gasleft() >= (PAYEE_TRANSFER_GAS * 64) / 63 + PAYEE_GAS_RESERVE
    ///      and reverts InsufficientGasForRun if not, so a runner cannot force
    ///      a deferral by sending too little gas. A failed transfer (token refusal,
    ///      blocklist, malformed return data, gas exhaustion within the budget)
    ///      defers the amount to claimable[payee] instead of reverting. The tip
    ///      transfer uses SafeERC20.safeTransfer and is skipped when tipPerRun is 0.
    ///      Reverts NothingDue when nextUnpaid >= startedPeriods().
    ///      Reverts Underfunded when balance < totalDeferred + periodTotal + tipPerRun.
    ///      Reverts InsufficientGasForRun when not enough gas remains before a payee transfer.
    ///      Emits PayslipIssued for each successful transfer,
    ///      PayoutDeferred for each failed transfer, and PaydayRun at the end.
    function run() external nonReentrant {
        if (nextUnpaid >= _startedPeriodsCapped()) revert NothingDue();
        if (USDC.balanceOf(address(this)) < totalDeferred + periodTotal + tipPerRun) revert Underfunded();

        uint256 period = nextUnpaid;
        nextUnpaid += 1;

        uint256 paid = 0;
        uint256 deferred = 0;
        uint256 len = _payees.length;
        for (uint256 i = 0; i < len; i++) {
            if (gasleft() < (PAYEE_TRANSFER_GAS * 64) / 63 + PAYEE_GAS_RESERVE) revert InsufficientGasForRun();
            address payee = _payees[i];
            uint256 amt = amountOf[payee];
            bool ok = _tryPayUsdc(payee, amt);
            if (ok) {
                paid += amt;
                emit PayslipIssued(payee, period, amt);
            } else {
                claimable[payee] += amt;
                totalDeferred += amt;
                deferred += amt;
                emit PayoutDeferred(payee, period, amt);
            }
        }

        if (tipPerRun != 0) {
            SafeERC20.safeTransfer(USDC, msg.sender, tipPerRun);
        }
        emit PaydayRun(period, msg.sender, paid, deferred, tipPerRun);
    }

    /// @notice Claim USDC deferred to msg.sender from prior run() failures.
    /// @dev nonReentrant. Clears the claim and lowers totalDeferred before the
    ///      transfer (CEI). Sends only to msg.sender so a blocklisted address
    ///      cannot redirect funds around Circle's blocklist.
    ///      Reverts NothingToClaim when claimable[msg.sender] is zero.
    ///      Emits Claimed.
    function claim() external nonReentrant {
        uint256 amt = claimable[msg.sender];
        if (amt == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalDeferred -= amt;
        SafeERC20.safeTransfer(USDC, msg.sender, amt);
        emit Claimed(msg.sender, amt);
    }

    /// @notice Transfer `amount` USDC from freeBalance to the employer.
    /// @dev nonReentrant. Sends to msg.sender (the employer) only; no caller
    ///      can name another destination, so funds cannot be routed around
    ///      Circle's blocklist. Cannot reduce the balance below owed().
    ///      Reverts NotEmployer when called by a non-employer address.
    ///      Reverts WithdrawZero when amount is zero.
    ///      Reverts WithdrawExceedsFree when amount > freeBalance().
    ///      Emits Withdrawn with to = the employer.
    /// @param amount Amount of USDC to withdraw (must be <= freeBalance()).
    function withdraw(uint256 amount) external nonReentrant {
        if (msg.sender != employer) revert NotEmployer();
        if (amount == 0) revert WithdrawZero();
        if (amount > freeBalance()) revert WithdrawExceedsFree();
        SafeERC20.safeTransfer(USDC, msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Add a new payee with a per-period amount. Employer only.
    /// @dev Reverts NotEmployer, Closed, ScheduleLocked, TooManyPayees, ZeroPayee,
    ///      DuplicatePayee, PayeeIsThis, PayeeIsUsdc, ZeroAmount, AmountTooLarge.
    ///      Applies only to periods that have not started yet.
    ///      Emits PayeeAdded with fromPeriod = startedPeriods() at call time.
    /// @param payee  Address to add (unique, non-zero, not this contract, not USDC).
    /// @param amount Per-period USDC amount (> 0, <= 1_000_000e6).
    function addPayee(address payee, uint256 amount) external {
        if (msg.sender != employer) revert NotEmployer();
        if (closed) revert Closed();
        if (nextUnpaid < _startedPeriodsCapped()) revert ScheduleLocked();
        if (_payees.length >= 100) revert TooManyPayees();
        if (payee == address(0)) revert ZeroPayee();
        if (indexPlusOne[payee] != 0) revert DuplicatePayee(payee);
        if (payee == address(this)) revert PayeeIsThis();
        if (payee == address(USDC)) revert PayeeIsUsdc();
        if (amount == 0) revert ZeroAmount();
        if (amount > 1_000_000e6) revert AmountTooLarge();

        periodTotal += amount;
        amountOf[payee] = amount;
        _payees.push(payee);
        indexPlusOne[payee] = _payees.length;
        emit PayeeAdded(payee, amount, _startedPeriodsCapped());
    }

    /// @notice Change the per-period amount for an existing payee. Employer only.
    /// @dev Reverts NotEmployer, Closed, ScheduleLocked, PayeeNotFound,
    ///      ZeroAmount, AmountTooLarge.
    ///      Applies only to periods that have not started yet.
    ///      Emits PayeeUpdated with fromPeriod = startedPeriods() at call time.
    /// @param payee  Existing payee address.
    /// @param amount New per-period USDC amount (> 0, <= 1_000_000e6).
    function updatePayee(address payee, uint256 amount) external {
        if (msg.sender != employer) revert NotEmployer();
        if (closed) revert Closed();
        if (nextUnpaid < _startedPeriodsCapped()) revert ScheduleLocked();
        if (indexPlusOne[payee] == 0) revert PayeeNotFound();
        if (amount == 0) revert ZeroAmount();
        if (amount > 1_000_000e6) revert AmountTooLarge();

        periodTotal = periodTotal - amountOf[payee] + amount;
        amountOf[payee] = amount;
        emit PayeeUpdated(payee, amount, _startedPeriodsCapped());
    }

    /// @notice Remove an existing payee. Employer only. Uses swap-and-pop to keep
    ///         the payee array dense with no gaps.
    /// @dev Reverts NotEmployer, Closed, ScheduleLocked, PayeeNotFound, LastPayee.
    ///      Applies only to periods that have not started yet.
    ///      Emits PayeeRemoved with fromPeriod = startedPeriods() at call time.
    /// @param payee Existing payee address to remove.
    function removePayee(address payee) external {
        if (msg.sender != employer) revert NotEmployer();
        if (closed) revert Closed();
        if (nextUnpaid < _startedPeriodsCapped()) revert ScheduleLocked();
        if (indexPlusOne[payee] == 0) revert PayeeNotFound();
        if (_payees.length == 1) revert LastPayee();

        uint256 idx = indexPlusOne[payee] - 1;
        uint256 lastIdx = _payees.length - 1;
        if (idx != lastIdx) {
            address last = _payees[lastIdx];
            _payees[idx] = last;
            indexPlusOne[last] = idx + 1;
        }
        _payees.pop();
        periodTotal -= amountOf[payee];
        amountOf[payee] = 0;
        indexPlusOne[payee] = 0;
        emit PayeeRemoved(payee, _startedPeriodsCapped());
    }

    /// @notice Close the payroll. No new periods will ever be owed after this.
    /// @dev Employer only. Sets closedAt to the uncapped raw started-period count.
    ///      Periods below closedAt still run. fund() remains allowed so a closed
    ///      payroll can be topped up to pay what it already owes.
    ///      Payee changes (addPayee, updatePayee, removePayee) revert Closed.
    ///      Reverts NotEmployer or AlreadyClosed.
    ///      Emits PayrollClosed.
    function close() external {
        if (msg.sender != employer) revert NotEmployer();
        if (closed) revert AlreadyClosed();
        closed = true;
        closedAt = _startedPeriodsRaw();
        emit PayrollClosed(closedAt);
    }

    /// @notice Start a two-step employer transfer by nominating a new employer.
    /// @dev Employer only. Calling again before acceptEmployer() replaces the
    ///      pending address. The transfer is not complete until acceptEmployer().
    ///      Reverts NotEmployer, ZeroNewEmployer, SameEmployer, InvalidNewEmployer.
    ///      Emits EmployerTransferStarted.
    /// @param newEmployer Proposed new employer. Must be non-zero, not the current employer,
    ///        not address(this), and not the USDC address. Transferring to address(this) or
    ///        USDC would make the free balance permanently unrecoverable (C10).
    function transferEmployer(address newEmployer) external {
        if (msg.sender != employer) revert NotEmployer();
        if (newEmployer == address(0)) revert ZeroNewEmployer();
        if (newEmployer == employer) revert SameEmployer();
        if (newEmployer == address(this) || newEmployer == address(USDC)) revert InvalidNewEmployer();
        pendingEmployer = newEmployer;
        emit EmployerTransferStarted(employer, newEmployer);
    }

    /// @notice Cancel a pending employer transfer. Employer only.
    /// @dev Clears pendingEmployer. The previously nominated address can no
    ///      longer call acceptEmployer().
    ///      Reverts NotEmployer when msg.sender is not the employer.
    ///      Reverts NoPendingTransfer when pendingEmployer is address(0).
    ///      Emits EmployerTransferCancelled.
    function cancelEmployerTransfer() external {
        if (msg.sender != employer) revert NotEmployer();
        if (pendingEmployer == address(0)) revert NoPendingTransfer();
        address cancelled = pendingEmployer;
        pendingEmployer = address(0);
        emit EmployerTransferCancelled(employer, cancelled);
    }

    /// @notice Complete the employer transfer. Only the pending employer may call.
    /// @dev Clears pendingEmployer after updating employer so the old employer
    ///      loses all authority in the same transaction.
    ///      Reverts NotPendingEmployer when msg.sender != pendingEmployer.
    ///      Emits EmployerTransferred.
    function acceptEmployer() external {
        if (msg.sender != pendingEmployer) revert NotPendingEmployer();
        address previous = employer;
        employer = msg.sender;
        pendingEmployer = address(0);
        emit EmployerTransferred(previous, msg.sender);
    }
}
