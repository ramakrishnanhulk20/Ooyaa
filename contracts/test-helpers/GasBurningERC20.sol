// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev MockERC20 variant that, for a configurable set of addresses, burns all
///      forwarded gas instead of reverting. Used to test that the PAYEE_TRANSFER_GAS
///      cap prevents a malicious payee from starving the payees after it.
///
///      Multiple addresses may be registered as gas burners via setGasBurner(addr, true).
///      For backward compatibility, setGasBurner(addr) (single-argument) still works.
///      All other addresses behave like a normal ERC-20 transfer.
contract GasBurningERC20 {
    string public name;
    string public symbol;
    uint8  public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev Set of addresses whose transfer calls will spin until gas is exhausted.
    mapping(address => bool) public isGasBurner;

    /// @dev Kept for backward compatibility with tests that use the single-argument form.
    address public gasBurner;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
    }

    /// @dev Register or deregister a single gas-burning address (multi-burner API).
    function setGasBurner(address addr, bool enabled) external {
        isGasBurner[addr] = enabled;
        if (enabled) gasBurner = addr; // keep legacy field pointing at the most-recently-set burner
    }

    /// @dev Backward-compatible single-argument form: registers addr as a burner.
    function setGasBurner(address addr) external {
        isGasBurner[addr] = true;
        gasBurner = addr;
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

    function transfer(address to, uint256 amount) external returns (bool) {
        if (isGasBurner[to]) {
            // Spin until all forwarded gas is consumed. The cap in Payroll
            // (PAYEE_TRANSFER_GAS) means only that budget is lost here.
            // solhint-disable-next-line no-inline-assembly
            assembly {
                // infinite loop inside the gas budget
                let start := gas()
                for {} gt(gas(), 0) {} {}
            }
            // unreachable, but Solidity needs a return path
            return false;
        }
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
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
