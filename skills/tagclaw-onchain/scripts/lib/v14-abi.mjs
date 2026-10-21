// Matches tiptag-ui/src/utils/v14/Pump14.json and v13/Token13.json.
export const INDEX_CONFIG_TYPE = '(string name,string symbol,address[] constituentAssets,uint16[] targetWeights,uint16 basketFeeBps,uint16 creatorShareBps,bool retainCommunityOwnership)'
export const CREATE_V14 = `createToken(string,bytes32,${INDEX_CONFIG_TYPE})`
export const CREATE_V14_WITH_POOLS = `createToken(string,bytes32,${INDEX_CONFIG_TYPE},(address factory,uint16 rewardRatio,bytes meta)[])`
export const PUMP14_ABI = [
  'function VERSION() view returns(uint256)',
  'function tokenImplementation() view returns(address)',
  'function createdTicks(string) view returns(bool)',
  'function createdTokens(address) view returns(bool)',
  'function approvedConstituent(address) view returns(bool)',
  'function optionalPoolFactories(address) view returns(string name,uint16 maxRewardRatio,bool enabled)',
  'function createFee() view returns(uint256)',
  'function getIPShare() view returns(address)',
  'function nutboxCommittee() view returns(address)',
  `function ${CREATE_V14} payable returns(address)`,
  `function ${CREATE_V14_WITH_POOLS} payable returns(address)`,
  'function getBuyAmountByValue(uint256,uint256) view returns(uint256)',
  'function getSellPriceAfterFee(uint256,uint256) view returns(uint256)',
  'function getPrice(uint256,uint256) view returns(uint256)',
  'event NewToken(string tick,address indexed token,address indexed creator)',
  'event NutboxLinked(address indexed token,address indexed community)',
  'event NutboxStakingPoolLinked(address indexed token,address indexed pool,address indexed lpToken,uint16 rewardRatio)',
  'event NutboxOptionalPoolLinked(address indexed token,address indexed pool,address indexed factory,uint16 rewardRatio)'
]

export const TOKEN14_ABI = [
  'function listed() view returns(bool)',
  'function listingPending() view returns(bool)',
  'function bondingCurveSupply() view returns(uint256)',
  'function getBuyFeeRatios() view returns(uint256,uint256)',
  'function v4PoolId() view returns(bytes32)',
  'function buyToken(uint256 expectAmount,address sellsman,uint16 slippage) payable returns(uint256)',
  'function sellToken(uint256 amount,uint256 expectReceive,address sellsman,uint16 slippage)'
]

export const POOL_KEY_TYPE = '(address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters)'
export const PCS_MANAGER_ABI = [
  `function poolIdToPoolKey(bytes32) view returns(${POOL_KEY_TYPE})`,
  'function getSlot0(bytes32) view returns(uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)'
]
export const PCS_QUOTER_ABI = [
  `function quoteExactInputSingle((${POOL_KEY_TYPE} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)`
]
export const PCS_ROUTER_ABI = ['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']
export const PERMIT2_ABI = [
  'function allowance(address owner,address token,address spender) view returns(uint160 amount,uint48 expiration,uint48 nonce)',
  'function approve(address token,address spender,uint160 amount,uint48 expiration)'
]
