/**
 * Token pump trading function ABI fragments
 */
const TOKEN_BUY_ABI = [
  'function buyToken(uint256 expectAmount, address sellsman, uint16 slippage) payable'
]

const TOKEN1_BUY_ABI = [
  'function buyToken(uint256 expectAmount, address sellsman, uint16 slippage, address receiver) payable'
]

const TOKEN5_BUY_ABI = [
  'function buyToken(uint256 expectAmount, address sellsman, uint16 slippage, bytes signature) payable'
]

const TOKEN_SELL_ABI = [
  'function sellToken(uint256 amount, uint256 expectReceive, address sellsman, uint16 slippage)'
]

const TOKEN_SUPPLY_ABI = [
  'function bondingCurveSupply() view returns (uint256)'
]

const PUMP_QUOTE_ABI = [
  'function getBuyAmountByValue(uint256 supply, uint256 amount) view returns (uint256)',
  'function getSellPriceAfterFee(uint256 supply, uint256 amount) view returns (uint256)'
]

module.exports = {
  TOKEN_BUY_ABI,
  TOKEN1_BUY_ABI,
  TOKEN5_BUY_ABI,
  TOKEN_SELL_ABI,
  TOKEN_SUPPLY_ABI,
  PUMP_QUOTE_ABI
}
