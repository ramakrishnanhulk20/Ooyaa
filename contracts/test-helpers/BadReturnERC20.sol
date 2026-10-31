// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev MockERC20 that returns a per-address configurable payload from transfer()
///      to test _tryPayUsdc's return-data acceptance rules (turn-07 spec items 2 & 16).
///
///      Per-address configuration:
///        returnLength[addr]: number of bytes to return for transfers to addr.
///                            0 = no return data (accepted when code exists).
///                            1 to 31 = malformed short data (must be deferred).
///                            ≥32  = decode first word; only word==1 is accepted.
///        returnWord[addr]:   the uint256 value written as the first word when
///                            returnLength[addr] >= 32. Default = 1 (true).
///
///      Addresses not configured get the normal ERC-20 response (32 bytes, word=1).
contract BadReturnERC20 {
    string public name;
    string public symbol;
    uint8  public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev Number of bytes to return for transfer to this address; 0 = default.
    mapping(address => uint256) public returnLength;
    /// @dev Word value to encode as the first 32 bytes; default 1 (true).
    mapping(address => uint256) public returnWord;
    /// @dev Set when setReturnLength has been called for this address.
    mapping(address => bool) public customLength;
    /// @dev Set when setReturnWord has been called for this address.
    mapping(address => bool) public customWord;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name     = _name;
        symbol   = _symbol;
        decimals = _decimals;
    }

    /// @dev Set how many bytes transfer() returns for transfers to `addr`.
    function setReturnLength(address addr, uint256 len) external {
        returnLength[addr] = len;
        customLength[addr] = true;
    }

    /// @dev Set the uint256 word encoded in the first 32 return bytes for `addr`.
    function setReturnWord(address addr, uint256 word) external {
        returnWord[addr] = word;
        customWord[addr] = true;
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

    /// @dev Returns a configurable payload. The Solidity return type is bytes to
    ///      allow arbitrary-length responses; the inline assembly below overrides
    ///      the ABI encoding and returns raw bytes of exactly the requested length.
    function transfer(address to, uint256 amount) external returns (bytes memory) {
        _transfer(msg.sender, to, amount);

        if (!customLength[to]) {
            // Default: return abi-encoded true (32 bytes, word = 1)
            // solhint-disable-next-line no-inline-assembly
            assembly { mstore(0x00, 1) return(0x00, 0x20) }
        }

        uint256 len  = returnLength[to];
        uint256 word = customWord[to] ? returnWord[to] : 1;

        if (len == 0) {
            // No return data
            // solhint-disable-next-line no-inline-assembly
            assembly { return(0x00, 0x00) }
        }

        if (len < 32) {
            // Short malformed payload: `len` bytes of 0xDE fill
            // solhint-disable-next-line no-inline-assembly
            assembly {
                // Fill 32 bytes at 0x00 with 0xDE repeated, then return only `len` of them.
                mstore(0x00, 0xDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDEDE)
                return(0x00, len)
            }
        }

        // len >= 32: write `word` as the first 32 bytes and return exactly `len` bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(0x00, word)
            return(0x00, len)
        }
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
