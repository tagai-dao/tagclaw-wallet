import { ethers } from 'ethers'
import * as D from './deployment.mjs'
import { call } from './snapshot.mjs'
import { address, uint, slippage, same, coder, nativeBalance, plan, poolKey } from './prepare.mjs'
import { PCS_MANAGER_ABI, POOL_KEY_TYPE } from './v14-abi.mjs'
import { ERC20_BALANCE_ABI, TOKEN_ALLOWANCE_ABI } from './erc20-abi.mjs'
import { IPSHARE_ABI } from './ipshare-abi.mjs'

export const AGENT_SWAP_ABI = [
  'function quoteBuy(address,uint8,bytes,uint256) returns(uint256)',
  'function quoteSell(address,uint8,bytes,uint256) returns(uint256)',
  'function buyToken(address,uint8,bytes,uint256,address,uint256,address) payable returns(uint256)',
  'function sellToken(address,uint8,bytes,uint256,uint256,address,uint256,address) returns(uint256)',
  'function HANDLE_REGISTRY() view returns(address)',
  'function ipshare() view returns(address)',
  'function nutboxRouter() view returns(address)',
  'function paused() view returns(bool)',
  'function sellsmanRatio() view returns(uint16)',
  'function tagaiRatio() view returns(uint16)',
  'function tokenNutboxFeeBps(address) view returns(uint16)',
  'function referralHookCodeHash(address) view returns(bytes32)'
]
const PAIR_ABI = ['function getPair(address,address) view returns(address)', 'function token0() view returns(address)', 'function token1() view returns(address)']
const HANDLE_ABI = ['function handleOf(address) view returns(string)']

/** Source metadata identifies a pool, never an arbitrary executable target. */
export async function agentSource(snapshot, state) {
  const token = address(state.token, 'token')
  if (!state.isImport && state.poolId) {
    const key = await poolKey(snapshot, token, state.poolId)
    return { sourceType: 3, sourceData: coder.encode([`(address quoter,${POOL_KEY_TYPE} pool)`], [[D.QUOTER, key]]), hook: key.hooks }
  }
  const dex = state.isImport ? Number(state.metadata.dexVersion) : 2
  if (dex === 2 || dex === 3) {
    const pool = state.isImport ? address(state.metadata.pair, 'pair')
      : address((await snapshot.read([call(D.V2_FACTORY, PAIR_ABI, 'getPair', [D.WBNB, token])]))[0], 'pair')
    const [token0, token1] = await snapshot.read([call(pool, PAIR_ABI, 'token0'), call(pool, PAIR_ABI, 'token1')])
    if (![token0, token1].some(asset => same(asset, token)) || same(token0, token1)) throw new Error('AGENT_POOL_TOKEN_MISMATCH')
    if (!state.isImport && ![token0, token1].some(asset => same(asset, D.WBNB))) throw new Error('V2_PAIR_MISMATCH')
    return dex === 2
      ? { sourceType: 0, sourceData: coder.encode(['(address router,address pair)'], [[D.V2_ROUTER, pool]]) }
      : { sourceType: 1, sourceData: coder.encode(['(address router,address quoter,address pool)'], [[D.V3_ROUTER, D.V3_QUOTER, pool]]) }
  }
  if (dex === 4) {
    const pair = state.metadata.pair
    let poolId = pair
    if (!ethers.isHexString(pair, 32)) {
      let key
      try { key = typeof pair === 'string' ? JSON.parse(pair) : pair } catch { throw new Error('IMPORT_V4_POOL_INVALID') }
      if (!key) throw new Error('IMPORT_V4_POOL_REQUIRED')
      poolId = ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key]))
    }
    const [key] = await snapshot.read([call(D.MANAGER, PCS_MANAGER_ABI, 'poolIdToPoolKey', [poolId])])
    if (!same(key.poolManager, D.MANAGER) || ![key.currency0, key.currency1].some(asset => same(asset, token))
        || !same(ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key])), poolId)) throw new Error('IMPORT_V4_POOL_MISMATCH')
    return { sourceType: 3, sourceData: coder.encode([`(address quoter,${POOL_KEY_TYPE} pool)`], [[D.QUOTER, key]]), hook: key.hooks }
  }
  throw new Error(`UNKNOWN_IMPORT_DEX: ${dex}`)
}

export async function agentQuote(snapshot, state, buy, amount) {
  const source = await agentSource(snapshot, state)
  const [expected] = await snapshot.read([call(D.AGENT_SWAP, AGENT_SWAP_ABI, buy ? 'quoteBuy' : 'quoteSell', [state.token, source.sourceType, source.sourceData, amount])])
  return { ...source, expected, wrapper: D.AGENT_SWAP }
}

export async function automaticIPShare(snapshot, from, ipshare = D.IPSHARE) {
  const [created, fee] = await snapshot.read([
    call(ipshare, IPSHARE_ABI, 'ipshareCreated', [from]), call(ipshare, IPSHARE_ABI, 'createFee')
  ])
  if (!created && fee !== 0n) throw new Error('IPSHARE_CREATION_FEE_REQUIRED: create your IPShare separately before trading; trade funds cannot pay this fee')
  return { subject: from, autoCreate: !created, createFee: fee }
}

export async function agentTrade(snapshot, input, state) {
  const from = address(input.from, 'from'), token = address(state.token ?? input.token, 'token')
  if (!['buy', 'sell'].includes(input.side)) throw new Error('INVALID_SIDE')
  if (state.pending) throw new Error('TOKEN_LISTING_PENDING: wait and rebuild')
  if (!state.listed) throw new Error('AGENT_WRAPPER_REQUIRES_EXTERNAL_MARKET')
  const buy = input.side === 'buy', amount = uint(input.amount, 'amount'), bps = slippage(input.slippageBps)
  const subject = input.sellsman ? address(input.sellsman, 'sellsman') : ethers.ZeroAddress
  const [registry, ipshare, router, paused, handle, platformBps, referralBps, nutboxBps, balance] = await snapshot.read([
    call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'HANDLE_REGISTRY'), call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'ipshare'),
    call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'nutboxRouter'), call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'paused'),
    call(D.HANDLE_REGISTRY, HANDLE_ABI, 'handleOf', [from]),
    call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'tagaiRatio'), call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'sellsmanRatio'),
    call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'tokenNutboxFeeBps', [token]),
    buy ? nativeBalance(from) : call(token, ERC20_BALANCE_ABI, 'balanceOf', [from])
  ])
  if (!same(registry, D.HANDLE_REGISTRY) || !same(router, D.NUTBOX_ROUTER) || !same(ipshare, D.IPSHARE)) throw new Error('AGENT_WRAPPER_DEPLOYMENT_MISMATCH')
  if (paused) throw new Error('AGENT_WRAPPER_PAUSED')
  if (!handle) throw new Error('BINANCE_HANDLE_REQUIRED')
  if (balance < amount) throw new Error('INSUFFICIENT_TRADE_BALANCE')
  const share = await automaticIPShare(snapshot, from, ipshare)
  const route = await agentQuote(snapshot, { ...state, token }, buy, amount)
  // Follow buys must preserve the original trader in compatible TagAI Hook calldata too.
  if (!state.isImport && route.hook && subject !== ethers.ZeroAddress) {
    const [reviewed] = await snapshot.read([call(D.AGENT_SWAP, AGENT_SWAP_ABI, 'referralHookCodeHash', [route.hook])])
    if (reviewed === ethers.ZeroHash || reviewed.toLowerCase() !== ethers.keccak256(await snapshot.provider.getCode(route.hook, snapshot.block.number)).toLowerCase())
      throw new Error('AGENT_REFERRAL_HOOK_NOT_ENABLED: protocol owner must authorize this Hook to preserve the selected referral')
  }
  const minimum = route.expected * BigInt(10000 - bps) / 10000n
  if (route.expected <= 0n || minimum <= 0n) throw new Error('ZERO_OUTPUT')
  const detail = { token, version: state.version, ipshareSubject: subject, automaticIPShare: share,
    sourceType: route.sourceType, sourceData: route.sourceData,
    quote: { amountIn: amount, expectedOut: route.expected, minimumOut: minimum, slippageBps: bps,
      type: 'wrapper-net-estimate', requiresWalletSimulation: true, transferTaxesIncluded: false },
    fees: { platformBps, referralBps, nutboxTokenBps: nutboxBps, dexAndHookFees: 'additional; reflected by route quote where supported' }, rebuildAfterConfirmation: false }
  if (!buy) {
    const [allowance] = await snapshot.read([call(token, TOKEN_ALLOWANCE_ABI, 'allowance', [from, D.AGENT_SWAP])])
    if (allowance < amount) return plan(snapshot, from, allowance > 0n ? 'reset-agent-wrapper-allowance' : 'approve-agent-wrapper', token, TOKEN_ALLOWANCE_ABI, 'approve',
      [D.AGENT_SWAP, allowance > 0n ? 0n : amount], 0n, { ...detail, rebuildAfterConfirmation: true })
  }
  return plan(snapshot, from, `v${state.version}-agent-${input.side}`, D.AGENT_SWAP, AGENT_SWAP_ABI, buy ? 'buyToken' : 'sellToken',
    [token, route.sourceType, route.sourceData, ...(buy ? [] : [amount]), minimum, from, snapshot.block.timestamp + 300, subject], buy ? amount : 0n, detail)
}
