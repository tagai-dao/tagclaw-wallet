import { ethers } from 'ethers'
import * as D from './deployment.mjs'
import { call, MULTICALL_ABI } from './snapshot.mjs'
import { PUMP14_ABI, TOKEN14_ABI, PCS_MANAGER_ABI, PCS_QUOTER_ABI, PCS_ROUTER_ABI, PERMIT2_ABI, POOL_KEY_TYPE } from './v14-abi.mjs'
import { IPSHARE_ABI } from './ipshare-abi.mjs'
import { ERC20_BALANCE_ABI, TOKEN_ALLOWANCE_ABI } from './erc20-abi.mjs'
import { NUTBOX_POOL_ABI, NUTBOX_COMMUNITY_ABI, NUTBOX_COMMITTEE_ABI, ERC20_STAKING_POOL_ABI, ERC20_LOCKING_POOL_ABI, ERC1155_STAKING_POOL_ABI, ERC1155_APPROVAL_ABI, SOCIAL_CURATION_POOL_ABI } from './nutbox-abi.mjs'

export const coder = ethers.AbiCoder.defaultAbiCoder()
const CAP = ethers.parseEther('650000000')
const U128 = (1n << 128n) - 1n
export const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
export function address(value, name = 'address') {
  if (!ethers.isAddress(value) || same(value, ethers.ZeroAddress)) throw new Error(`INVALID_${name.toUpperCase()}`)
  return ethers.getAddress(value)
}
export function uint(value, name, allowZero = false) {
  if ((typeof value !== 'string' || !/^\d+$/.test(value)) && !(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) throw new Error(`INVALID_${name.toUpperCase()}: use an unsigned integer string`)
  const n = BigInt(value)
  if ((!allowZero && n === 0n) || n > ethers.MaxUint256) throw new Error(`INVALID_${name.toUpperCase()}`)
  return n
}
export function slippage(value = 200) {
  if (!Number.isInteger(value) || value < 0 || value > 5000) throw new Error('INVALID_SLIPPAGE: integer 0–5000 bps required')
  return value
}
export function plan(snapshot, from, action, to, abi, method, args, value = 0n, details = {}) {
  const data = new ethers.Interface(abi).encodeFunctionData(method, args)
  return {
    ...snapshot.metadata(), kind: 'unsigned-transaction-plan', action, expiresAt: snapshot.block.timestamp + 300,
    ...details,
    transactions: [{ chainId: D.CHAIN_ID, from, to: ethers.getAddress(to), value: String(value), data, inputData: data, method }]
  }
}
export const nativeBalance = from => call(D.MULTICALL3, MULTICALL_ABI, 'getEthBalance', [from])
function requireBalance(balance, amount, name) { if (balance < amount) throw new Error(`INSUFFICIENT_${name}_BALANCE`) }

export async function tokenState(snapshot, token) {
  const [registered, version, implementation, listed, pending, supply, fees, poolId] = await snapshot.read([
    call(D.PUMP, PUMP14_ABI, 'createdTokens', [token]), call(D.PUMP, PUMP14_ABI, 'VERSION'),
    call(D.PUMP, PUMP14_ABI, 'tokenImplementation'), call(token, TOKEN14_ABI, 'listed'),
    call(token, TOKEN14_ABI, 'listingPending'), call(token, TOKEN14_ABI, 'bondingCurveSupply'),
    call(token, TOKEN14_ABI, 'getBuyFeeRatios'), call(token, TOKEN14_ABI, 'v4PoolId')
  ])
  if (!registered || version !== 14n || !same(implementation, D.IMPLEMENTATION)) throw new Error('UNSUPPORTED_TOKEN_DEPLOYMENT: require a native Pump14 token')
  if (pending) throw new Error('V14_LISTING_PENDING: wait and rebuild')
  if (supply < 0n || supply > CAP) throw new Error('INVALID_CURVE_SUPPLY')
  return { listed, supply, fees, poolId }
}

async function poolKey(snapshot, token, poolId) {
  if (!ethers.isHexString(poolId, 32) || poolId === ethers.ZeroHash) throw new Error('V4_POOL_UNAVAILABLE')
  const [key] = await snapshot.read([call(D.MANAGER, PCS_MANAGER_ABI, 'poolIdToPoolKey', [poolId])])
  if (!same(key.currency0, ethers.ZeroAddress) || !same(key.currency1, token) || !same(key.poolManager, D.MANAGER) || !same(ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key])), poolId)) throw new Error('V4_INVALID_NATIVE_POOL')
  return key
}

export async function price(snapshot, input) {
  const token = address(input.token, 'token')
  const state = await tokenState(snapshot, token)
  let priceInBnb
  if (state.listed) {
    await poolKey(snapshot, token, state.poolId)
    const [[sqrt]] = await snapshot.read([call(D.MANAGER, PCS_MANAGER_ABI, 'getSlot0', [state.poolId])])
    if (sqrt <= 0n) throw new Error('V4_ZERO_PRICE')
    priceInBnb = ethers.formatUnits((1n << 192n) * 10n ** 36n / (sqrt * sqrt), 36)
  } else {
    const [value] = await snapshot.read([call(D.PUMP, PUMP14_ABI, 'getPrice', [state.supply, 10n ** 18n])])
    priceInBnb = ethers.formatEther(value)
  }
  return { ...snapshot.metadata(), token, listed: state.listed, poolId: state.listed ? state.poolId : null, priceInBnb, quoteType: 'spot-not-execution' }
}

export async function trade(snapshot, input) {
  const from = address(input.from, 'from'), token = address(input.token, 'token')
  if (!['buy', 'sell'].includes(input.side)) throw new Error('INVALID_SIDE')
  const isBuy = input.side === 'buy', amount = uint(input.amount, 'amount'), bps = slippage(input.slippageBps)
  const sellsman = input.sellsman ? address(input.sellsman, 'sellsman') : ethers.ZeroAddress
  const state = await tokenState(snapshot, token)
  const [balance] = await snapshot.read([isBuy ? nativeBalance(from) : call(token, ERC20_BALANCE_ABI, 'balanceOf', [from])])
  requireBalance(balance, amount, isBuy ? 'BNB' : 'TOKEN')
  if (!state.listed) {
    let expected
    if (isBuy) {
      const [a, b] = state.fees
      if (a < 0n || b < 0n || a + b >= 10000n) throw new Error('INVALID_BUY_FEES')
      const net = amount - amount * a / 10000n - amount * b / 10000n
      ;[expected] = await snapshot.read([call(D.PUMP, PUMP14_ABI, 'getBuyAmountByValue', [state.supply, net])])
      if (expected > CAP - state.supply) expected = CAP - state.supply
    } else {
      if (amount > state.supply) throw new Error('SELL_EXCEEDS_CURVE_SUPPLY')
      ;[expected] = await snapshot.read([call(D.PUMP, PUMP14_ABI, 'getSellPriceAfterFee', [state.supply, amount])])
    }
    const actualBps = Math.max(1, bps)
    const contractExpected = bps === 0 ? (expected * 10000n + 9998n) / 9999n : expected
    const minimum = contractExpected * BigInt(10000 - actualBps) / 10000n
    if (expected <= 0n || minimum <= 0n) throw new Error('ZERO_OUTPUT')
    return plan(snapshot, from, `v14-curve-${input.side}`, token, TOKEN14_ABI, isBuy ? 'buyToken' : 'sellToken',
      isBuy ? [contractExpected, sellsman, actualBps] : [amount, contractExpected, sellsman, actualBps], isBuy ? amount : 0n,
      { quote: { amountIn: String(amount), expectedOut: String(expected), minimumOut: String(minimum), slippageBps: bps }, rebuildAfterConfirmation: false })
  }
  if (amount > U128) throw new Error('V4_AMOUNT_OVERFLOW')
  const key = await poolKey(snapshot, token, state.poolId)
  const hook = sellsman === ethers.ZeroAddress ? '0x' : coder.encode(['address'], [sellsman])
  const [[expected]] = await snapshot.read([call(D.QUOTER, PCS_QUOTER_ABI, 'quoteExactInputSingle', [[key, isBuy, amount, hook]])])
  const minimum = expected * BigInt(10000 - bps) / 10000n
  if (expected <= 0n || minimum <= 0n || minimum > U128) throw new Error('V4_INVALID_OUTPUT')
  const quote = { amountIn: String(amount), expectedOut: String(expected), minimumOut: String(minimum), slippageBps: bps }
  if (!isBuy) {
    const [allowance, permission] = await snapshot.read([
      call(token, TOKEN_ALLOWANCE_ABI, 'allowance', [from, D.PERMIT2]),
      call(D.PERMIT2, PERMIT2_ABI, 'allowance', [from, token, D.ROUTER])
    ])
    const detail = { quote, rebuildAfterConfirmation: true, next: 'Wait for status=1 receipt, then rerun prepare-trade with the same request to get a fresh quote and next transaction.' }
    if (allowance < amount) return plan(snapshot, from, allowance > 0n ? 'reset-permit2-allowance' : 'approve-permit2', token, TOKEN_ALLOWANCE_ABI, 'approve', [D.PERMIT2, allowance > 0n ? 0n : amount], 0n, detail)
    if (permission[0] < amount || permission[1] <= BigInt(snapshot.block.timestamp + 300)) return plan(snapshot, from, 'approve-router-in-permit2', D.PERMIT2, PERMIT2_ABI, 'approve', [token, D.ROUTER, amount, snapshot.block.timestamp + 3600], 0n, detail)
  }
  const swap = coder.encode([`(${POOL_KEY_TYPE},bool,uint128,uint128,bytes)`], [[key, isBuy, amount, minimum, hook]])
  const payload = coder.encode(['bytes', 'bytes[]'], ['0x060c0f', [swap,
    coder.encode(['address', 'uint128'], [isBuy ? key.currency0 : key.currency1, amount]),
    coder.encode(['address', 'uint128'], [isBuy ? key.currency1 : key.currency0, minimum])]])
  return plan(snapshot, from, `v14-v4-${input.side}`, D.ROUTER, PCS_ROUTER_ABI, 'execute', ['0x10', [payload], snapshot.block.timestamp + 300], isBuy ? amount : 0n,
    { poolId: state.poolId, quote, rebuildAfterConfirmation: false })
}

export async function ipshare(snapshot, input, prepare = false) {
  const from = address(input.from, 'from'), subject = address(input.subject || from, 'subject')
  const [created, supply, balance, pending, stake, fee, bnb] = await snapshot.read([
    call(D.IPSHARE, IPSHARE_ABI, 'ipshareCreated', [subject]), call(D.IPSHARE, IPSHARE_ABI, 'ipshareSupply', [subject]),
    call(D.IPSHARE, IPSHARE_ABI, 'ipshareBalance', [subject, from]), call(D.IPSHARE, IPSHARE_ABI, 'getPendingProfits', [subject, from]),
    call(D.IPSHARE, IPSHARE_ABI, 'getStakerInfo', [subject, from]), call(D.IPSHARE, IPSHARE_ABI, 'createFee'), nativeBalance(from)
  ])
  const info = { subject, created, supply, balance, pendingRewards: pending, staked: stake.amount, redeemAmount: stake.redeemAmount, unlockTime: stake.unlockTime, createFee: fee }
  if (!prepare) return { ...snapshot.metadata(), ...info }
  let method, args, value = 0n, quote
  switch (input.action) {
    case 'create':
      if (created) throw new Error('IPSHARE_ALREADY_CREATED')
      method = 'createShare'; args = [subject]; value = fee; break
    case 'buy': {
      if (!created) throw new Error('IPSHARE_NOT_CREATED')
      value = uint(input.value, 'value')
      // The sender-dependent payable buy simulation is left to the wallet preview.
      const minimum = uint(input.minimumOut, 'minimumOut')
      method = 'buyShares'; args = [subject, from, minimum]; quote = { minimumOut: String(minimum), quoteType: 'user-supplied-minimum-wallet-preview-required' }; break
    }
    case 'sell': {
      const amount = uint(input.amount, 'amount'); requireBalance(balance, amount, 'IPSHARE')
      const [expected] = await snapshot.read([call(D.IPSHARE, IPSHARE_ABI, 'getSellPriceAfterFee', [subject, amount])])
      const minimum = expected * BigInt(10000 - slippage(input.slippageBps)) / 10000n
      if (minimum <= 0n) throw new Error('ZERO_OUTPUT')
      method = 'sellShares'; args = [subject, amount, minimum]; quote = { expectedOut: String(expected), minimumOut: String(minimum) }; break
    }
    case 'stake': case 'unstake': {
      const amount = uint(input.amount, 'amount'); requireBalance(input.action === 'stake' ? balance : stake.amount, amount, 'IPSHARE')
      method = input.action; args = [subject, amount]; break
    }
    case 'redeem':
      if (stake.redeemAmount <= 0n || stake.unlockTime > BigInt(snapshot.block.timestamp)) throw new Error('IPSHARE_NOT_REDEEMABLE')
      method = 'redeem'; args = [subject]; break
    case 'claim':
      if (pending <= 0n) throw new Error('NO_REWARDS')
      method = 'claim'; args = [subject]; break
    default: throw new Error('INVALID_IPSHARE_ACTION')
  }
  requireBalance(bnb, value, 'BNB')
  return plan(snapshot, from, `ipshare-${input.action}`, D.IPSHARE, IPSHARE_ABI, method, args, value, { ...info, ...(quote ? { quote } : {}), rebuildAfterConfirmation: false })
}

async function getPool(snapshot, input) {
  const from = address(input.from, 'from'), pool = address(input.pool, 'pool')
  const [community, factory, staked] = await snapshot.read([
    call(pool, NUTBOX_POOL_ABI, 'getCommunity'), call(pool, NUTBOX_POOL_ABI, 'getFactory'), call(pool, NUTBOX_POOL_ABI, 'getUserStakedAmount', [from])
  ])
  const kind = Object.keys(D.FACTORIES).find(kind => same(D.FACTORIES[kind], factory))
  if (!kind) throw new Error('UNSUPPORTED_POOL_FACTORY: do not infer ABI from a pool name')
  const [committee, active, owner] = await snapshot.read([
    call(community, NUTBOX_COMMUNITY_ABI, 'committee'), call(community, NUTBOX_COMMUNITY_ABI, 'poolActived', [pool]), call(community, NUTBOX_COMMUNITY_ABI, 'owner')
  ])
  const [verified, operationFee, pending] = await snapshot.read([
    call(committee, NUTBOX_COMMITTEE_ABI, 'verifyContract', [factory]), call(committee, NUTBOX_COMMITTEE_ABI, 'getPoolOperationFee'),
    call(community, NUTBOX_COMMUNITY_ABI, 'getPoolPendingRewards', [pool, from])
  ])
  if (!verified) throw new Error('UNVERIFIED_POOL_FACTORY')
  return { from, pool, community, factory, kind, staked, committee, active, owner, operationFee, pendingRewards: pending }
}

export async function nutbox(snapshot, input, prepare = false) {
  const info = await getPool(snapshot, input)
  if (!prepare) return { ...snapshot.metadata(), ...info }
  const { from, pool, kind, community, staked, operationFee: fee } = info
  if (!info.active) throw new Error('INACTIVE_POOL: historical exit behavior requires separate verification')
  const [bnb] = await snapshot.read([nativeBalance(from)])
  const base = { ...info, rebuildAfterConfirmation: false }
  if (input.action === 'claim') {
    if (kind === 'social_curation') throw new Error('SOCIAL_POOL_REQUIRES_SIGNED_CLAIM')
    if (info.pendingRewards <= 0n) throw new Error('NO_REWARDS')
    requireBalance(bnb, fee, 'BNB')
    return plan(snapshot, from, 'nutbox-claim', community, NUTBOX_COMMUNITY_ABI, 'withdrawPoolsRewards', [[pool]], fee, base)
  }
  if (kind === 'social_curation') {
    requireBalance(bnb, fee, 'BNB')
    if (input.action === 'harvest') return plan(snapshot, from, 'social-harvest', pool, SOCIAL_CURATION_POOL_ABI, 'harvestRewards', [], fee, base)
    if (input.action === 'signed-claim') {
      const deadline = uint(input.deadline, 'deadline')
      if (deadline <= BigInt(snapshot.block.timestamp) || !ethers.isHexString(input.signature) || input.signature.length <= 2) throw new Error('INVALID_CLAIM_PAYLOAD')
      return plan(snapshot, from, 'social-signed-claim', pool, SOCIAL_CURATION_POOL_ABI, 'claim', [uint(input.orderId, 'orderId', true), uint(input.amount, 'amount'), deadline, input.signature], fee, base)
    }
    throw new Error('SOCIAL_POOL_HAS_NO_DEPOSIT_WITHDRAW')
  }
  const abi = kind === 'erc20_locking' ? ERC20_LOCKING_POOL_ABI : kind === 'erc1155_staking' ? ERC1155_STAKING_POOL_ABI : ERC20_STAKING_POOL_ABI
  if (input.action === 'redeem') {
    if (kind !== 'erc20_locking') throw new Error('NOT_LOCKING_POOL')
    const [claimable] = await snapshot.read([call(pool, abi, 'claimableAmount', [from])])
    if (claimable <= 0n) throw new Error('NOT_REDEEMABLE')
    return plan(snapshot, from, 'nutbox-redeem', pool, abi, 'redeem', [], 0n, base)
  }
  if (!['deposit', 'withdraw'].includes(input.action)) throw new Error('INVALID_POOL_ACTION')
  const amount = uint(input.amount, 'amount')
  requireBalance(bnb, fee, 'BNB')
  if (input.action === 'withdraw') requireBalance(staked, amount, 'STAKED')
  else {
    const [stakeToken] = await snapshot.read([call(pool, abi, 'stakeToken')])
    if (kind === 'erc1155_staking') {
      const [id, approved] = await snapshot.read([call(pool, abi, 'tokenId'), call(stakeToken, ERC1155_APPROVAL_ABI, 'isApprovedForAll', [from, pool])])
      const [balance] = await snapshot.read([call(stakeToken, ['function balanceOf(address,uint256) view returns(uint256)'], 'balanceOf', [from, id])])
      requireBalance(balance, amount, 'ERC1155')
      if (!approved) return plan(snapshot, from, 'approve-erc1155-pool', stakeToken, ERC1155_APPROVAL_ABI, 'setApprovalForAll', [pool, true], 0n,
        { ...base, rebuildAfterConfirmation: true, authorityChange: 'ERC1155 approval covers ALL token IDs for this collection; requires explicit review.' })
    } else {
      const [balance, allowance] = await snapshot.read([call(stakeToken, ERC20_BALANCE_ABI, 'balanceOf', [from]), call(stakeToken, TOKEN_ALLOWANCE_ABI, 'allowance', [from, pool])])
      requireBalance(balance, amount, 'STAKE_TOKEN')
      if (allowance < amount) return plan(snapshot, from, allowance > 0n ? 'reset-pool-allowance' : 'approve-pool', stakeToken, TOKEN_ALLOWANCE_ABI, 'approve', [pool, allowance > 0n ? 0n : amount], 0n, { ...base, rebuildAfterConfirmation: true })
    }
  }
  return plan(snapshot, from, `nutbox-${input.action}`, pool, abi, input.action, [amount], fee, { ...base, ...(kind === 'erc20_locking' && input.action === 'withdraw' ? { note: 'Withdrawal starts a lock queue; redeem separately when claimable.' } : {}) })
}
