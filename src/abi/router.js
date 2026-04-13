/**
 * DEX router / pair / pool ABI fragments
 */
const UNISWAP_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)'
]

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)'
]

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)'
]

const CL_POOL_MANAGER_ABI = [
  'function getSlot0(bytes32 id) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'
]

export {
  UNISWAP_ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
  CL_POOL_MANAGER_ABI
}
