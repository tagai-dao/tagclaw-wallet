import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ethers } from 'ethers'
import { Snapshot, MULTICALL_ABI } from '../skills/tagclaw-onchain/scripts/lib/snapshot.mjs'
import { trade, price, ipshare, nutbox } from '../skills/tagclaw-onchain/scripts/lib/prepare.mjs'
import { create, receipt, predict } from '../skills/tagclaw-onchain/scripts/lib/creation.mjs'
import * as D from '../skills/tagclaw-onchain/scripts/lib/deployment.mjs'
import { PUMP14_ABI, TOKEN14_ABI, PCS_MANAGER_ABI, PCS_QUOTER_ABI, PCS_ROUTER_ABI, PERMIT2_ABI, POOL_KEY_TYPE, CREATE_V14 } from '../src/abi/v14.js'
import { IPSHARE_ABI } from '../src/abi/ipshare.js'
import { ERC20_BALANCE_ABI, TOKEN_ALLOWANCE_ABI } from '../src/abi/erc20.js'
import { NUTBOX_POOL_ABI, NUTBOX_COMMUNITY_ABI, NUTBOX_COMMITTEE_ABI, ERC20_STAKING_POOL_ABI, ERC20_LOCKING_POOL_ABI, ERC1155_STAKING_POOL_ABI, ERC1155_APPROVAL_ABI, SOCIAL_CURATION_POOL_ABI } from '../src/abi/nutbox.js'
import * as C from '../src/constants.js'

const addr = n => `0x${n.repeat(40)}`
const owner = addr('1'), token = addr('2'), committee = addr('3'), community = addr('4'), pool = addr('5'), stakeToken = addr('6')
const zero = ethers.ZeroAddress, coder = ethers.AbiCoder.defaultAbiCoder()
const key = { currency0: zero, currency1: token, hooks: addr('7'), poolManager: D.MANAGER, fee: 10000, parameters: ethers.ZeroHash }
const poolId = ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key]))
const salt = '0x000000000000000000000000000000000000000000000000000000000000ae7e'
const config = { name: 'Example', symbol: 'IDX', constituentAssets: [addr('8'), addr('9')], targetWeights: [5000, 5000], basketFeeBps: 100, creatorShareBps: 0, retainCommunityOwnership: true }
const buy = { from: owner, token, side: 'buy', amount: '101', slippageBps: 200 }
const a = new ethers.Interface(MULTICALL_ABI)

function fixture(options = {}) {
  const s = { listed: false, pending: false, supply: 1000000n, output: 2000n, fees: [333n, 333n], allowance: 0n, permission: 0n, expiration: 0n, shareCreated: true, poolKind: 'erc20_staking', bnb: 10n ** 20n, ...options }
  const reads = []
  const contracts = new Map()
  function contract(address, abi, values) { contracts.set(address.toLowerCase(), { iface: new ethers.Interface(abi), values }) }
  contract(D.MULTICALL3, MULTICALL_ABI, { getBlockNumber: () => s.badBlock ? 124n : 123n, getEthBalance: () => s.bnb })
  contract(D.PUMP, PUMP14_ABI, { VERSION: 14n, tokenImplementation: D.IMPLEMENTATION, createdTokens: args => args[0].toLowerCase() === token,
    getBuyAmountByValue: () => s.output, getSellPriceAfterFee: () => s.output, getPrice: 25000000000000000n,
    createdTicks: false, createFee: 10n, getIPShare: D.IPSHARE, nutboxCommittee: committee,
    approvedConstituent: () => !s.unapproved, optionalPoolFactories: () => ['trade', 8000n, true] })
  contract(token, [...TOKEN14_ABI, ...ERC20_BALANCE_ABI, ...TOKEN_ALLOWANCE_ABI], {
    listed: () => s.listed, listingPending: () => s.pending, bondingCurveSupply: () => s.supply, getBuyFeeRatios: () => s.fees,
    v4PoolId: poolId, balanceOf: 10n ** 30n, allowance: () => s.allowance
  })
  contract(D.MANAGER, PCS_MANAGER_ABI, { poolIdToPoolKey: () => s.badPool ? { ...key, currency0: addr('a') } : key, getSlot0: [2n * (1n << 96n), 0n, 0n, 0n] })
  contract(D.QUOTER, PCS_QUOTER_ABI, { quoteExactInputSingle: () => [s.output, 123n] })
  contract(D.PERMIT2, PERMIT2_ABI, { allowance: () => [s.permission, s.expiration, 0n] })
  contract(D.IPSHARE, IPSHARE_ABI, { ipshareCreated: () => s.shareCreated, ipshareSupply: 100000n, ipshareBalance: 10000n, getPendingProfits: 20n,
    getStakerInfo: [owner, 1000n, 100n, 900n, 0n, 20n], createFee: 20n, getSellPriceAfterFee: 5000n })
  contract(committee, NUTBOX_COMMITTEE_ABI, { verifyContract: true, getCreateCommunityFee: 30n, getCommunitySettingsFee: 5n, getPoolOperationFee: 7n })
  contract(community, NUTBOX_COMMUNITY_ABI, { committee, poolActived: true, owner, getPoolPendingRewards: 50n })
  contract(pool, [...ERC20_LOCKING_POOL_ABI, ...ERC1155_STAKING_POOL_ABI, ...SOCIAL_CURATION_POOL_ABI], {
    getCommunity: community, getFactory: () => D.FACTORIES[s.poolKind], getUserStakedAmount: 1000n, stakeToken,
    claimableAmount: () => s.claimable ?? 100n, tokenId: 3n
  })
  contract(stakeToken, [...ERC20_BALANCE_ABI, ...TOKEN_ALLOWANCE_ABI, ...ERC1155_APPROVAL_ABI, 'function balanceOf(address,uint256) view returns(uint256)'], {
    balanceOf: 10000n, allowance: () => s.allowance, isApprovedForAll: () => s.approved1155 ?? false
  })
  const provider = {
    getNetwork: async () => ({ chainId: s.chainId ?? 56n }),
    getBlock: async name => { assert.equal(name, 'latest'); return { number: 123, hash: ethers.ZeroHash, timestamp: 1000 } },
    getCode: async (target, block) => { assert.equal(block, 123); return target.toLowerCase() === D.MULTICALL3.toLowerCase() && !s.noMulticall ? '0x1234' : '0x' },
    call: async tx => {
      // Any individual contract eth_call (including quoter calls) fails the test.
      assert.equal(tx.to, D.MULTICALL3)
      assert.equal(tx.blockTag, 123)
      assert.equal(a.parseTransaction({ data: tx.data }).name, 'aggregate3')
      const [calls] = a.decodeFunctionData('aggregate3', tx.data)
      if (s.maxBatch && calls.length > s.maxBatch) throw new Error('node gas limit')
      const decoded = calls.map(c => {
        assert.equal(c.allowFailure, true)
        const target = contracts.get(c.target.toLowerCase()); assert.ok(target, `unknown target ${c.target}`)
        const p = target.iface.parseTransaction({ data: c.callData }); assert.ok(p)
        return { target: c.target, method: p.name, args: p.args, iface: target.iface, fragment: p.fragment, values: target.values }
      })
      reads.push(decoded)
      const results = decoded.map(c => {
        if (s.failMethod === c.method) return [false, '0x']
        let value = c.values[c.method]
        if (typeof value === 'function') value = value(c.args)
        assert.notEqual(value, undefined, `missing fixture ${c.method}`)
        const out = c.fragment.outputs.length === 1 ? [value] : value
        return [true, c.iface.encodeFunctionResult(c.fragment, out)]
      })
      return a.encodeFunctionResult('aggregate3', [s.incomplete ? results.slice(1) : results])
    }
  }
  return { s, reads, provider, open: () => Snapshot.open(provider) }
}
const flat = f => f.reads.flat().filter(c => c.method !== 'getBlockNumber')

test('bundled skill ABI and deployment addresses match maintained wallet sources', () => {
  for (const file of ['v14', 'ipshare', 'nutbox', 'erc20']) {
    assert.equal(fs.readFileSync(new URL(`../skills/tagclaw-onchain/scripts/lib/${file}-abi.mjs`, import.meta.url), 'utf8'), fs.readFileSync(new URL(`../src/abi/${file}.js`, import.meta.url), 'utf8'))
  }
  for (const [key, expected] of Object.entries({ PUMP: C.PUMP_CONTRACTS[14], IMPLEMENTATION: C.V14_TOKEN_IMPLEMENTATION, MANAGER: C.PCS_CL_POOL_MANAGER, QUOTER: C.PCS_CL_QUOTER, ROUTER: C.PCS_UNIVERSAL_ROUTER, PERMIT2: C.PCS_PERMIT2, IPSHARE: C.IPSHARE_CONTRACT, TRADE_FACTORY: C.V14_TRADE_CURATION_FACTORY })) assert.equal(D[key], expected)
})

test('Multicall chunks and retries preserve target sets, output order and fixed block', async () => {
  const f = fixture({ maxBatch: 3 }), snapshot = await f.open()
  const queries = Array.from({ length: 37 }, (_, i) => ({ target: D.MULTICALL3, iface: a, method: 'getEthBalance', args: [addr(String((i % 9) + 1))] }))
  assert.deepEqual(await snapshot.read(queries), Array(37).fill(f.s.bnb))
  assert.deepEqual(flat(f).map(c => c.args[0]), queries.map(c => c.args[0]))
  assert.ok(flat(f).every(c => c.target.toLowerCase() === D.MULTICALL3.toLowerCase()))
})

test('required subcall failure, missing deployment, wrong chain and wrong snapshot reject the whole result', async () => {
  for (const opts of [{ failMethod: 'listed' }, { incomplete: true }, { badBlock: true }, { noMulticall: true }, { chainId: 1n }]) {
    const f = fixture(opts)
    await assert.rejects(async () => trade(await f.open(), buy), /MULTICALL|WRONG_CHAIN/)
  }
})

test('curve preparation uses current fees, exact sender/target/calldata/value and zero-slippage protection', async () => {
  const f = fixture(), result = await trade(await f.open(), { ...buy, slippageBps: 0 })
  assert.equal(result.transactions.length, 1)
  const tx = result.transactions[0], p = new ethers.Interface(TOKEN14_ABI).parseTransaction({ data: tx.data })
  assert.equal(tx.to.toLowerCase(), token); assert.equal(tx.from, owner); assert.equal(tx.value, '101')
  assert.equal(p.name, 'buyToken'); assert.equal(p.args[0], 2001n); assert.equal(p.args[2], 1n)
  assert.equal(result.quote.minimumOut, '2000')
  const quoteCall = flat(f).find(c => c.method === 'getBuyAmountByValue')
  assert.equal(quoteCall.target, D.PUMP); assert.equal(quoteCall.args[1], 95n)
  assert.deepEqual(f.reads[0].slice(1).map(c => [c.target.toLowerCase(), c.method]), [
    [D.PUMP.toLowerCase(), 'createdTokens'], [D.PUMP.toLowerCase(), 'VERSION'], [D.PUMP.toLowerCase(), 'tokenImplementation'],
    [token, 'listed'], [token, 'listingPending'], [token, 'bondingCurveSupply'], [token, 'getBuyFeeRatios'], [token, 'v4PoolId']
  ])
  f.s.supply = ethers.parseEther('650000000') - 100n
  assert.equal((await trade(await f.open(), buy)).quote.expectedOut, '100')
})

test('curve sells, listing pending, amount and slippage guards behave without any signer', async () => {
  const f = fixture()
  const r = await trade(await f.open(), { ...buy, side: 'sell', amount: '500' })
  assert.equal(r.transactions[0].value, '0')
  assert.equal(new ethers.Interface(TOKEN14_ABI).parseTransaction({ data: r.transactions[0].data }).args[0], 500n)
  for (const input of [{ ...buy, side: 'foo' }, { ...buy, amount: 1.1 }, { ...buy, amount: '0' }, { ...buy, slippageBps: 5001 }]) await assert.rejects(trade(await f.open(), input))
  f.s.pending = true
  await assert.rejects(trade(await f.open(), buy), /LISTING_PENDING/)
})

test('V4 quote stays inside Multicall; prepared native swap encoding settles input and takes minimum', async () => {
  const f = fixture({ listed: true }), r = await trade(await f.open(), buy)
  const tx = r.transactions[0]
  assert.equal(tx.to, D.ROUTER); assert.equal(tx.value, '101'); assert.equal(r.quote.minimumOut, '1960')
  const p = new ethers.Interface(PCS_ROUTER_ABI).parseTransaction({ data: tx.data })
  assert.equal(p.args[0], '0x10'); assert.equal(p.args[2], 1300n)
  const [actions, bytes] = coder.decode(['bytes', 'bytes[]'], p.args[1][0])
  assert.equal(actions, '0x060c0f')
  assert.deepEqual([...coder.decode(['address', 'uint128'], bytes[1])], [zero, 101n])
  assert.deepEqual([...coder.decode(['address', 'uint128'], bytes[2])], [token, 1960n])
  assert.ok(flat(f).some(c => c.target === D.QUOTER && c.method === 'quoteExactInputSingle'))
})

test('V4 sell authorization produces one next action and rebuilds between every confirmation', async () => {
  const f = fixture({ listed: true, allowance: 1n }), input = { ...buy, side: 'sell' }
  let r = await trade(await f.open(), input)
  assert.equal(r.action, 'reset-permit2-allowance'); assert.equal(r.rebuildAfterConfirmation, true)
  assert.equal(new ethers.Interface(TOKEN_ALLOWANCE_ABI).parseTransaction({ data: r.transactions[0].data }).args[1], 0n)
  f.s.allowance = 0n
  r = await trade(await f.open(), input); assert.equal(r.action, 'approve-permit2')
  f.s.allowance = 101n
  r = await trade(await f.open(), input); assert.equal(r.action, 'approve-router-in-permit2')
  const permit = new ethers.Interface(PERMIT2_ABI).parseTransaction({ data: r.transactions[0].data })
  assert.equal(permit.args[2], 101n); assert.equal(permit.args[3], 4600n)
  f.s.permission = 101n; f.s.expiration = 5000n; f.s.output = 1900n
  r = await trade(await f.open(), input)
  assert.equal(r.action, 'v14-v4-sell'); assert.equal(r.quote.expectedOut, '1900'); assert.equal(r.transactions[0].value, '0')
  f.s.expiration = 1100n
  assert.equal((await trade(await f.open(), input)).action, 'approve-router-in-permit2')
})

test('wrong V4 pool and zero output fail; spot prices invert BNB/token correctly', async () => {
  let f = fixture({ listed: true, badPool: true })
  await assert.rejects(trade(await f.open(), buy), /INVALID_NATIVE_POOL/)
  f = fixture({ listed: true, output: 0n })
  await assert.rejects(trade(await f.open(), buy), /INVALID_OUTPUT/)
  f = fixture({ listed: true })
  assert.equal((await price(await f.open(), { token })).priceInBnb, '0.25')
})

test('creation validates explicit config, computes per-pool fees and encodes both overloads', async () => {
  const f = fixture({ shareCreated: false }), input = { from: owner, tick: 'EXAMPLE', indexConfig: config, salt, initialBuy: '100' }
  const r = await create(await f.open(), { ...input, tradeRewardRatio: 2000 })
  assert.equal(r.settingsCount, 3); assert.equal(r.fees.totalFee, 75n); assert.equal(r.transactions[0].value, '175')
  assert.equal(r.predictedToken, predict(owner, salt))
  const p = new ethers.Interface(PUMP14_ABI).parseTransaction({ data: r.transactions[0].data })
  assert.equal(p.args.length, 4); assert.equal(p.args[3][0].factory, D.TRADE_FACTORY)
  const plain = await create(await f.open(), input)
  assert.equal(new ethers.Interface(PUMP14_ABI).parseTransaction({ data: plain.transactions[0].data }).args.length, 3)
  assert.equal(plain.fees.totalFee, 70n)
  assert.ok(flat(f).some(c => c.target === committee && c.method === 'getCommunitySettingsFee'))
  for (const changes of [{ tick: '123' }, { indexConfig: { ...config, retainCommunityOwnership: undefined } }, { indexConfig: { ...config, targetWeights: [1, 1] } }, { salt: ethers.ZeroHash }]) await assert.rejects(create(await f.open(), { ...input, ...changes }))
  f.s.unapproved = true
  await assert.rejects(create(await f.open(), input), /UNAPPROVED/)
})

test('IPShare prepares minimum-protected trades, stake and claim paths with correct calldata', async () => {
  const f = fixture(), input = { from: owner, subject: token }
  const info = await ipshare(await f.open(), input)
  assert.equal(info.balance, 10000n)
  for (const [action, extra, method] of [['buy', { value: '100', minimumOut: '50' }, 'buyShares'], ['sell', { amount: '100' }, 'sellShares'], ['stake', { amount: '10' }, 'stake'], ['unstake', { amount: '10' }, 'unstake'], ['redeem', {}, 'redeem'], ['claim', {}, 'claim']]) {
    const r = await ipshare(await f.open(), { ...input, action, ...extra }, true)
    assert.equal(new ethers.Interface(IPSHARE_ABI).parseTransaction({ data: r.transactions[0].data }).name, method)
  }
  await assert.rejects(ipshare(await f.open(), { ...input, action: 'buy', value: '100', minimumOut: '0' }, true), /MINIMUMOUT/)
  f.s.shareCreated = false
  assert.equal((await ipshare(await f.open(), { ...input, action: 'create' }, true)).transactions[0].value, '20')
})

test('Nutbox checks factory/community, exact approvals, operation fee, locking and ERC1155 authority', async () => {
  const f = fixture(), input = { from: owner, pool, amount: '100', action: 'deposit' }
  let r = await nutbox(await f.open(), input, true)
  assert.equal(r.action, 'approve-pool'); assert.equal(r.transactions[0].to.toLowerCase(), stakeToken)
  f.s.allowance = 100n
  r = await nutbox(await f.open(), input, true); assert.equal(r.action, 'nutbox-deposit'); assert.equal(r.transactions[0].value, '7')
  r = await nutbox(await f.open(), { ...input, action: 'claim' }, true); assert.equal(r.transactions[0].to.toLowerCase(), community)
  f.s.poolKind = 'erc20_locking'
  assert.match((await nutbox(await f.open(), { ...input, action: 'withdraw' }, true)).note, /lock queue/)
  assert.equal((await nutbox(await f.open(), { ...input, action: 'redeem' }, true)).transactions[0].value, '0')
  f.s.poolKind = 'erc1155_staking'
  r = await nutbox(await f.open(), input, true); assert.match(r.authorityChange, /ALL token IDs/)
  f.s.approved1155 = true
  assert.equal((await nutbox(await f.open(), input, true)).action, 'nutbox-deposit')
  f.s.poolKind = 'social_curation'
  await assert.rejects(nutbox(await f.open(), input, true), /NO_DEPOSIT/)
  assert.equal((await nutbox(await f.open(), { ...input, action: 'harvest' }, true)).action, 'social-harvest')
})

test('receipt reports pending/reverted hashes and verifies creation calldata and trusted emitter', async () => {
  const f = fixture(), hash = '0x' + 'ab'.repeat(32)
  f.provider.getTransactionReceipt = async () => null
  assert.equal((await receipt(f.provider, hash)).retryBroadcast, false)
  f.provider.getTransactionReceipt = async () => ({ status: 0, blockNumber: 123 })
  assert.equal((await receipt(f.provider, hash)).status, 'REVERTED')
  const iface = new ethers.Interface(PUMP14_ABI), expected = predict(owner, salt)
  const event = iface.encodeEventLog(iface.getEvent('NewToken'), ['EXAMPLE', expected, owner])
  const r = { status: 1, to: D.PUMP, blockNumber: 123, blockHash: ethers.ZeroHash, logs: [{ address: D.PUMP, ...event }] }
  f.provider.getTransactionReceipt = async () => r
  f.provider.getTransaction = async () => ({ from: owner, to: D.PUMP, value: 70n, data: iface.encodeFunctionData(CREATE_V14, ['EXAMPLE', salt, config]) })
  assert.equal((await receipt(f.provider, hash)).token, expected)
  r.logs[0].address = token
  await assert.rejects(receipt(f.provider, hash), /RECEIPT_MISMATCH/)
})
