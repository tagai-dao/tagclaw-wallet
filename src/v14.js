import { ethers } from 'ethers'
import { evm, assertBsc, confirmed } from './evm.js'
import { PUMP14_ABI, TOKEN14_ABI, CREATE_V14, CREATE_V14_WITH_POOLS } from './abi/v14.js'
import { PUMP_CONTRACTS, V14_TOKEN_IMPLEMENTATION, V14_TRADE_CURATION_FACTORY, DEFAULT_BNB_RPC, MIN_CREATE_BNB_REMAINING, ZERO_ADDRESS } from './constants.js'
import { getV4NativePrice, tradeNativeV4 } from './pcsV4.js'
import { ERC20_BALANCE_ABI } from './abi/index.js'

const CAP = ethers.parseEther('650000000')
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
const feesAbi = [
  'function ipshareCreated(address) view returns(bool)', 'function createFee() view returns(uint256)',
  'function getCreateCommunityFee() view returns(uint256)', 'function getCommunitySettingsFee() view returns(uint256)',
  'function verifyContract(address) view returns(bool)'
]

export async function readV14State(token, provider) {
  await assertBsc(provider)
  const blockTag = await provider.getBlockNumber()
  const at = { blockTag }
  const pump = evm.contract(PUMP_CONTRACTS[14], PUMP14_ABI, provider)
  if (!await pump.createdTokens(token, at)) throw new Error('V14_TOKEN_MISMATCH: token is not registered in Pump14')
  const contract = evm.contract(token, TOKEN14_ABI, provider)
  const [listed, pending, supply, fees, poolId] = await Promise.all([
    contract.listed(at), contract.listingPending(at), contract.bondingCurveSupply(at),
    contract.getBuyFeeRatios(at), contract.v4PoolId(at)
  ])
  return { listed, pending, supply, fees, poolId, blockTag }
}

export async function quoteV14Curve(token, provider, state, isBuy, amount) {
  if (state.pending) throw new Error('V14_LISTING_PENDING: wait for listing finalization')
  if (state.listed) throw new Error('V14_ALREADY_LISTED: use PCS V4')
  if (amount <= 0n || state.supply < 0n || state.supply > CAP) throw new Error('V14_INVALID_AMOUNT')
  const pump = evm.contract(PUMP_CONTRACTS[14], PUMP14_ABI, provider)
  const at = { blockTag: state.blockTag }
  let expected
  if (isBuy) {
    const [platform, referral] = state.fees
    if (platform < 0n || referral < 0n || platform + referral >= 10000n) throw new Error('V14_INVALID_FEES')
    // Each fee is rounded separately by the contract, including the early-buy fee.
    const net = amount - amount * platform / 10000n - amount * referral / 10000n
    expected = await pump.getBuyAmountByValue(state.supply, net, at)
    if (expected > CAP - state.supply) expected = CAP - state.supply
  } else {
    if (amount > state.supply) throw new Error('V14_INVALID_AMOUNT: sell exceeds curve supply')
    expected = await pump.getSellPriceAfterFee(state.supply, amount, at)
  }
  if (expected <= 0n) throw new Error('V14_QUOTE_FAILED: output is zero')
  return expected
}

export async function getV14Price(token, provider) {
  const state = await readV14State(token, provider)
  if (state.pending) throw new Error('V14_LISTING_PENDING: wait for listing finalization')
  let price
  if (state.listed) price = await getV4NativePrice(token, state.poolId, provider, state.blockTag)
  else {
    const pump = evm.contract(PUMP_CONTRACTS[14], PUMP14_ABI, provider)
    price = Number(await pump.getPrice(state.supply, 10n ** 18n, { blockTag: state.blockTag })) / 1e18
  }
  if (!Number.isFinite(price) || price <= 0) throw new Error('V14_PRICE_UNAVAILABLE')
  return { price, listed: state.listed, poolId: state.listed ? state.poolId : null }
}

export async function tradeV14({ token, signer, isBuy, amount, sellsman, slippage, quoteOnly = false }) {
  if (!Number.isInteger(slippage) || slippage < 0 || slippage > 5000) throw new Error('V14_INVALID_SLIPPAGE: use 0–5000 bps')
  const state = await readV14State(token, signer.provider)
  if (state.pending) throw new Error('V14_LISTING_PENDING: wait for listing finalization')
  if (!quoteOnly) {
    const owner = await signer.getAddress()
    const balance = isBuy ? await signer.provider.getBalance(owner)
      : await evm.contract(token, ERC20_BALANCE_ABI, signer.provider).balanceOf(owner)
    if (balance < amount) throw new Error(isBuy ? 'INSUFFICIENT_NATIVE_BALANCE' : 'INSUFFICIENT_TOKEN_BALANCE')
  }
  if (state.listed) return tradeNativeV4({ token, poolId: state.poolId, signer, isBuy, amount, sellsman, slippage, quoteOnly })
  const expected = await quoteV14Curve(token, signer.provider, state, isBuy, amount)
  // A zero bps argument disables Token13's check; use 1 bps with an adjusted expectation.
  const bps = Math.max(1, slippage)
  const contractExpected = slippage === 0 ? (expected * 10000n + 9998n) / 9999n : expected
  const result = {
    route: `unlisted-token14-${isBuy ? 'buy' : 'sell'}`, version: 14,
    amountIn: String(amount), [isBuy ? 'expectedAmount' : 'expectedReceive']: String(expected),
    amountOutMin: String(contractExpected * BigInt(10000 - bps) / 10000n),
    slippageBps: bps, blockNumber: state.blockTag
  }
  if (BigInt(result.amountOutMin) <= 0n) throw new Error('V14_QUOTE_FAILED: minimum output rounds to zero')
  if (quoteOnly) return { ...result, quoteOnly: true }
  const contract = evm.contract(token, TOKEN14_ABI, signer)
  const method = isBuy ? contract.buyToken : contract.sellToken
  const args = isBuy ? [contractExpected, sellsman, bps, { value: amount }] : [amount, contractExpected, sellsman, bps]
  await method.staticCall(...args)
  const receipt = await confirmed(await method(...args))
  return { ...result, hash: receipt.hash }
}

export function validateIndexConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('V14_INDEX_CONFIG_REQUIRED: provide --index-config <JSON file>')
  const { name, symbol, constituentAssets: assets, targetWeights: weights, basketFeeBps, creatorShareBps, retainCommunityOwnership } = config
  if (typeof name !== 'string' || !name.trim() || Buffer.byteLength(name) > 64 || typeof symbol !== 'string' || !symbol.trim() || Buffer.byteLength(symbol) > 16) {
    throw new Error('V14_INVALID_INDEX_CONFIG: name must be 1–64 bytes, symbol 1–16 bytes')
  }
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > 4 || assets.some(a => !ethers.isAddress(a) || same(a, ZERO_ADDRESS)) || new Set(assets.map(a => a.toLowerCase())).size !== assets.length) {
    throw new Error('V14_INVALID_INDEX_CONFIG: choose 1–4 distinct nonzero constituent addresses')
  }
  if (!Array.isArray(weights) || weights.length !== assets.length || weights.some(w => !Number.isInteger(w) || w <= 0) || weights.reduce((a, b) => a + b, 0) !== 10000) {
    throw new Error('V14_INVALID_INDEX_CONFIG: positive constituent weights must total 10000 bps')
  }
  if (!Number.isInteger(basketFeeBps) || basketFeeBps < 100 || basketFeeBps > 300 || !Number.isInteger(creatorShareBps) || creatorShareBps < 0 || creatorShareBps > 3000 || typeof retainCommunityOwnership !== 'boolean') {
    throw new Error('V14_INVALID_INDEX_CONFIG: basket fee 100–300 bps, creator share 0–3000 bps, and explicit boolean retainCommunityOwnership required')
  }
  return { name, symbol, constituentAssets: assets, targetWeights: weights, basketFeeBps, creatorShareBps, retainCommunityOwnership }
}

export function predictV14Address(creator, salt) {
  const codeHash = ethers.keccak256(`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${V14_TOKEN_IMPLEMENTATION.slice(2)}5af43d82803e903d91602b57fd5bf3`)
  const cloneSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], [creator, salt]))
  return ethers.getCreate2Address(PUMP_CONTRACTS[14], cloneSalt, codeHash)
}

async function resolveSalt(creator, explicitSalt, pump, provider) {
  if (explicitSalt && !ethers.isHexString(explicitSalt, 32)) throw new Error('INVALID_SALT: expected bytes32')
  let index = BigInt(ethers.hexlify(ethers.randomBytes(16)))
  for (let attempt = 0; attempt < (explicitSalt ? 1 : 500000); attempt++) {
    const salt = explicitSalt || ethers.toBeHex(index++, 32)
    const token = predictV14Address(creator, salt)
    if (token.toLowerCase().endsWith('3333')) {
      if (!await pump.createdTokens(token) && await provider.getCode(token) === '0x') return { salt, token }
    }
    if (attempt % 1000 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('V14_INVALID_SALT: no unused token address ending in 3333; supply another salt or retry search')
}

export async function createCommunityV14(params) {
  const { privateKey, tick, rpcUrl = DEFAULT_BNB_RPC, quoteOnly = false } = params
  // Match the v14 metadata registration constraints before spending creation fees.
  if (typeof tick !== 'string' || !/^(?!\d+$)[A-Za-z0-9\u4e00-\u9fa5_]{1,16}$/.test(tick) || ['tiptag', 'tagai', 'tagaidao', 'deploy'].includes(tick.toLowerCase())) {
    throw new Error('V14_INVALID_TICK: use 1–16 letters, Chinese characters, digits or underscores; numeric-only and reserved ticks are unavailable')
  }
  const indexConfig = validateIndexConfig(params.indexConfig)
  const initialBuy = BigInt(params.initialBuy || 0)
  const tradeRewardRatio = Number(params.tradeRewardRatio ?? 0)
  if (initialBuy < 0n) throw new Error('initialBuy must be nonnegative wei')
  if (!Number.isInteger(tradeRewardRatio) || tradeRewardRatio < 0 || tradeRewardRatio > 8000) throw new Error('tradeRewardRatio must be 0–8000 bps')
  const signer = await evm.signer(privateKey, rpcUrl)
  const provider = signer.provider
  await assertBsc(provider)
  const creator = await signer.getAddress()
  const pump = evm.contract(PUMP_CONTRACTS[14], PUMP14_ABI, signer)
  const [version, implementation, used, createFee, ipshare, committee] = await Promise.all([
    pump.VERSION(), pump.tokenImplementation(), pump.createdTicks(tick), pump.createFee(), pump.getIPShare(), pump.nutboxCommittee()
  ])
  if (version !== 14n || !same(implementation, V14_TOKEN_IMPLEMENTATION)) throw new Error('V14_DEPLOYMENT_MISMATCH')
  if (used) throw new Error('V14_TICK_EXISTS: do not create this tick again')
  const approved = await Promise.all(indexConfig.constituentAssets.map(asset => pump.approvedConstituent(asset)))
  if (approved.some(value => !value)) throw new Error('V14_CONSTITUENT_NOT_APPROVED')
  const ip = evm.contract(ipshare, feesAbi, provider)
  const comm = evm.contract(committee, feesAbi, provider)
  const [hasShare, ipFee, communityFee, settingsFee, balance] = await Promise.all([
    ip.ipshareCreated(creator), ip.createFee(), comm.getCreateCommunityFee(), comm.getCommunitySettingsFee(), provider.getBalance(creator)
  ])
  const optionalPools = []
  if (tradeRewardRatio) {
    const [, maximum, enabled] = await pump.optionalPoolFactories(V14_TRADE_CURATION_FACTORY)
    if (!enabled || BigInt(tradeRewardRatio) > maximum || !await comm.verifyContract(V14_TRADE_CURATION_FACTORY)) throw new Error('V14_TRADE_POOL_UNAVAILABLE')
    optionalPools.push({ factory: V14_TRADE_CURATION_FACTORY, rewardRatio: tradeRewardRatio, meta: '0x' })
  }
  const ipshareFee = hasShare ? 0n : ipFee
  const settingsCount = indexConfig.constituentAssets.length + optionalPools.length
  const totalFee = createFee + ipshareFee + communityFee + settingsFee * BigInt(settingsCount)
  const value = totalFee + initialBuy
  const { salt, token } = await resolveSalt(creator, params.salt, pump, provider)
  const method = pump[optionalPools.length ? CREATE_V14_WITH_POOLS : CREATE_V14]
  const args = [tick, salt, indexConfig, ...(optionalPools.length ? [optionalPools] : []), { value }]
  let gasReserve = null
  let simulationError = null
  try {
    const [gas, feeData] = await Promise.all([method.estimateGas(...args), provider.getFeeData()])
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice
    if (!gasPrice) throw new Error('Gas price unavailable')
    gasReserve = gas * 120n / 100n * gasPrice
  } catch (error) {
    if (!quoteOnly) throw error
    simulationError = error.shortMessage || error.message
  }
  const minimumBalance = gasReserve === null ? null : value + gasReserve + MIN_CREATE_BNB_REMAINING
  const result = {
    route: quoteOnly ? 'v14-create-community-quote' : 'v14-create-community', version: 14,
    tick, creator, pump: PUMP_CONTRACTS[14], ipshare, committee, salt, predictedToken: token,
    indexConfig, optionalPools, createFee: String(createFee), ipshareCreateFee: String(ipshareFee),
    nutboxCreateCommunityFee: String(communityFee), nutboxSettingsFee: String(settingsFee), settingsCount,
    totalRequiredFee: String(totalFee), initialBuy: String(initialBuy), transactionValue: String(value),
    estimatedGasReserve: gasReserve === null ? null : String(gasReserve),
    minimumRequiredBalance: minimumBalance === null ? null : String(minimumBalance), balance: String(balance),
    minimumRemainingBalance: String(MIN_CREATE_BNB_REMAINING),
    canCreate: minimumBalance !== null && balance >= minimumBalance,
    ...(simulationError ? { simulationError } : {})
  }
  if (quoteOnly) return result
  if (!result.canCreate) throw new Error(`INSUFFICIENT_CREATE_BALANCE: required=${minimumBalance}, available=${balance}`)
  await method.staticCall(...args)
  const receipt = await confirmed(await method(...args))
  const iface = new ethers.Interface(PUMP14_ABI)
  const events = receipt.logs.filter(log => same(log.address, PUMP_CONTRACTS[14])).flatMap(log => {
    try { const parsed = iface.parseLog(log); return parsed ? [parsed] : [] } catch { return [] }
  })
  const created = events.find(event => event.name === 'NewToken' && event.args.tick === tick && same(event.args.creator, creator) && same(event.args.token, token))
  if (!created) throw new Error(`V14_RECEIPT_MISMATCH: transaction ${receipt.hash} confirmed; reconcile it before retrying`)
  const relevant = events.filter(event => same(event.args.token, token))
  return {
    ...result, hash: receipt.hash, createHash: receipt.hash, token,
    nutboxCommunity: relevant.find(event => event.name === 'NutboxLinked')?.args.community || null,
    stakingPools: relevant.filter(event => event.name === 'NutboxStakingPoolLinked').map(event => ({ pool: event.args.pool, lpToken: event.args.lpToken, rewardRatio: Number(event.args.rewardRatio) })),
    optionalPoolAddresses: relevant.filter(event => event.name === 'NutboxOptionalPoolLinked').map(event => ({ pool: event.args.pool, factory: event.args.factory, rewardRatio: Number(event.args.rewardRatio) }))
  }
}
