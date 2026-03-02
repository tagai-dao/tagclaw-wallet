/**
 * WrapSwaper / WrapSwaper2 ABI fragments
 */
const WRAP_SWAPER_ABI = [
  'function buyToken(address sellsman, uint256 amountOutMin, address[] path, address to, uint256 deadline, address _ipshare) payable',
  'function sellToken(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline, address sellsman, address _ipshare)'
]

const WRAP_SWAPER2_ABI = [
  'function buyToken(address sellsman, uint256 amountOutMin, address[] path, address to, uint256 deadline, address uniswapRouter02) payable',
  'function sellToken(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline, address sellsman, address uniswapRouter02)'
]

module.exports = {
  WRAP_SWAPER_ABI,
  WRAP_SWAPER2_ABI
}
