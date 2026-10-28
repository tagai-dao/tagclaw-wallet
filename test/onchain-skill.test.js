import { AGENT_SWAP_ABI } from '../skills/tagclaw-onchain/scripts/lib/agent-swap.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ethers } from 'ethers'
import { Snapshot, MULTICALL_ABI } from '../skills/tagclaw-onchain/scripts/lib/snapshot.mjs'
import { trade, price, ipshare, ipshareQuote, IPSHARE_QUOTE_ABI, nutbox, tokenInfo, tokenBalance, agentTradeIdentity } from '../skills/tagclaw-onchain/scripts/lib/prepare.mjs'
import { create, creationOptions, receipt, predict } from '../skills/tagclaw-onchain/scripts/lib/creation.mjs'
import * as D from '../skills/tagclaw-onchain/scripts/lib/deployment.mjs'
import { PUMP14_ABI, TOKEN14_ABI, PCS_MANAGER_ABI, PCS_QUOTER_ABI, PCS_ROUTER_ABI, PERMIT2_ABI, POOL_KEY_TYPE, CREATE_V14 } from '../src/abi/v14.js'
import { IPSHARE_ABI } from '../src/abi/ipshare.js'
import { ERC20_BALANCE_ABI, TOKEN_ALLOWANCE_ABI } from '../src/abi/erc20.js'
import { NUTBOX_POOL_ABI, NUTBOX_COMMUNITY_ABI, NUTBOX_COMMITTEE_ABI, ERC20_STAKING_POOL_ABI, ERC20_LOCKING_POOL_ABI, ERC1155_STAKING_POOL_ABI, ERC1155_APPROVAL_ABI, SOCIAL_CURATION_POOL_ABI } from '../src/abi/nutbox.js'
import * as C from '../src/constants.js'
import {indexInfo,prepareIndex,miningPools} from '../skills/tagclaw-onchain/scripts/lib/index.mjs'
import * as I from '../skills/tagclaw-onchain/scripts/lib/index-abi.mjs'
import { legacyState, legacyTrade, legacyPrice, LEGACY_ABI, V2_ABI, IMPORT_ABI, WRAPPER_ABI } from '../skills/tagclaw-onchain/scripts/lib/legacy.mjs'

const addr = n => `0x${n.repeat(40)}`
const owner = addr('1'), token = addr('2'), committee = addr('3'), community = addr('4'), pool = addr('5'), stakeToken = addr('6')
const basket=addr('a')
const zero = ethers.ZeroAddress, coder = ethers.AbiCoder.defaultAbiCoder()
const key = { currency0: zero, currency1: token, hooks: addr('7'), poolManager: D.MANAGER, fee: 10000, parameters: ethers.ZeroHash }
const poolId = ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key]))
const salt = '0x000000000000000000000000000000000000000000000000000000000000ae7e'
const salt18 = '0x0000000000000000000000000000000000000000000000000000000000010745'
const config = { name: 'Example', symbol: 'IDX', constituentAssets: [addr('8'), addr('9')], targetWeights: [5000, 5000], basketFeeBps: 100, creatorShareBps: 0, retainCommunityOwnership: true }
const buy = { from: owner, token, side: 'buy', amount: '101', slippageBps: 200 }
const a = new ethers.Interface(MULTICALL_ABI)

function fixture(options = {}) {
  const s = { listed: false, pending: false, supply: 1000000n, output: 2000n, fees: [333n, 333n], allowance: 0n, permission: 0n, expiration: 0n, shareCreated: true, poolKind: 'erc20_staking', bnb: 10n ** 20n, ...options }
  const reads = []
  const contracts = new Map()
  function contract(address, abi, values) { contracts.set(address.toLowerCase(), { iface: new ethers.Interface(abi), values }) }
  contract(D.MULTICALL3, MULTICALL_ABI, { getBlockNumber: () => s.badBlock ? 124n : 123n, getEthBalance: () => s.bnb })
  contract(D.PUMP, [...PUMP14_ABI,...I.PUMP_EXTRA_ABI], { VERSION: 14n, tokenImplementation: D.IMPLEMENTATION, createdTokens: args => args[0].toLowerCase() === token && (s.version ?? 14) === 14,
    getBuyAmountByValue: () => s.output, getSellPriceAfterFee: () => s.output, getPrice: 25000000000000000n,
    createdTicks: false, createFee: 10n, getIPShare: D.IPSHARE, nutboxCommittee: committee,
    erc20StakingFactory:()=>s.modernFactory?addr('b'):D.FACTORIES.erc20_staking, approvedConstituent: () => !s.unapproved, optionalPoolFactories: () => ['trade', 8000n, true] })
  contract(D.PUMP15,[...PUMP14_ABI,...I.PUMP_EXTRA_ABI],{...contracts.get(D.PUMP.toLowerCase()).values,VERSION:15n,tokenImplementation:D.IMPLEMENTATION15,createdTokens:args=>args[0].toLowerCase()===token&&s.version===15})
  for (const version of [13, 16, 17, 18]) contract(D.PROFILES[version].pump, [...PUMP14_ABI,...I.PUMP_EXTRA_ABI], { ...contracts.get(D.PUMP.toLowerCase()).values, VERSION: BigInt(version), tokenImplementation: D.PROFILES[version].implementation, createdTokens: args => args[0].toLowerCase() === token && s.version === version })
  for (const [version, pump] of Object.entries(D.LEGACY_PUMPS)) contract(pump, [...PUMP14_ABI,...LEGACY_ABI], { createdTokens: true, getFeeRatio: [100n,100n], getBuyAmountByValue: () => s.output, getSellPriceAfterFee: () => s.output })
  contract(D.V2_FACTORY, V2_ABI, { getPair: addr('c') })
  contract(D.V2_ROUTER, V2_ABI, { getAmountsOut: args => [args[0],s.output] })
  contract(addr('c'), V2_ABI, { token0: D.WBNB, token1: token })
  contract(D.AGENT_SWAP, AGENT_SWAP_ABI, { quoteBuy: () => s.output, quoteSell: () => s.output, HANDLE_REGISTRY: D.HANDLE_REGISTRY, ipshare: D.IPSHARE, nutboxRouter: D.NUTBOX_ROUTER, paused:()=>s.wrapperPaused??false, tagaiRatio:20n, sellsmanRatio:20n, tokenNutboxFeeBps:()=>s.nutboxBps??0n, referralHookCodeHash:()=>s.referralEnabled?ethers.keccak256('0x1234'):ethers.ZeroHash })
  contract(D.HANDLE_REGISTRY,I.HANDLE_ABI,{handleOf:()=>s.handle??'agent.ai'})
  contract(D.NUTBOX_ROUTER,I.PERMISSIONS_ABI,{operators:()=>!s.notReady})
  contract(D.BASKET_REGISTRY,[...I.BASKET_REGISTRY_ABI,...I.PERMISSIONS_ABI],{basketVersion:()=>s.badBasket?3n:4n,approvedCreatorForwarders:()=>!s.notReady})
  contract(token, [...TOKEN14_ABI, ...ERC20_BALANCE_ABI, ...TOKEN_ALLOWANCE_ABI, ...I.TOKEN_INDEX_ABI, ...I.CURVE_LIMIT_ABI, 'function totalSupply() view returns(uint256)'], {
    innerMarketBought:()=>s.bought??0n,INNER_MARKET_BUY_LIMIT:10000000n*10n**18n,symbol:'MEME',decimals:18,totalSupply:10n**27n,indexToken:()=>s.noBasket?zero:basket,nutboxCommunity:community,componentCount:2n,pendingBuybackReward:100n,componentAt:args=>[addr(args[0]===0n?'8':'9'),5000n,args[0]===0n?stakeToken:addr('e')],
    listed: () => s.listed, listingPending: () => s.pending, bondingCurveSupply: () => s.supply, getBuyFeeRatios: () => s.fees,
    v4PoolId: poolId, balanceOf: 10n ** 30n, allowance: () => s.allowance
  })
  contract(D.MANAGER, PCS_MANAGER_ABI, { poolIdToPoolKey: () => s.badPool ? { ...key, currency0: addr('a') } : key, getSlot0: [2n * (1n << 96n), 0n, 0n, 0n] })
  contract(D.QUOTER, PCS_QUOTER_ABI, { quoteExactInputSingle: () => [s.output, 123n] })
  contract(D.PERMIT2, PERMIT2_ABI, { allowance: () => [s.permission, s.expiration, 0n] })
  contract(D.IPSHARE, [...IPSHARE_ABI, ...IPSHARE_QUOTE_ABI], { subjectFeePercent: 300n, protocolFeePercent: 200n, getBuyAmountByValue: 2000n, getBuyPriceAfterFee: 1000n, ipshareCreated: () => s.shareCreated, ipshareSupply: 100000n, ipshareBalance: 10000n, getPendingProfits: 20n,
    getStakerInfo: [owner, 1000n, 100n, 900n, 0n, 20n], createFee: ()=>s.ipFee??20n, getSellPriceAfterFee: 5000n })
  contract(committee, NUTBOX_COMMITTEE_ABI, { verifyContract: true, getCreateCommunityFee: 30n, getCommunitySettingsFee: 5n, getPoolOperationFee: 7n })
  contract(community, [...NUTBOX_COMMUNITY_ABI,...I.COMMUNITY_INDEX_ABI], { getCommunityToken:token,getCommittee:committee,createdPools:args=>args[0]===0n?pool:addr('d'),committee, poolActived: true, owner, getPoolPendingRewards: 50n })
  contract(pool, [...ERC20_LOCKING_POOL_ABI, ...ERC1155_STAKING_POOL_ABI, ...SOCIAL_CURATION_POOL_ABI], {
    getCommunity: community, getFactory: () => s.modernFactory?addr('b'):D.FACTORIES[s.poolKind], getUserStakedAmount: 1000n, stakeToken,
    claimableAmount: () => s.claimable ?? 100n, tokenId: 3n
  })
  contract(stakeToken, [...ERC20_BALANCE_ABI, ...TOKEN_ALLOWANCE_ABI, ...ERC1155_APPROVAL_ABI, 'function balanceOf(address,uint256) view returns(uint256)'], {
    balanceOf: 10000n, allowance: () => s.allowance, isApprovedForAll: () => s.approved1155 ?? false
  })
  contract(basket,[...I.BASKET_TOKEN_ABI,...I.BASKET_ROUTES_ABI,...ERC20_BALANCE_ABI,...TOKEN_ALLOWANCE_ABI],{
    protocolVersion:4n,registry:D.BASKET_REGISTRY,engine:D.BASKET_HOOK,settlementToken:D.SETTLEMENT,rebalanceExecutor:D.BASKET_EXECUTOR,
    assetCount:2n,effectiveSupply:()=>s.firstMint?0n:100000n,balanceOf:10000n,basketFeeBps:100n,
    assetAt:args=>[addr(args[0]===0n?'8':'9'),5000n,50000n],
    assetRouteAt:()=>[2n,D.SETTLEMENT,{...key,currency0:D.SETTLEMENT},0n,100n],
    claimableHolderFees:10n,pendingCreatorFees:20n,pendingLauncherFees:30n,pendingFrontendFees:40n,creatorPayout:owner,launcherPayout:owner,
    allowance:()=>s.indexAllowance??0n
  })
  contract(D.BASKET_HOOK,I.BASKET_HOOK_ABI,{selfPoolKey:()=>({...key,currency0:D.SETTLEMENT,currency1:basket,hooks:D.BASKET_HOOK})})
  contract(D.BASKET_ROUTER,I.BASKET_SWAP_ABI,{basketHook:D.BASKET_HOOK,settlementToken:D.SETTLEMENT})
  contract(D.BASKET_EXECUTOR,I.BASKET_EXECUTOR_ABI,{quoteAssetToWbnb:100n})
  contract(D.SETTLEMENT,[...ERC20_BALANCE_ABI,...TOKEN_ALLOWANCE_ABI],{balanceOf:100000000n,allowance:()=>s.indexAllowance??0n})
  contract(addr('d'),[...ERC20_STAKING_POOL_ABI],{...contracts.get(pool.toLowerCase()).values,stakeToken:addr('e')})
  contract(addr('e'),[...ERC20_BALANCE_ABI],{balanceOf:1000n})
  const provider = {
    getNetwork: async () => ({ chainId: s.chainId ?? 56n }),
    getBlock: async name => { assert.equal(name, 'latest'); return { number: 123, hash: ethers.ZeroHash, timestamp: 1000 } },
    getCode: async (target, block) => { assert.equal(block, 123); return (target.toLowerCase() === D.MULTICALL3.toLowerCase() && !s.noMulticall || target.toLowerCase()===key.hooks.toLowerCase()) ? '0x1234' : '0x' },
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
  assert.deepEqual(f.reads[0].slice(1).map(c=>c.target),Object.values(D.PROFILES).map(profile => profile.pump))
  assert.deepEqual(f.reads[1].slice(1).map(c => [c.target.toLowerCase(), c.method]), [
    [D.PUMP.toLowerCase(), 'VERSION'], [D.PUMP.toLowerCase(), 'tokenImplementation'],
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

test('native Infinity trades quote and execute through AgentSwapWrapper with exact source and recipient', async () => {
  const f=fixture({listed:true}),r=await trade(await f.open(),buy),tx=r.transactions[0]
  assert.equal(tx.to,D.AGENT_SWAP);assert.equal(tx.value,'101');assert.equal(r.quote.minimumOut,1960n)
  const parsed=new ethers.Interface(AGENT_SWAP_ABI).parseTransaction({data:tx.data})
  assert.equal(parsed.args[0],token);assert.equal(parsed.args[1],3n);assert.equal(parsed.args[3],1960n);assert.equal(parsed.args[4],owner)
  const [source]=coder.decode([`(address,${POOL_KEY_TYPE})`],parsed.args[2]);assert.equal(source[0],D.QUOTER);assert.equal(source[1].currency1,token)
  const quote=flat(f).find(c=>c.target===D.AGENT_SWAP&&c.method==='quoteBuy')
  assert.deepEqual([...quote.args],[token,3n,parsed.args[2],101n])
  assert.ok(!flat(f).some(c=>[D.IMPORTED_SWAP,D.ROUTER,D.QUOTER].includes(c.target)))
})

test('external sells reset/approve only AgentSwapWrapper and re-quote after confirmation',async()=>{
  const f=fixture({listed:true,allowance:1n}),input={...buy,side:'sell'}
  let r=await trade(await f.open(),input)
  assert.equal(r.action,'reset-agent-wrapper-allowance');assert.equal(r.rebuildAfterConfirmation,true)
  let parsed=new ethers.Interface(TOKEN_ALLOWANCE_ABI).parseTransaction({data:r.transactions[0].data})
  assert.equal(parsed.args[0],D.AGENT_SWAP);assert.equal(parsed.args[1],0n)
  f.s.allowance=0n;r=await trade(await f.open(),input);assert.equal(r.action,'approve-agent-wrapper')
  parsed=new ethers.Interface(TOKEN_ALLOWANCE_ABI).parseTransaction({data:r.transactions[0].data});assert.equal(parsed.args[1],101n)
  f.s.allowance=101n;f.s.output=1900n;r=await trade(await f.open(),input)
  assert.equal(r.action,'v14-agent-sell');assert.equal(r.transactions[0].to,D.AGENT_SWAP);assert.equal(r.quote.expectedOut,1900n)
  assert.ok(!flat(f).some(c=>c.target===D.PERMIT2))
})

test('wrong V4 pool and zero output fail; spot prices invert BNB/token correctly', async () => {
  let f = fixture({ listed: true, badPool: true })
  await assert.rejects(trade(await f.open(), buy), /INVALID_NATIVE_POOL/)
  f = fixture({ listed: true, output: 0n })
  await assert.rejects(trade(await f.open(), buy), /ZERO_OUTPUT/)
  f = fixture({ listed: true })
  assert.equal((await price(await f.open(), { token })).priceInBnb, '0.25')
})

test('creation validates explicit config, computes per-pool fees and encodes both overloads', async () => {
  const f = fixture({ version:18, shareCreated: false }), input = { version:18, from: owner, tick: 'EXAMPLE', indexConfig: config, salt:salt18, initialBuy: '100' }
  const r = await create(await f.open(), { ...input, tradeRewardRatio: 2000 })
  assert.equal(r.settingsCount, 3); assert.equal(r.fees.totalFee, 75n); assert.equal(r.transactions[0].value, '175')
  assert.equal(r.predictedToken, predict(owner, salt18, 18))
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
  const iface = new ethers.Interface(PUMP14_ABI), expected = predict(owner, salt, 14)
  const event = iface.encodeEventLog(iface.getEvent('NewToken'), ['EXAMPLE', expected, owner])
  const r = { status: 1, to: D.PUMP, blockNumber: 123, blockHash: ethers.ZeroHash, logs: [{ address: D.PUMP, ...event }] }
  f.provider.getTransactionReceipt = async () => r
  f.provider.getTransaction = async () => ({ from: owner, to: D.PUMP, value: 70n, data: iface.encodeFunctionData(CREATE_V14, ['EXAMPLE', salt, config]) })
  assert.equal((await receipt(f.provider, hash)).token, expected)
  r.logs[0].address = token
  await assert.rejects(receipt(f.provider, hash), /RECEIPT_MISMATCH/)
})

test('v18 is the only creation version and does not require a buyer handle for the atomic buy',async()=>{
  const f=fixture({version:18,handle:''})
  const r=await create(await f.open(),{from:owner,tick:'EXAMPLE',indexConfig:config,salt:salt18})
  assert.equal(r.version,18);assert.equal(r.binanceWalletOnly,true);assert.equal(r.transactions[0].to,D.PROFILES[18].pump)
  assert.equal(r.predictedToken,predict(owner,salt18,18))
  assert.ok(flat(f).some(c=>c.target===D.NUTBOX_ROUTER&&c.method==='operators'&&c.args[0]===D.PROFILES[18].pump))
  assert.ok(flat(f).some(c=>c.target===D.BASKET_REGISTRY&&c.method==='approvedCreatorForwarders'))
  assert.ok(!flat(f).some(c=>c.method==='handleOf'))
  for (const version of [1,8,13,14,15,16,17]) await assert.rejects(create(await f.open(),{version,from:owner,tick:'EXAMPLE',indexConfig:config,salt:salt18}),/UNSUPPORTED_CREATE_VERSION/)
  f.s.notReady=true
  await assert.rejects(create(await f.open(),{from:owner,tick:'EXAMPLE',indexConfig:config,salt:salt18}),error=>{
    assert.match(error.message,/PROTOCOL_CREATION_NOT_READY/)
    assert.match(error.message,/protocol contract owners/)
    assert.match(error.message,/not the user wallet/)
    assert.ok(error.message.includes(D.PROFILES[18].pump))
    return true
  })
})

test('v18 creation options filter candidates and expose missing permissions at one Multicall snapshot', async () => {
  const f=fixture({version:18}),snapshot=await f.open(),candidates=[{address:addr('8'),symbol:'ASSET',decimals:18}]
  const result=await creationOptions(snapshot,{from:owner},candidates)
  assert.equal(result.version,18);assert.equal(result.ready,true);assert.deepEqual(result.assets,candidates)
  assert.equal(result.permissions.scope,'protocol-contract')
  assert.equal(result.permissions.subject,D.PROFILES[18].pump)
  assert.equal(result.permissions.requiresUserWalletAllowlisting,false)
  assert.equal(result.readiness.code,'READY')
  assert.equal(result.readiness.responsibleParty,null)
  assert.equal(result.settingsFee,5n)
  assert.ok(flat(f).some(read=>read.target===D.PROFILES[18].pump&&read.method==='approvedConstituent'&&read.args[0]===addr('8')))
  f.s.unapproved=true;f.s.notReady=true
  const blocked=await creationOptions(snapshot,{from:owner},candidates)
  assert.equal(blocked.ready,false);assert.deepEqual(blocked.assets,[])
  assert.equal(blocked.readiness.code,'PROTOCOL_ACTIVATION_PENDING')
  assert.equal(blocked.readiness.responsibleParty,'protocol-owner')
  assert.deepEqual(blocked.readiness.missingPermissions,['nutboxOperator','basketForwarder'])
  const otherWallet=await creationOptions(snapshot,{from:addr('f')},candidates)
  assert.notEqual(otherWallet.from,blocked.from)
  assert.deepEqual(otherWallet.permissions,blocked.permissions)
  assert.deepEqual(otherWallet.readiness,blocked.readiness)
  const permissionReads=flat(f).filter(read=>['operators','approvedCreatorForwarders'].includes(read.method))
  assert.equal(permissionReads.length,6)
  assert.deepEqual(new Set(permissionReads.map(read=>read.target)),new Set([D.NUTBOX_ROUTER,D.BASKET_REGISTRY]))
  for(const read of permissionReads)assert.deepEqual([...read.args],[D.PROFILES[18].pump])
})

test('v15 ordinary curve buys require the real sender handle; sells and listed trades do not',async()=>{
  const f=fixture({version:15,handle:''})
  await assert.rejects(trade(await f.open(),buy),/V15_HANDLE_NOT_REGISTERED/)
  f.s.handle='agent.ai'
  assert.equal((await trade(await f.open(),buy)).action,'v15-curve-buy')
  assert.ok(flat(f).some(c=>c.target===D.HANDLE_REGISTRY&&c.method==='handleOf'&&c.args[0]===owner))
  f.s.handle=''
  assert.equal((await trade(await f.open(),{...buy,side:'sell'})).action,'v15-curve-sell')
  f.s.listed=true
  await assert.rejects(trade(await f.open(),buy),/BINANCE_HANDLE_REQUIRED/)
  f.s.handle='agent.ai';assert.equal((await trade(await f.open(),buy)).action,'v15-agent-buy')
})

test('token-info reports pending listing and components; token-balance formats raw units',async()=>{
  const f=fixture({version:15,pending:true,handle:''})
  const info=await tokenInfo(await f.open(),{token,from:owner})
  assert.equal(info.version,15);assert.equal(info.market,'listing');assert.equal(info.canBuyOnCurve,false)
  assert.equal(info.components.length,2);assert.equal(info.indexToken.toLowerCase(),basket)
  const balance=await tokenBalance(await f.open(),{token,from:owner})
  assert.equal(balance.raw,10n**30n);assert.equal(balance.formatted,'1000000000000.0')
})

test('index provenance and reserves are verified and index/fee claims preserve sender recipients',async()=>{
  const f=fixture({version:15,listed:true})
  const info=await indexInfo(await f.open(),{token,from:owner})
  assert.equal(info.basket.toLowerCase(),basket);assert.equal(info.assets.length,2);assert.equal(info.ready,true)
  for(const action of ['claim-index','claim-fees','claim-creator-fees','claim-launcher-fees','claim-frontend-fees']){
    const r=await prepareIndex(await f.open(),{token,from:owner,action})
    assert.equal(r.transactions[0].from,owner);assert.equal(r.transactions[0].value,'0')
    assert.equal(r.transactions[0].to.toLowerCase(),action==='claim-index'?token:basket)
  }
  f.s.badBasket=true
  await assert.rejects(indexInfo(await f.open(),{token,from:owner}),/UNSUPPORTED_INDEX_DEPLOYMENT/)
})

test('index buys/sells use protected quoter outputs, exact approvals and correct USDT settlement',async()=>{
  const f=fixture({version:15,listed:true}),input={token,from:owner,action:'buy',amount:'100',slippageBps:100}
  let r=await prepareIndex(await f.open(),input)
  assert.equal(r.action,'approve-index-router');assert.equal(r.rebuildAfterConfirmation,true)
  assert.equal(r.transactions[0].to,D.SETTLEMENT)
  f.s.indexAllowance=1n
  r=await prepareIndex(await f.open(),input);assert.equal(r.action,'reset-index-allowance')
  f.s.indexAllowance=100n
  r=await prepareIndex(await f.open(),input)
  assert.equal(r.action,'index-buy');assert.equal(r.transactions[0].to,D.BASKET_ROUTER);assert.equal(r.transactions[0].value,'0')
  const p=new ethers.Interface(I.BASKET_SWAP_ABI).parseTransaction({data:r.transactions[0].data})
  assert.equal(p.name,'buyExactSettlement');assert.equal(p.args[2],1980n);assert.equal(p.args[4],owner)
  const [data]=coder.decode([I.BASKET_TRADE_TYPE],p.args[3]);assert.equal(data.minBasketOut,1980n);assert.deepEqual([...data.legMins],[990n,990n])
  r=await prepareIndex(await f.open(),{...input,action:'sell'})
  assert.equal(new ethers.Interface(I.BASKET_SWAP_ABI).parseTransaction({data:r.transactions[0].data}).name,'sellExactBasket')
  f.s.firstMint=true
  await assert.rejects(prepareIndex(await f.open(),input),/FIRST_INDEX_BUY_REQUIRES_LEG_MINS/)
  r=await prepareIndex(await f.open(),{...input,legMins:['50','50']});assert.equal(r.action,'index-buy')
  f.s.output=0n
  await assert.rejects(prepareIndex(await f.open(),{...input,legMins:['50','50']}),/ZERO_INDEX_OUTPUT/)
})

test('in-kind redemption uses a quoted native fee cap, correct leg mask and beneficiary',async()=>{
  const f=fixture({version:15,listed:true}),input={token,from:owner,action:'redeem',amount:'100',nativeFeeCap:'2'}
  const r=await prepareIndex(await f.open(),input)
  assert.equal(r.estimatedNativeFee,2n);assert.equal(r.transactions[0].value,'2')
  const p=new ethers.Interface(I.BASKET_TOKEN_ABI).parseTransaction({data:r.transactions[0].data})
  assert.equal(p.name,'redeemInKind');assert.deepEqual([...p.args[1]],[true,true]);assert.equal(p.args[2],owner)
  await assert.rejects(prepareIndex(await f.open(),{...input,nativeFeeCap:'1'}),/FEE_CAP/)
  await assert.rejects(prepareIndex(await f.open(),{...input,legMask:[true]}),/LEG_MASK/)
})

test('current Nutbox factories are accepted only from trusted Pump configuration and LP associations are verified',async()=>{
  const f=fixture({version:15,listed:true,modernFactory:true,allowance:1000n})
  const r=await nutbox(await f.open(),{from:owner,pool,action:'deposit',amount:'100'},true)
  assert.equal(r.action,'nutbox-deposit')
  assert.ok(flat(f).some(c=>c.method==='erc20StakingFactory'&&c.target===D.PUMP15))
  const pools=await miningPools(await f.open(),{token,from:owner})
  assert.equal(pools.pools.length,2);assert.equal(pools.pools[0].pair,stakeToken)
  assert.ok(flat(f).some(c=>c.target===community&&c.method==='getCommunityToken'))
})

test('legacy v15 receipt remains recognizable while new creation is restricted to v18',async()=>{
  const f=fixture({version:15}),salt15='0x000000000000000000000000000000000000000000000000000000000000ed9a'
  const input={from:owner,tick:'EXAMPLE',indexConfig:config,salt:salt15}
  await assert.rejects(create(await f.open(),{...input,binanceWalletOnly:false}),/MODE_MISMATCH/)
  await assert.rejects(create(await f.open(),{...input,tick:'中文中文中文'}),/INVALID_TICK/)
  const hash='0x'+'cd'.repeat(32),iface=new ethers.Interface(PUMP14_ABI),expected=predict(owner,salt15,15)
  const event=iface.encodeEventLog(iface.getEvent('NewToken'),['EXAMPLE',expected,owner])
  const r={status:1,to:D.PUMP15,blockNumber:123,blockHash:ethers.ZeroHash,logs:[{address:D.PUMP15,...event}]}
  f.provider.getTransactionReceipt=async()=>r
  f.provider.getTransaction=async()=>({from:owner,to:D.PUMP15,value:50n,data:iface.encodeFunctionData(CREATE_V14,['EXAMPLE',salt15,config])})
  const out=await receipt(f.provider,hash);assert.equal(out.version,15);assert.equal(out.binanceWalletOnly,true);assert.equal(out.token,expected)
  r.logs[0].address=D.PUMP
  await assert.rejects(receipt(f.provider,hash),/RECEIPT_MISMATCH/)
})

test('all current index-token versions remain queryable and tradable; v15 and later buys need a handle', async () => {
  for (const version of [13,14,15,16,17,18]) {
    const fixtureData=fixture({version,handle:''})
    const info=await tokenInfo(await fixtureData.open(),{token,from:owner})
    assert.equal(info.version,version)
    if(version>=15) await assert.rejects(trade(await fixtureData.open(),buy),/HANDLE_NOT_REGISTERED/)
    else assert.equal((await trade(await fixtureData.open(),buy)).transactions[0].to.toLowerCase(),token)
    assert.equal((await trade(await fixtureData.open(),{...buy,side:'sell'})).transactions[0].value,'0')
    fixtureData.s.listed=true;fixtureData.s.handle='agent.ai'
    assert.equal((await trade(await fixtureData.open(),buy)).transactions[0].to,D.AGENT_SWAP)
  }
})

test('v17 cumulative curve limit is checked through fixed-block Multicall, including the exact boundary', async () => {
  const limit=10000000n*10n**18n, f=fixture({version:17,bought:limit-2000n})
  assert.equal((await trade(await f.open(),buy)).action,'v17-curve-buy')
  const limitReads=flat(f).filter(c=>['innerMarketBought','INNER_MARKET_BUY_LIMIT'].includes(c.method))
  assert.deepEqual(limitReads.map(c=>c.target),[token,token])
  assert.deepEqual([...limitReads[0].args],[owner])
  f.s.bought+=1n
  await assert.rejects(trade(await f.open(),buy),/INNER_MARKET_BUY_LIMIT_EXCEEDED/)
  assert.equal((await trade(await f.open(),{...buy,side:'sell'})).action,'v17-curve-sell')
})

test('legacy curve versions encode their own ABI and eligibility gates inside fixed-block Multicall', async () => {
  for(const version of [1,2,3,4,5,6,7,8,9,11]) {
    const fixtureData=fixture({version}), snapshot=await fixtureData.open()
    const state=await legacyState(snapshot,{version,token,tick:'MEME'})
    const input={...buy,signature:'0x'+'ab'.repeat(65),deadline:'1200'}
    const result=await legacyTrade(snapshot,input,state)
    const iface=new ethers.Interface([...TOKEN14_ABI,...LEGACY_ABI])
    const parsed=iface.parseTransaction({data:result.transactions[0].data})
    assert.equal(parsed.name,'buyToken')
    assert.equal(parsed.args.length,version===8?5:[1,5].includes(version)?4:3)
    assert.equal(result.quote.minimumOut,1960n)
    assert.ok(flat(fixtureData).some(read=>read.target===D.LEGACY_PUMPS[version]&&read.method==='getBuyAmountByValue'))
    assert.ok(flat(fixtureData).some(read=>read.target.toLowerCase()===token&&read.method==='getBuyFeeRatios'))
    const sold=await legacyTrade(snapshot,{...input,side:'sell'},state)
    assert.equal(iface.parseTransaction({data:sold.transactions[0].data}).args.length,version===8?6:4)
    if([5,8].includes(version)) await assert.rejects(legacyTrade(snapshot,buy,state),/LEGACY_ELIGIBILITY_REQUIRED/)
  }
})

test('legacy feature-probe failure stays in Multicall and uses required fixed-block fee fallback', async () => {
  const fixtureData=fixture({version:2,failMethod:'getBuyFeeRatios'}),snapshot=await fixtureData.open()
  const state=await legacyState(snapshot,{version:2,token,tick:'MEME'})
  const result=await legacyTrade(snapshot,buy,state)
  assert.equal(result.quote.expectedOut,2000n)
  assert.ok(flat(fixtureData).some(read=>read.target===D.LEGACY_PUMPS[2]&&read.method==='getFeeRatio'))
  fixtureData.s.failMethod='getBuyAmountByValue'
  await assert.rejects(legacyTrade(snapshot,buy,state),/MULTICALL_SUBCALL_FAILED/)
})

test('legacy V2 and V4 external routes preserve exact spender, minimum and approval ordering', async () => {
  const fixtureData=fixture({version:2,listed:true}),snapshot=await fixtureData.open()
  const state=await legacyState(snapshot,{version:2,token,tick:'MEME'})
  const bought=await legacyTrade(snapshot,buy,state)
  assert.equal(bought.transactions[0].to,D.AGENT_SWAP)
  const parsed=new ethers.Interface(AGENT_SWAP_ABI).parseTransaction({data:bought.transactions[0].data})
  assert.equal(parsed.args[3],1960n);assert.equal(parsed.args[4],owner)
  let sold=await legacyTrade(snapshot,{...buy,side:'sell'},state)
  assert.equal(sold.action,'approve-agent-wrapper')
  assert.equal(new ethers.Interface(TOKEN_ALLOWANCE_ABI).parseTransaction({data:sold.transactions[0].data}).args[0],D.AGENT_SWAP)
  fixtureData.s.allowance=1000n
  sold=await legacyTrade(snapshot,{...buy,side:'sell'},state)
  assert.equal(sold.transactions[0].to,D.AGENT_SWAP)
  const quoted=await legacyPrice(snapshot,{},state)
  assert.equal(quoted.quoteType,'effective-buy-price-including-fees-not-spot')
  for(const version of [7,8,9,11]) {
    const other=await legacyState(snapshot,{version,token,tick:'MEME',pair:JSON.stringify(key)})
    const result=await legacyTrade(snapshot,buy,other)
    assert.equal(result.transactions[0].to,D.AGENT_SWAP)
    assert.ok(flat(fixtureData).some(read=>read.target===D.AGENT_SWAP&&read.method==='quoteBuy'))
  }
})

test('V10 imports encode V2/V3/V4 source types without native-token assumptions', async () => {
  for(const [dexVersion,sourceType] of [[2,0],[3,1],[4,3]]) {
    const fixtureData=fixture(),snapshot=await fixtureData.open()
    const state=await legacyState(snapshot,{version:10,isImport:true,token,tick:'IMPORT',dexVersion,pair:dexVersion===4?poolId:addr('c')})
    const result=await legacyTrade(snapshot,buy,state)
    assert.equal(result.transactions[0].to,D.AGENT_SWAP)
    const parsed=new ethers.Interface(IMPORT_ABI).parseTransaction({data:result.transactions[0].data})
    assert.equal(parsed.args[1],BigInt(sourceType));assert.equal(parsed.args[3],1960n);assert.equal(parsed.args[4],owner)
    const quote=flat(fixtureData).find(read=>read.target===D.AGENT_SWAP&&read.method==='quoteBuy')
    assert.equal(quote.args[0],token);assert.equal(quote.args[1],BigInt(sourceType))
    assert.equal((await legacyTrade(snapshot,{...buy,side:'sell'},state)).action,'approve-agent-wrapper')
    fixtureData.s.allowance=1000n
    const sold=await legacyTrade(snapshot,{...buy,side:'sell'},state)
    assert.equal(new ethers.Interface(IMPORT_ABI).parseTransaction({data:sold.transactions[0].data}).args[3],101n)
    await assert.rejects(legacyTrade(snapshot,buy,{...state,metadata:{...state.metadata,dexVersion:99}}),/UNKNOWN_IMPORT_DEX/)
  }
})

test('IPShare buys obtain an after-fee quote via Multicall and enforce a positive amount-specific minimum', async () => {
  const fixtureData=fixture(),snapshot=await fixtureData.open()
  const quote=await ipshareQuote(snapshot,{subject:token,side:'buy',value:'100',slippageBps:100})
  assert.equal(quote.quote.minimumOut,1980n)
  const amountCall=flat(fixtureData).find(read=>read.target===D.IPSHARE&&read.method==='getBuyAmountByValue')
  assert.deepEqual([...amountCall.args],[100000n,95n])
  const result=await ipshare(snapshot,{from:owner,subject:token,action:'buy',value:'100'},true)
  assert.equal(new ethers.Interface(IPSHARE_ABI).parseTransaction({data:result.transactions[0].data}).args[2],1960n)
  await assert.rejects(ipshare(snapshot,{from:owner,subject:token,action:'buy',value:'100',minimumOut:'2001'},true),/MINIMUM_ABOVE_QUOTE/)
  assert.equal((await ipshare(snapshot,{subject:token})).subject,token)
})

test('Agent trade origin handle is checked through fixed-block Multicall for all market types',async()=>{
 const f=fixture(),snapshot=await f.open()
 assert.equal((await agentTradeIdentity(snapshot,{from:owner})).handle,'agent.ai')
 const request=flat(f).find(c=>c.target===D.HANDLE_REGISTRY&&c.method==='handleOf')
 assert.deepEqual([...request.args],[owner])
 f.s.handle=''
 await assert.rejects(agentTradeIdentity(await f.open(),{from:owner}),/BINANCE_HANDLE_REQUIRED/)
})

test('Pump18 internal and all external routes enforce automatic IPShare fee readiness without spending trade principal',async()=>{
 for(const options of [{version:18},{version:18,listed:true},{version:14,listed:true}]){
  const f=fixture({...options,shareCreated:false,ipFee:0n})
  for(const side of ['buy','sell']){
   f.s.allowance=1000n
   const r=await trade(await f.open(),{...buy,side})
   assert.equal(r.automaticIPShare.subject,owner);assert.equal(r.automaticIPShare.autoCreate,true)
   assert.equal(r.transactions[0].value,side==='buy'?'101':'0')
   f.s.ipFee=1n
   await assert.rejects(trade(await f.open(),{...buy,side}),/IPSHARE_CREATION_FEE_REQUIRED/)
   f.s.ipFee=0n
  }
 }
})
test('external referral to a native Infinity Hook requires the wrapper-reviewed current code hash',async()=>{
 const f=fixture({version:18,listed:true}),input={...buy,sellsman:addr('f')}
 await assert.rejects(trade(await f.open(),input),/AGENT_REFERRAL_HOOK_NOT_ENABLED/)
 f.s.referralEnabled=true
 const r=await trade(await f.open(),input)
 assert.equal(r.ipshareSubject.toLowerCase(),addr('f'))
 assert.equal(new ethers.Interface(AGENT_SWAP_ABI).parseTransaction({data:r.transactions[0].data}).args[6].toLowerCase(),addr('f'))
 f.s.wrapperPaused=true;await assert.rejects(trade(await f.open(),input),/AGENT_WRAPPER_PAUSED/)
})
test('V18 creation receipt preserves selected configuration and both raw overloads',async()=>{
 const f=fixture({version:18}),iface=new ethers.Interface(PUMP14_ABI),hash='0x'+'cd'.repeat(32),expected=predict(owner,salt18,18)
 const event=iface.encodeEventLog(iface.getEvent('NewToken'),['EXAMPLE',expected,owner])
 f.provider.getTransactionReceipt=async()=>({status:1,to:D.PROFILES[18].pump,blockNumber:123,blockHash:ethers.ZeroHash,logs:[{address:D.PROFILES[18].pump,...event}]})
 for(const withPool of [false,true]){
  const prepared=await create(await f.open(),{from:owner,tick:'EXAMPLE',salt:salt18,indexConfig:config,initialBuy:'0',tradeRewardRatio:withPool?2000:0})
  f.provider.getTransaction=async()=>({from:owner,to:D.PROFILES[18].pump,value:BigInt(prepared.transactions[0].value),data:prepared.transactions[0].data})
  const parsed=iface.parseTransaction({data:prepared.transactions[0].data})
  assert.equal(parsed.args.length,withPool?4:3);assert.deepEqual([...parsed.args[2].targetWeights],[5000n,5000n])
  assert.equal((await receipt(f.provider,hash)).token,expected)
 }
})
