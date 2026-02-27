/**
 * ERC20 ABI fragments (minimal set)
 */
const ERC20_BALANCE_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]

const ERC20_TRANSFER_ABI = [
  ...ERC20_BALANCE_ABI,
  'function transfer(address to, uint256 amount) returns (bool)'
]

const TOKEN_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]

module.exports = {
  ERC20_BALANCE_ABI,
  ERC20_TRANSFER_ABI,
  TOKEN_ALLOWANCE_ABI
}
