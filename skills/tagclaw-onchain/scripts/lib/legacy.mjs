import { agentQuote, agentTrade } from './agent-swap.mjs'
import { ethers } from 'ethers'
import * as deployment from './deployment.mjs'
import { call } from './snapshot.mjs'
import { address, uint, slippage, same, coder, nativeBalance, plan, poolKey } from './prepare.mjs'
import { PUMP14_ABI, TOKEN14_ABI, PCS_MANAGER_ABI, POOL_KEY_TYPE } from './v14-abi.mjs'
import { ERC20_BALANCE_ABI, TOKEN_ALLOWANCE_ABI } from './erc20-abi.mjs'

export const LEGACY_ABI = [
  'function listed() view returns(bool)',
  'function bondingCurveSupply() view returns(uint256)',
  'function totalSupply() view returns(uint256)',
  'function getBuyFeeRatios() view returns(uint256,uint256)',
  'function getFeeRatio() view returns(uint256[2])',
  'function getBuyPriceAfterFee(uint256,uint256) view returns(uint256)',
  'function buyToken(uint256,address,uint16,address) payable',
  'function buyToken(uint256,address,uint16,bytes) payable',
  'function buyToken(uint256,address,uint16,bytes,uint256) payable',
  'function sellToken(uint256,uint256,address,uint16,bytes,uint256)'
]
export const V2_ABI = [
  'function getPair(address,address) view returns(address)',
  'function getAmountsOut(uint256,address[]) view returns(uint256[])',
  'function token0() view returns(address)',
  'function token1() view returns(address)'
]
export const WRAPPER_ABI = [
  'function buyToken(address,uint256,address[],address,uint256,address) payable',
  'function sellToken(uint256,uint256,address[],address,uint256,address,address)'
]
export const IMPORT_ABI = [
  'function quoteBuy(address,uint8,bytes,uint256) view returns(uint256)',
  'function quoteSell(address,uint8,bytes,uint256) view returns(uint256)',
  'function buyToken(address,uint8,bytes,uint256,address,uint256,address) payable returns(uint256)',
  'function sellToken(address,uint8,bytes,uint256,uint256,address,uint256,address) returns(uint256)'
]

export async function legacyState(snapshot, metadata) {
  const token = address(metadata.token, 'token'), version = Number(metadata.version)
  const imported = metadata.isImport === true || Number(metadata.isImport) === 1
  if (!imported && !deployment.LEGACY_PUMPS[version]) throw new Error(`UNKNOWN_TOKEN_VERSION: ${version}; refresh the skill, do not guess a route`)
  const [symbol, decimals, totalSupply] = await snapshot.read([
    call(token, ERC20_BALANCE_ABI, 'symbol'), call(token, ERC20_BALANCE_ABI, 'decimals'), call(token, LEGACY_ABI, 'totalSupply')
  ])
  if (imported) return { ...snapshot.metadata(), token, version, symbol, decimals: Number(decimals), totalSupply, isImport: true, market: 'external', listed: true, pending: false, metadata }
  const pump = deployment.LEGACY_PUMPS[version]
  const [registered, listed, supply] = await snapshot.read([
    { ...call(pump, PUMP14_ABI, 'createdTokens', [token]), optional: version === 1 },
    call(token, LEGACY_ABI, 'listed'), call(token, LEGACY_ABI, 'bondingCurveSupply')
  ])
  if (registered === false) throw new Error('LEGACY_TOKEN_PUMP_MISMATCH')
  if (registered === null) {
    const iface = new ethers.Interface(['event NewToken(string tick,address indexed token,address indexed creator)'])
    const logs = await snapshot.provider.getLogs({ address: pump, topics: [iface.getEvent('NewToken').topicHash, ethers.zeroPadValue(token, 32)], fromBlock: 0, toBlock: snapshot.block.number })
    if (!logs.some(log => iface.parseLog(log)?.args.tick === metadata.tick)) throw new Error('LEGACY_CREATION_PROOF_MISSING')
  }
  let poolId = null
  if (listed && [7, 8, 9, 11].includes(version)) {
    if (ethers.isHexString(metadata.pair, 32)) poolId = metadata.pair
    else {
      let key
      try { key = typeof metadata.pair === 'string' ? JSON.parse(metadata.pair) : metadata.pair } catch { throw new Error('V4_POOL_METADATA_INVALID') }
      if (!key) throw new Error('V4_POOL_METADATA_REQUIRED')
      poolId = ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key]))
    }
    await poolKey(snapshot, token, poolId)
  }
  return { ...snapshot.metadata(), token, version, symbol, decimals: Number(decimals), totalSupply, isImport: false, pump, supply, listed, pending: false, poolId, market: listed ? 'external' : 'internal', metadata }
}

async function curveQuote(snapshot, state, buy, amount) {
  if (!buy) {
    if (amount > state.supply) throw new Error('SELL_EXCEEDS_CURVE_SUPPLY')
    const [expected] = await snapshot.read([call(state.pump, PUMP14_ABI, 'getSellPriceAfterFee', [state.supply, amount])])
    return expected
  }
  const [dynamic] = await snapshot.read([{ ...call(state.token, LEGACY_ABI, 'getBuyFeeRatios'), optional: true }])
  const fees = dynamic ?? (await snapshot.read([call(state.pump, LEGACY_ABI, 'getFeeRatio')]))[0]
  if (fees[0] + fees[1] >= 10000n) throw new Error('INVALID_BUY_FEES')
  const net = amount - amount * fees[0] / 10000n - amount * fees[1] / 10000n
  const [expected] = await snapshot.read([call(state.pump, PUMP14_ABI, 'getBuyAmountByValue', [state.supply, net])])
  const remaining = ethers.parseEther('650000000') - state.supply
  return expected > remaining ? remaining : expected
}

export async function legacyTrade(snapshot, input, state) {
  const from = address(input.from, 'from'), amount = uint(input.amount, 'amount'), bps = slippage(input.slippageBps)
  if (!['buy', 'sell'].includes(input.side)) throw new Error('INVALID_SIDE')
  const buy = input.side === 'buy', sellsman = input.sellsman ? address(input.sellsman, 'sellsman') : ethers.ZeroAddress
  const [balance] = await snapshot.read([buy ? nativeBalance(from) : call(state.token, ERC20_BALANCE_ABI, 'balanceOf', [from])])
  if (balance < amount) throw new Error('INSUFFICIENT_TRADE_BALANCE')
  if (state.listed) return agentTrade(snapshot, { ...input, token: state.token }, state)
  const route = { expected: await curveQuote(snapshot, state, buy, amount) }
  const expected = route.expected, actualBps = Math.max(1, bps)
  const contractExpected = bps === 0 ? (expected * 10000n + 9998n) / 9999n : expected
  const minimum = state.listed ? expected * BigInt(10000 - bps) / 10000n : contractExpected * BigInt(10000 - actualBps) / 10000n
  if (expected <= 0n || minimum <= 0n) throw new Error('ZERO_OUTPUT')
  const details = { ipshareSubject:sellsman, version: state.version, token: state.token, quote: { expectedOut: expected, minimumOut: minimum, amountIn: amount, slippageBps: bps }, rebuildAfterConfirmation: false }
  if (!state.listed) {
    let abi = TOKEN14_ABI, method = buy ? 'buyToken' : 'sellToken'
    let args = buy ? [contractExpected, sellsman, actualBps] : [amount, contractExpected, sellsman, actualBps]
    if (buy && state.version === 1) { abi = LEGACY_ABI; method = 'buyToken(uint256,address,uint16,address)'; args.push(ethers.ZeroAddress) }
    if (buy && state.version === 5 || state.version === 8) {
      if (!ethers.isHexString(input.signature) || input.signature.length <= 2) throw new Error(`LEGACY_ELIGIBILITY_REQUIRED: v${state.version} requires a protocol trade signature; do not register an account or bypass the gate`)
      abi = LEGACY_ABI
      method = state.version === 5 ? 'buyToken(uint256,address,uint16,bytes)' : buy ? 'buyToken(uint256,address,uint16,bytes,uint256)' : 'sellToken(uint256,uint256,address,uint16,bytes,uint256)'
      args.push(input.signature)
      if (state.version === 8) {
        const deadline = uint(input.deadline, 'deadline')
        if (deadline <= BigInt(snapshot.block.timestamp)) throw new Error('LEGACY_SIGNATURE_EXPIRED')
        args.push(deadline)
      }
    }
    return plan(snapshot, from, `v${state.version}-curve-${input.side}`, state.token, abi, method, args, buy ? amount : 0n, details)
  }

}

export async function legacyPrice(snapshot, input, state) {
  if (state.poolId) {
    const [[sqrt]] = await snapshot.read([call(deployment.MANAGER, PCS_MANAGER_ABI, 'getSlot0', [state.poolId])])
    if (sqrt <= 0n) throw new Error('V4_ZERO_PRICE')
    return { ...snapshot.metadata(), token: state.token, version: state.version, priceInBnb: ethers.formatUnits((1n << 192n) * 10n ** 36n / (sqrt * sqrt), 36), quoteType: 'spot-not-execution' }
  }
  const amount = uint(input.referenceAmount ?? '1000000000000000', 'referenceAmount')
  const expected = state.listed ? (await agentQuote(snapshot, state, true, amount)).expected : await curveQuote(snapshot, state, true, amount)
  if (expected <= 0n) throw new Error('ZERO_OUTPUT')
  return { ...snapshot.metadata(), token: state.token, version: state.version, market: state.market, priceInBnb: ethers.formatUnits(amount * 10n ** BigInt(state.decimals) * 10n ** 18n / expected, 36), referenceAmount: amount, expectedOut: expected, quoteType: 'effective-buy-price-including-fees-not-spot' }
}
