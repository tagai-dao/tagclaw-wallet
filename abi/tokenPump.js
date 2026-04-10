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

const TOKEN8_BUY_ABI = [
  'function buyToken(uint256 expectAmount, address sellsman, uint16 slippage, bytes signature, uint256 deadline) payable'
]

const TOKEN_SELL_ABI = [
  'function sellToken(uint256 amount, uint256 expectReceive, address sellsman, uint16 slippage)'
]

const TOKEN8_SELL_ABI = [
  'function sellToken(uint256 amount, uint256 expectReceive, address sellsman, uint16 slippage, bytes signature, uint256 deadline)'
]

const TOKEN_SUPPLY_ABI = [
  'function bondingCurveSupply() view returns (uint256)'
]

const TOKEN_NUTBOX_ABI = [
  'function nutboxCommunity() view returns (address)',
  'function nutboxSocialPool() view returns (address)'
]

const PUMP_CREATE_ABI = [
  'function createFee() view returns (uint256)',
  'function getIPShare() view returns (address)',
  'function nutboxCommittee() view returns (address)',
  'function getLastSaltIndex(address user) view returns (uint256)',
  'function createToken(string tick, bytes32 salt) payable returns (address)',
  'event NewToken(string tick, address indexed token, address indexed creator)',
  'event NutboxLinked(address indexed token, address indexed community, address indexed socialPool)'
]

const PUMP_QUOTE_ABI = [
  'function getPrice(uint256 supply, uint256 amount) view returns (uint256)',
  'function getBuyAmountByValue(uint256 supply, uint256 amount) view returns (uint256)',
  'function getSellPriceAfterFee(uint256 supply, uint256 amount) view returns (uint256)'
]

module.exports = {
  TOKEN_BUY_ABI,
  TOKEN1_BUY_ABI,
  TOKEN5_BUY_ABI,
  TOKEN8_BUY_ABI,
  TOKEN_SELL_ABI,
  TOKEN8_SELL_ABI,
  TOKEN_SUPPLY_ABI,
  TOKEN_NUTBOX_ABI,
  PUMP_CREATE_ABI,
  PUMP_QUOTE_ABI
}
