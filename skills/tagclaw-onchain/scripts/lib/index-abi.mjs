import { POOL_KEY_TYPE } from './v14-abi.mjs'
// BSC Pump15/Token15 and Basket V4 ABI fragments verified against tiptag-ui artifacts.
export const TOKEN_INDEX_ABI = [
  'function indexToken() view returns(address)', 'function nutboxCommunity() view returns(address)',
  'function listingHook() view returns(address)', 'function componentCount() view returns(uint256)',
  'function componentAt(uint256) view returns(address asset,uint16 weight,address pair)',
  'function pendingBuybackReward(address) view returns(uint256)',
  'function claimBuybackReward(address) returns(uint256)'
]
export const PUMP_EXTRA_ABI = ['function erc20StakingFactory() view returns(address)']
export const HANDLE_ABI = ['function handleOf(address) view returns(string)']
export const CURVE_LIMIT_ABI = ['function innerMarketBought(address) view returns(uint256)', 'function INNER_MARKET_BUY_LIMIT() view returns(uint256)']
export const PERMISSIONS_ABI = ['function operators(address) view returns(bool)', 'function approvedCreatorForwarders(address) view returns(bool)']
export const BASKET_TOKEN_ABI = [
  'function protocolVersion() view returns(uint32)', 'function registry() view returns(address)',
  'function engine() view returns(address)', 'function settlementToken() view returns(address)',
  'function rebalanceExecutor() view returns(address)', 'function assetCount() view returns(uint256)',
  'function assetAt(uint256) view returns(address asset,uint16 targetWeightBps,uint256 activeReserve)',
  'function effectiveSupply() view returns(uint256)', 'function basketFeeBps() view returns(uint16)',
  'function claimableHolderFees(address) view returns(uint256)', 'function pendingCreatorFees() view returns(uint256)',
  'function pendingLauncherFees() view returns(uint256)', 'function pendingFrontendFees(address) view returns(uint256)',
  'function creatorPayout() view returns(address)', 'function launcherPayout() view returns(address)',
  'function claimHolderFeesFor(address) returns(uint256)', 'function claimCreatorFees() returns(uint256)',
  'function claimLauncherFees() returns(uint256)', 'function claimFrontendFeesFor(address) returns(uint256)',
  'function redeemInKind(uint256,bool[],address) payable'
]
export const BASKET_REGISTRY_ABI = ['function basketVersion(address) view returns(uint32)']
export const BASKET_HOOK_ABI = [`function selfPoolKey(address) view returns(${POOL_KEY_TYPE})`]
export const BASKET_SWAP_ABI = [
  'function basketHook() view returns(address)', 'function settlementToken() view returns(address)',
  'function buyExactSettlement(address,uint256,uint256,bytes,address) returns(uint256)',
  'function sellExactBasket(address,uint256,uint256,bytes,address) returns(uint256)'
]
export const ROUTE_TYPE = `(uint8 venue,address poolQuoteToken,${POOL_KEY_TYPE} v4Pool,uint24 v3Fee,uint16 defaultMaxExecutionLossBps)`
export const BASKET_ROUTES_ABI = [`function assetRouteAt(uint256) view returns(${ROUTE_TYPE})`]
export const BASKET_EXECUTOR_ABI = [`function quoteAssetToWbnb(${ROUTE_TYPE},address,uint256) view returns(uint256)`]
export const BASKET_TRADE_TYPE = '(address frontend,uint256 minBasketOut,uint256 minSettlementOut,uint256[] legMins,uint160[] legSqrtPriceLimitsX96,uint160 settlementToWbnbSqrtPriceLimitX96,bool[] allowFailedLegs)'
export const COMMUNITY_INDEX_ABI = ['function getCommittee() view returns(address)', 'function getCommunityToken() view returns(address)', 'function createdPools(uint256) view returns(address)']
