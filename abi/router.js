/**
 * DEX router ABI fragments
 */
const UNISWAP_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)'
]

module.exports = {
  UNISWAP_ROUTER_ABI
}
