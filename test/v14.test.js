import test from 'node:test'
import assert from 'node:assert/strict'
import { ethers } from 'ethers'
import { evm, confirmed } from '../src/evm.js'
import { buyToken, sellToken, getTokenPrice, createCommunity } from '../src/index.js'
import { tradeV14, validateIndexConfig, predictV14Address } from '../src/v14.js'
import { buildV4Swap, readNativePool } from '../src/pcsV4.js'
import { PUMP14_ABI, CREATE_V14, CREATE_V14_WITH_POOLS, POOL_KEY_TYPE } from '../src/abi/v14.js'
import { PUMP_CONTRACTS, PCS_CL_POOL_MANAGER, PCS_CL_QUOTER, PCS_UNIVERSAL_ROUTER, PCS_PERMIT2, V14_TOKEN_IMPLEMENTATION, V14_TRADE_CURATION_FACTORY, MIN_CREATE_BNB_REMAINING } from '../src/constants.js'

const original = { ...evm }
const originalFetch = global.fetch
const addr = digit => `0x${digit.repeat(40)}`
const owner = addr('1'), token = addr('2'), ip = addr('3'), committee = addr('4')
const salt = '0x000000000000000000000000000000000000000000000000000000000000ae7e'
const predicted = '0x1c79d8c8487df974601DaD8658c02384F7F83333'
const key = { currency0: ethers.ZeroAddress, currency1: token, hooks: addr('5'), poolManager: PCS_CL_POOL_MANAGER, fee: 10000, parameters: ethers.ZeroHash }
const coder = ethers.AbiCoder.defaultAbiCoder()
const poolId = ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key]))
const indexConfig = { name: 'Example index', symbol: 'IDX', constituentAssets: [addr('6'), addr('7')], targetWeights: [5000, 5000], basketFeeBps: 100, creatorShareBps: 0, retainCommunityOwnership: true }
const params = { token, isBuy: true, amount: 10000n, sellsman: ethers.ZeroAddress, slippage: 200 }

test.afterEach(() => { Object.assign(evm, original); global.fetch = originalFetch })

function fixture(overrides = {}) {
  const state = { listed: false, pending: false, supply: 1000000n, fees: [990n, 10n], output: 2000n, balance: 10n ** 20n, hasShare: false, approved: true, ...overrides }
  const calls = []
  const provider = {
    getNetwork: async () => ({ chainId: state.chainId ?? 56n }), getBlockNumber: async () => 123,
    getBlock: async () => ({ timestamp: 1000 }), getBalance: async () => state.balance,
    getCode: async () => '0x', getFeeData: async () => ({ gasPrice: 2n })
  }
  const signer = { provider, getAddress: async () => owner }
  const transaction = (name, args, logs = []) => {
    calls.push([name, ...args])
    return { hash: `0x${name}`, wait: async () => ({ status: 1, hash: `0x${name}`, logs }) }
  }
  const write = name => Object.assign(async (...args) => transaction(name, args), {
    staticCall: async (...args) => calls.push([`${name}.simulate`, ...args])
  })
  const blockRead = (name, value) => async at => { assert.equal(at.blockTag, 123, name); return value() }
  const tokenContract = {
    listed: blockRead('listed', () => state.listed), listingPending: blockRead('pending', () => state.pending),
    bondingCurveSupply: blockRead('supply', () => state.supply), getBuyFeeRatios: blockRead('fees', () => state.fees),
    v4PoolId: blockRead('pool', () => poolId), balanceOf: async () => state.balance,
    buyToken: write('buy'), sellToken: write('sell'),
    allowance: async () => state.allowance ?? 0n, approve: write('erc20.approve')
  }
  const iface = new ethers.Interface(PUMP14_ABI)
  const event = (name, args) => ({ address: PUMP_CONTRACTS[14], ...iface.encodeEventLog(iface.getEvent(name), args) })
  const createMethod = signature => Object.assign(async (...args) => {
    // Exercise the real ethers tuple/overload encoding, including optional pools.
    iface.encodeFunctionData(signature, args.slice(0, -1))
    return transaction('create', args, [
      event('NewToken', [args[0], predicted, owner]), event('NutboxLinked', [predicted, addr('8')]),
      event('NutboxStakingPoolLinked', [predicted, addr('9'), addr('6'), 5000]),
      ...(signature === CREATE_V14_WITH_POOLS ? [event('NutboxOptionalPoolLinked', [predicted, addr('a'), V14_TRADE_CURATION_FACTORY, 2000])] : [])
    ])
  }, {
    estimateGas: async (...args) => { calls.push(['estimate', ...args]); if (state.gasError) throw new Error('gas simulation failed'); return 100000n },
    staticCall: async (...args) => { iface.encodeFunctionData(signature, args.slice(0, -1)); calls.push(['create.simulate', ...args]) }
  })
  const pump = {
    VERSION: async () => 14n, tokenImplementation: async () => state.template ?? V14_TOKEN_IMPLEMENTATION,
    createdTicks: async () => state.tickUsed ?? false,
    createdTokens: async (a, at) => { if (at) assert.equal(at.blockTag, 123); return a === token && !state.unregistered },
    approvedConstituent: async () => state.approved, createFee: async () => 10n, getIPShare: async () => ip,
    nutboxCommittee: async () => committee, optionalPoolFactories: async () => ['Trade', 8000n, !state.disabledPool],
    getBuyAmountByValue: async (supply, net, at) => { calls.push(['curve.quote', supply, net, at]); return state.output },
    getSellPriceAfterFee: async (...args) => { calls.push(['curve.sell', ...args]); return state.output },
    getPrice: async () => 25000000000000000n,
    [CREATE_V14]: createMethod(CREATE_V14), [CREATE_V14_WITH_POOLS]: createMethod(CREATE_V14_WITH_POOLS)
  }
  const contracts = new Map(Object.entries({
    [token]: tokenContract, [PUMP_CONTRACTS[14]]: pump,
    [ip]: { ipshareCreated: async () => state.hasShare, createFee: async () => 20n },
    [committee]: { getCreateCommunityFee: async () => 30n, getCommunitySettingsFee: async () => 5n, verifyContract: async () => true },
    [PCS_CL_POOL_MANAGER]: { poolIdToPoolKey: async () => state.key ?? key, getSlot0: async () => [2n * (1n << 96n), 0n, 0n, 10000n] },
    [PCS_CL_QUOTER]: { quoteExactInputSingle: { staticCall: async args => { calls.push(['v4.quote', ...args]); return [state.output - BigInt(calls.filter(c => c[0] === 'v4.quote').length - 1) * 100n, 123n] } } },
    [PCS_PERMIT2]: { allowance: async () => [state.permitAmount ?? 0n, state.expiration ?? 0n, 0n], approve: write('permit.approve') },
    [PCS_UNIVERSAL_ROUTER]: { execute: write('execute') }
  }).map(([a, c]) => [a.toLowerCase(), c]))
  evm.contract = address => { const c = contracts.get(address.toLowerCase()); assert.ok(c, `unexpected contract ${address}`); return c }
  evm.provider = () => provider
  evm.signer = async () => signer
  return { state, calls, provider, signer, pump }
}
function api(info) {
  global.fetch = async url => {
    const body = url.includes('getETHPrice') ? 600 : { token, version: 14, listedDayNumber: 0, isImport: false, pair: null, ...info }
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body }
  }
}

test('v14 public trading uses chain state, dynamic separately-rounded fees, and never asks for a v8 API signature', async () => {
  const { calls } = fixture({ fees: [333n, 333n] })
  api({ listedDayNumber: 1 }) // Stale API claims listed, chain says curve.
  const q = await buyToken({ tick: 'EXAMPLE', ethAmount: '101', quoteOnly: true })
  assert.equal(q.route, 'unlisted-token14-buy')
  assert.equal(q.amountOutMin, '1960')
  assert.deepEqual(calls, [['curve.quote', 1000000n, 95n, { blockTag: 123 }]])
  const sell = await sellToken({ tick: 'EXAMPLE', amount: '100', quoteOnly: true })
  assert.equal(sell.expectedReceive, '2000')
  assert.equal(calls.length, 2)
})

test('curve quote caps the last buy, zero slippage retains an enforceable minimum, and both writes simulate first', async () => {
  const { signer, state, calls } = fixture({ supply: ethers.parseEther('650000000') - 100n })
  const q = await tradeV14({ ...params, signer, quoteOnly: true })
  assert.equal(q.expectedAmount, '100')
  state.supply = 1000000n
  const buy = await tradeV14({ ...params, signer, slippage: 0 })
  assert.equal(buy.amountOutMin, '2000')
  assert.equal(buy.slippageBps, 1)
  assert.deepEqual(calls.find(c => c[0] === 'buy'), ['buy', 2001n, ethers.ZeroAddress, 1, { value: 10000n }])
  await tradeV14({ ...params, signer, isBuy: false })
  assert.ok(calls.findIndex(c => c[0] === 'sell.simulate') < calls.findIndex(c => c[0] === 'sell'))
})

test('pending listing, invalid chain/deployment, fees, amounts, balances and slippage fail before writes', async () => {
  for (const [state, input, pattern] of [
    [{ pending: true }, {}, /LISTING_PENDING/], [{ chainId: 1n }, {}, /WRONG_CHAIN/],
    [{ unregistered: true }, {}, /TOKEN_MISMATCH/], [{ fees: [9999n, 1n] }, {}, /INVALID_FEES/],
    [{ output: 0n }, {}, /QUOTE_FAILED/], [{}, { slippage: 5001 }, /INVALID_SLIPPAGE/],
    [{}, { isBuy: false, amount: 1000001n }, /INVALID_AMOUNT/], [{ balance: 0n }, {}, /INSUFFICIENT_NATIVE_BALANCE/],
    [{ balance: 0n }, { isBuy: false }, /INSUFFICIENT_TOKEN_BALANCE/]
  ]) {
    const f = fixture(state)
    await assert.rejects(tradeV14({ ...params, signer: f.signer, ...input }), pattern)
    assert.ok(f.calls.every(c => !['buy', 'sell', 'execute', 'erc20.approve', 'permit.approve'].includes(c[0])))
  }
})

test('v14 prices ignore stale listed/pair metadata and invert native V4 pool price', async () => {
  const { state } = fixture({ listed: true })
  api()
  const listed = await getTokenPrice({ tick: 'EXAMPLE' })
  assert.equal(listed.listed, true)
  assert.equal(listed.pair, poolId)
  assert.equal(listed.tokenPriceInBnb, 0.25)
  assert.equal(listed.tokenPriceUsd, 150)
  state.listed = false
  api({ listedDayNumber: 1, pair: addr('b') })
  const curve = await getTokenPrice({ tick: 'EXAMPLE' })
  assert.equal(curve.listed, false)
  assert.equal(curve.pair, null)
  assert.equal(curve.tokenPriceInBnb, 0.025)
})

test('PCS V4 exact-input encoding settles input and takes minimum output in both directions', () => {
  for (const isBuy of [true, false]) {
    const hookData = coder.encode(['address'], [owner])
    const [actions, encoded] = coder.decode(['bytes', 'bytes[]'], buildV4Swap(key, isBuy, 500n, 98n, hookData))
    assert.equal(actions, '0x060c0f')
    const [swap] = coder.decode([`(${POOL_KEY_TYPE},bool,uint128,uint128,bytes)`], encoded[0])
    assert.equal(swap[1], isBuy)
    assert.equal(swap[2], 500n)
    assert.equal(swap[3], 98n)
    assert.equal(swap[4], hookData)
    assert.deepEqual([...coder.decode(['address', 'uint128'], encoded[1])], [isBuy ? ethers.ZeroAddress : token, 500n])
    assert.deepEqual([...coder.decode(['address', 'uint128'], encoded[2])], [isBuy ? token : ethers.ZeroAddress, 98n])
  }
  assert.throws(() => buildV4Swap(key, true, 1n << 128n, 1n, '0x'), /INVALID_AMOUNT/)
})

test('listed buys quote with quoter and send native BNB with referral hook data', async () => {
  const { signer, calls } = fixture({ listed: true })
  const r = await tradeV14({ ...params, signer, sellsman: owner })
  assert.equal(r.expectedAmount, '2000') // No second flat fee deduction.
  assert.equal(r.amountOutMin, '1960')
  assert.equal(calls[0][4], coder.encode(['address'], [owner]))
  const execute = calls.find(c => c[0] === 'execute')
  assert.equal(execute[1], '0x10')
  assert.equal(execute[3], 1300n)
  assert.deepEqual(execute[4], { value: 10000n })
  assert.equal(calls.filter(c => c[0].includes('approve')).length, 0)
})

test('listed sells quote without approvals, then use exact ERC20/Permit2 allowances and re-quote after confirmations', async () => {
  const { signer, calls } = fixture({ listed: true, allowance: 1n })
  await tradeV14({ ...params, signer, isBuy: false, quoteOnly: true })
  assert.deepEqual(calls.map(c => c[0]), ['v4.quote'])
  calls.length = 0
  const r = await tradeV14({ ...params, signer, isBuy: false })
  assert.deepEqual(calls.map(c => c[0]), ['v4.quote', 'erc20.approve', 'erc20.approve', 'permit.approve', 'v4.quote', 'execute.simulate', 'execute'])
  assert.deepEqual(calls[1], ['erc20.approve', PCS_PERMIT2, 0n])
  assert.deepEqual(calls[2], ['erc20.approve', PCS_PERMIT2, 10000n])
  assert.deepEqual(calls[3], ['permit.approve', token, PCS_UNIVERSAL_ROUTER, 10000n, 4600n])
  assert.equal(r.expectedReceive, '1900')
  assert.equal(r.amountOutMin, '1862')
  assert.equal(r.approveHashes.length, 3)
  assert.deepEqual(calls.at(-1).at(-1), { value: 0n })
})

test('valid allowances avoid approvals; expired Permit2 allowance renews; zero quotes never approve', async () => {
  for (const expiration of [5000n, 1100n]) {
    const { signer, calls } = fixture({ listed: true, allowance: 10000n, permitAmount: 10000n, expiration })
    await tradeV14({ ...params, signer, isBuy: false })
    assert.equal(calls.filter(c => c[0] === 'erc20.approve').length, 0)
    assert.equal(calls.filter(c => c[0] === 'permit.approve').length, expiration === 5000n ? 0 : 1)
  }
  const { signer, calls } = fixture({ listed: true, output: 0n })
  await assert.rejects(tradeV14({ ...params, signer, isBuy: false }), /QUOTE_FAILED/)
  assert.deepEqual(calls.map(c => c[0]), ['v4.quote'])
})

test('V4 validates pool currencies, manager and hash before quoting', async () => {
  for (const invalid of [{ ...key, currency0: addr('b') }, { ...key, currency1: addr('c') }, { ...key, poolManager: addr('d') }, { ...key, fee: 3000 }]) {
    const { provider } = fixture({ key: invalid })
    await assert.rejects(readNativePool(token, poolId, provider), /INVALID_POOL/)
  }
})

test('index validation enforces weights, unique approved assets, bounds and explicit ownership choice', () => {
  assert.deepEqual(validateIndexConfig(indexConfig), indexConfig)
  for (const invalid of [null, { ...indexConfig, name: '界'.repeat(22) }, { ...indexConfig, symbol: '' },
    { ...indexConfig, targetWeights: [5000, 4999] }, { ...indexConfig, constituentAssets: [addr('6'), addr('6')] },
    { ...indexConfig, constituentAssets: [ethers.ZeroAddress] }, { ...indexConfig, basketFeeBps: 99 },
    { ...indexConfig, creatorShareBps: 3001 }, { ...indexConfig, retainCommunityOwnership: undefined }]) {
    assert.throws(() => validateIndexConfig(invalid), /INDEX_CONFIG/)
  }
})

test('creation defaults to v14, calculates per-pool fees and gas reserve, and preserves the predicted salt/token', async () => {
  const { calls } = fixture()
  assert.equal(predictV14Address(owner, salt), predicted)
  const result = await createCommunity({ tick: 'EXAMPLE', indexConfig, salt, quoteOnly: true, initialBuy: '100', tradeRewardRatio: 2000 })
  assert.equal(result.version, 14)
  assert.equal(result.settingsCount, 3)
  assert.equal(result.totalRequiredFee, '75')
  assert.equal(result.transactionValue, '175')
  assert.equal(result.estimatedGasReserve, '240000')
  assert.equal(result.minimumRequiredBalance, String(175n + 240000n + MIN_CREATE_BNB_REMAINING))
  assert.equal(result.predictedToken, predicted)
  assert.equal(result.canCreate, true)
  assert.deepEqual(calls.map(c => c[0]), ['estimate'])
  const estimateArgs = calls[0].slice(1)
  new ethers.Interface(PUMP14_ABI).encodeFunctionData(CREATE_V14_WITH_POOLS, estimateArgs.slice(0, -1))
})

test('creation without optional pools selects the three-argument overload; receipts decode v14 pools', async () => {
  const { calls, state } = fixture({ hasShare: true })
  const r = await createCommunity({ tick: 'EXAMPLE', indexConfig, salt })
  assert.equal(r.totalRequiredFee, '50')
  assert.equal(r.token, predicted)
  assert.equal(r.nutboxCommunity, addr('8'))
  assert.equal(r.stakingPools[0].lpToken, addr('6'))
  assert.equal(r.nutboxSocialPool, undefined)
  assert.equal(calls.find(c => c[0] === 'create').length, 5)
  state.hasShare = false
  const optional = await createCommunity({ tick: 'EXAMPLE', indexConfig, salt, tradeRewardRatio: 2000 })
  assert.equal(optional.optionalPoolAddresses[0].factory, V14_TRADE_CURATION_FACTORY)
  assert.equal(calls.filter(c => c[0] === 'create').at(-1).length, 6)
})

test('invalid creation configuration/deployment/salt/fees cannot broadcast', async () => {
  for (const [state, input, pattern] of [
    [{}, { version: 13 }, /UNSUPPORTED_CREATE_VERSION/], [{}, { indexConfig: undefined }, /INDEX_CONFIG_REQUIRED/],
    [{}, { tick: '123' }, /INVALID_TICK/], [{}, { tick: 'TAGAI' }, /INVALID_TICK/],
    [{ approved: false }, {}, /NOT_APPROVED/], [{ template: addr('b') }, {}, /DEPLOYMENT_MISMATCH/],
    [{ tickUsed: true }, {}, /TICK_EXISTS/], [{ disabledPool: true }, { tradeRewardRatio: 2000 }, /POOL_UNAVAILABLE/],
    [{}, { salt: ethers.ZeroHash }, /INVALID_SALT/], [{ balance: 0n }, {}, /INSUFFICIENT_CREATE_BALANCE/],
    [{ gasError: true }, {}, /gas simulation failed/]
  ]) {
    const { calls } = fixture(state)
    await assert.rejects(createCommunity({ tick: 'EXAMPLE', indexConfig, salt, ...input }), pattern)
    assert.ok(!calls.some(c => c[0] === 'create'))
  }
  const f = fixture({ gasError: true })
  const q = await createCommunity({ tick: 'EXAMPLE', indexConfig, salt, quoteOnly: true })
  assert.equal(q.canCreate, false)
  assert.equal(q.minimumRequiredBalance, null)
  assert.match(q.simulationError, /gas simulation failed/)
  assert.ok(!f.calls.some(c => c[0] === 'create'))
})

test('legacy trade quote-only and unsupported versions fail instead of broadcasting a fallback route', async () => {
  fixture()
  api({ version: 8 })
  await assert.rejects(buyToken({ tick: 'OLD', ethAmount: '100', quoteOnly: true }), /QUOTE_ONLY_UNSUPPORTED/)
  await assert.rejects(sellToken({ tick: 'OLD', amount: '100', quoteOnly: true }), /QUOTE_ONLY_UNSUPPORTED/)
  api({ version: 13 })
  await assert.rejects(buyToken({ tick: 'OLD', ethAmount: '100' }), /UNSUPPORTED_TRADE_VERSION/)
})

test('unconfirmed or reverted transactions retain their hash for reconciliation', async () => {
  await assert.rejects(confirmed({ hash: '0xsubmitted', wait: async () => { throw new Error('RPC timeout') } }), /0xsubmitted.*RPC timeout/)
  await assert.rejects(confirmed({ hash: '0xreverted', wait: async () => ({ status: 0 }) }), /0xreverted/)
})
