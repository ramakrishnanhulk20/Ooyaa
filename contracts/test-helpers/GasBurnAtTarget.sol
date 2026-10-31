// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev ERC-20 mock whose transfer() to a designated "target" payee costs
///      exactly TARGET_TOTAL gas units in total (burn + transfer body), regardless
///      of call context warmth.
///
///      Technique (burn-last): the transfer body runs first -- balance updates and
///      event -- then a spin loop burns gas until the total consumed since function
///      entry reaches TARGET_TOTAL.  Because the burn fills the remainder after the
///      body, the total is constant even when balance slots are cold (isolated mode)
///      or warm (shared mode).
///
///      TARGET_TOTAL = 106,500:
///        - Fits inside PAYEE_TRANSFER_GAS (110,000) so payee is paid.
///        - Exceeds 55,000 (half of 110,000), so a budget of 100,000 is exhausted
///          because 106,500 > 100,000 and the payee is deferred.
///      test_BudgetCoversTwiceRealTransfer proves both outcomes with direct calls.
contract GasBurnAtTarget {
    string public name;
    string public symbol;
    uint8  public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public burnTarget;

    /// @dev Total gas cost (burn + transfer body) for a transfer to burnTarget.
    ///      Chosen so TARGET_TOTAL > PAYEE_TRANSFER_GAS / 2 and
    ///      TARGET_TOTAL < PAYEE_TRANSFER_GAS.
    uint256 public constant TARGET_TOTAL = 106_500;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
    }

    function setBurnTarget(address target) external {
        burnTarget = target;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply    += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        return _transfer(from, to, amount);
    }

    /// @dev For the burn target: body runs first, then gas is burned until total
    ///      since entry == TARGET_TOTAL.  Constant total in any warmth context.
    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 entryGas = gasleft();
        bool ok = _transfer(msg.sender, to, amount);
        if (to == burnTarget) {
            // Spin until total consumed since entry >= TARGET_TOTAL.
            // gasleft() decreases; stop when entryGas - gasleft() >= TARGET_TOTAL.
            uint256 stopAt = entryGas - TARGET_TOTAL;
            while (gasleft() > stopAt) {
                assembly { pop(sload(0)) }
            }
        }
        return ok;
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
