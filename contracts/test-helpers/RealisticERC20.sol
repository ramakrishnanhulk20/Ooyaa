// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev MockERC20 variant whose transfer() always costs exactly TARGET_TOTAL gas
///      units, regardless of call context warmth (isolated or shared Foundry mode).
///
///      Technique (burn-last): the standard ERC-20 body runs first (balance updates
///      and event emit), then a spin loop burns gas until the total consumed since
///      function entry reaches TARGET_TOTAL.  Fills the remainder after the body,
///      so the total is constant whether slots are cold or warm.
///
///      TARGET_TOTAL = 50,000 is close to a real Arc USDC transfer to a fresh
///      address (~53,000 execution gas measured with eth_estimateGas minus base
///      and calldata costs).  It is well below PAYEE_TRANSFER_GAS (110,000), which
///      is the guard that matters; the 2x margin test in PayrollFork.t.sol
///      (test_fork_TransferCostHasTwoXMargin) verifies the real Arc figure.
///
///      Used by test_LowGasRunRevertsNeverDefers_Realistic and
///      test_RealisticTransferCostsAbout50k.
contract RealisticERC20 {
    string public name;
    string public symbol;
    uint8  public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocklisted;

    /// @dev Total gas cost (ERC-20 body + burn) per transfer() call.
    uint256 public constant TARGET_TOTAL = 50_000;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error Blocklisted(address addr);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
    }

    function setBlocklist(address addr, bool blocked) external {
        blocklisted[addr] = blocked;
    }

    function mint(address to, uint256 amount) external {
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        emit Transfer(from, address(0), amount);
    }

    /// @dev Body runs first, then burns until total since entry == TARGET_TOTAL.
    function transfer(address to, uint256 amount) external returns (bool) {
        if (blocklisted[to]) revert Blocklisted(to);
        uint256 entryGas = gasleft();
        _transfer(msg.sender, to, amount);
        uint256 stopAt = entryGas - TARGET_TOTAL;
        while (gasleft() > stopAt) {
            assembly { pop(sload(0)) }
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (blocklisted[to]) revert Blocklisted(to);
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }
}
