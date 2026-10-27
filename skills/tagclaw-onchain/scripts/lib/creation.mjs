import { ethers } from 'ethers'
import fs from 'node:fs'
import * as D from './deployment.mjs'
import { call } from './snapshot.mjs'
import { PUMP14_ABI, CREATE_V14, CREATE_V14_WITH_POOLS } from './v14-abi.mjs'
import { PERMISSIONS_ABI } from './index-abi.mjs'
import { IPSHARE_ABI } from './ipshare-abi.mjs'
import { NUTBOX_COMMITTEE_ABI } from './nutbox-abi.mjs'
import { address, uint, same, coder, plan, nativeBalance } from './prepare.mjs'

function protocolReadiness(pump, operator, forwarder) {
  const missingPermissions = []
  if (!operator) missingPermissions.push('nutboxOperator')
  if (!forwarder) missingPermissions.push('basketForwarder')
  return {
    code: missingPermissions.length ? 'PROTOCOL_ACTIVATION_PENDING' : 'READY',
    subject: pump,
    responsibleParty: missingPermissions.length ? 'protocol-owner' : null,
    missingPermissions,
    message: missingPermissions.length
      ? 'Token issuance is temporarily unavailable: the protocol issuance factory needs activation by the protocol contract owners. These permissions belong to the factory, not the user wallet; users do not need wallet allowlisting.'
      : 'The protocol issuance factory is active.'
  }
}

export async function creationOptions(snapshot, input, candidates = JSON.parse(fs.readFileSync(new URL('./constituents.json', import.meta.url), 'utf8'))) {
  const from = address(input.from, 'from'), profile = D.PROFILES[16]
  const [version, implementation, pumpFee, ipshare, committee, operator, forwarder, ...approved] = await snapshot.read([
    call(profile.pump, PUMP14_ABI, 'VERSION'), call(profile.pump, PUMP14_ABI, 'tokenImplementation'),
    call(profile.pump, PUMP14_ABI, 'createFee'), call(profile.pump, PUMP14_ABI, 'getIPShare'), call(profile.pump, PUMP14_ABI, 'nutboxCommittee'),
    call(D.NUTBOX_ROUTER, PERMISSIONS_ABI, 'operators', [profile.pump]), call(D.BASKET_REGISTRY, PERMISSIONS_ABI, 'approvedCreatorForwarders', [profile.pump]),
    ...candidates.map(asset => call(profile.pump, PUMP14_ABI, 'approvedConstituent', [address(asset.address, 'constituent')]))
  ])
  if (version !== 16n || !same(implementation, profile.implementation)) throw new Error('V16_DEPLOYMENT_MISMATCH')
  const [hasShare, ipFee, communityFee, settingsFee, tradePool, verified] = await snapshot.read([
    call(ipshare, IPSHARE_ABI, 'ipshareCreated', [from]), call(ipshare, IPSHARE_ABI, 'createFee'),
    call(committee, NUTBOX_COMMITTEE_ABI, 'getCreateCommunityFee'), call(committee, NUTBOX_COMMITTEE_ABI, 'getCommunitySettingsFee'),
    call(profile.pump, PUMP14_ABI, 'optionalPoolFactories', [D.TRADE_FACTORY]), call(committee, NUTBOX_COMMITTEE_ABI, 'verifyContract', [D.TRADE_FACTORY])
  ])
  return { ...snapshot.metadata(), version: 16, binanceWalletOnly: true, from, pump: profile.pump, tokenImplementation: implementation,
    ready: Boolean(operator && forwarder),
    permissions: { scope: 'protocol-contract', subject: profile.pump, requiresUserWalletAllowlisting: false, nutboxOperator: operator, basketForwarder: forwarder },
    readiness: protocolReadiness(profile.pump, operator, forwarder),
    assets: candidates.filter((_, position) => approved[position]), assetSource: 'bundled governance candidates filtered by current on-chain approval; refresh skill for newly added candidates',
    pumpFee, ipshareFee: hasShare ? 0n : ipFee, communityFee, settingsFee,
    tradePool: { factory: D.TRADE_FACTORY, enabled: Boolean(tradePool[2] && verified), maxRewardRatio: Math.min(8000, Number(tradePool[1])) } }
}

export function indexConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('INDEX_CONFIG_REQUIRED')
  const { name, symbol, constituentAssets: assets, targetWeights: weights, basketFeeBps, creatorShareBps, retainCommunityOwnership } = config
  if (typeof name !== 'string' || !name.trim() || Buffer.byteLength(name) > 64 || typeof symbol !== 'string' || !symbol.trim() || Buffer.byteLength(symbol) > 16) throw new Error('INVALID_INDEX_NAME_SYMBOL')
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > 4 || new Set(assets.map(a => String(a).toLowerCase())).size !== assets.length) throw new Error('INVALID_INDEX_ASSETS')
  assets.forEach(a => address(a, 'constituent'))
  if (!Array.isArray(weights) || weights.length !== assets.length || weights.some(w => !Number.isInteger(w) || w <= 0) || weights.reduce((a, b) => a + b, 0) !== 10000) throw new Error('INVALID_INDEX_WEIGHTS')
  if (!Number.isInteger(basketFeeBps) || basketFeeBps < 100 || basketFeeBps > 300 || !Number.isInteger(creatorShareBps) || creatorShareBps < 0 || creatorShareBps > 3000 || typeof retainCommunityOwnership !== 'boolean') throw new Error('INVALID_INDEX_FEES_OWNERSHIP')
  return { name, symbol, constituentAssets: assets, targetWeights: weights, basketFeeBps, creatorShareBps, retainCommunityOwnership }
}
export function predict(creator, salt, version = 16) {
  const profile=D.PROFILES[version]; if(!profile) throw new Error('UNSUPPORTED_CREATE_VERSION')
  const codeHash=ethers.keccak256(`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${profile.implementation.slice(2)}5af43d82803e903d91602b57fd5bf3`)
  return ethers.getCreate2Address(profile.pump, ethers.keccak256(coder.encode(['address', 'bytes32'], [creator, salt])), codeHash)
}
async function saltFor(snapshot, from, supplied, profile) {
  if (supplied !== undefined && !ethers.isHexString(supplied, 32)) throw new Error('INVALID_SALT: require bytes32')
  let counter = BigInt(ethers.hexlify(ethers.randomBytes(16)))
  for (let attempt = 0; attempt < (supplied === undefined ? 500000 : 1); attempt++) {
    const salt = supplied ?? ethers.toBeHex(counter++, 32), token = predict(from, salt, profile.version)
    if (token.toLowerCase().endsWith('3333')) {
      const [used] = await snapshot.read([call(profile.pump, PUMP14_ABI, 'createdTokens', [token])])
      if (!used && await snapshot.provider.getCode(token, snapshot.block.number) === '0x') return { salt, token }
    }
    if (attempt % 1000 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('NO_VALID_SALT: need an unused predicted address ending in 3333')
}

export async function create(snapshot, input) {
  const from = address(input.from, 'from'), config = indexConfig(input.indexConfig)
  if (input.version !== undefined && input.version !== 16) throw new Error('UNSUPPORTED_CREATE_VERSION: use the supported creation helper without overriding its deployment profile')
  const profile = D.PROFILES[16]
  if(input.binanceWalletOnly!==undefined&&input.binanceWalletOnly!==true)throw new Error('CREATION_MODE_MISMATCH')
  const tick = input.tick
  if (typeof tick !== 'string' || Buffer.byteLength(tick)>16 || !/^(?!\d+$)[A-Za-z0-9\u4e00-\u9fa5_]{1,16}$/.test(tick) || ['tiptag', 'tagai', 'tagaidao', 'deploy'].includes(tick.toLowerCase())) throw new Error('INVALID_TICK')
  const initial = uint(input.initialBuy ?? '0', 'initialBuy', true), ratio = input.tradeRewardRatio ?? 0
  if (!Number.isInteger(ratio) || ratio < 0 || ratio > 8000) throw new Error('INVALID_TRADE_REWARD_RATIO')
  const [version, implementation, used, pumpFee, ipshare, committee, ...approved] = await snapshot.read([
    call(profile.pump, PUMP14_ABI, 'VERSION'), call(profile.pump, PUMP14_ABI, 'tokenImplementation'), call(profile.pump, PUMP14_ABI, 'createdTicks', [tick]),
    call(profile.pump, PUMP14_ABI, 'createFee'), call(profile.pump, PUMP14_ABI, 'getIPShare'), call(profile.pump, PUMP14_ABI, 'nutboxCommittee'),
    ...config.constituentAssets.map(asset => call(profile.pump, PUMP14_ABI, 'approvedConstituent', [asset]))
  ])
  if (version !== BigInt(profile.version) || !same(implementation, profile.implementation)) throw new Error('V16_DEPLOYMENT_MISMATCH')
  if (profile.version===16) {
    const [operator,forwarder]=await snapshot.read([call(D.NUTBOX_ROUTER,PERMISSIONS_ABI,'operators',[profile.pump]),call(D.BASKET_REGISTRY,PERMISSIONS_ABI,'approvedCreatorForwarders',[profile.pump])])
    if (!operator || !forwarder) {
      const readiness = protocolReadiness(profile.pump, operator, forwarder)
      throw new Error(`PROTOCOL_CREATION_NOT_READY: ${readiness.message} Factory: ${profile.pump}. Missing: ${readiness.missingPermissions.join(', ')}.`)
    }
  }
  if (used) throw new Error('TICK_ALREADY_CREATED')
  if (approved.some(ok => !ok)) throw new Error('UNAPPROVED_CONSTITUENT')
  const [hasShare, ipFee, communityFee, settingsFee, bnb, ...optional] = await snapshot.read([
    call(ipshare, IPSHARE_ABI, 'ipshareCreated', [from]), call(ipshare, IPSHARE_ABI, 'createFee'),
    call(committee, NUTBOX_COMMITTEE_ABI, 'getCreateCommunityFee'), call(committee, NUTBOX_COMMITTEE_ABI, 'getCommunitySettingsFee'), nativeBalance(from),
    ...(ratio ? [call(profile.pump, PUMP14_ABI, 'optionalPoolFactories', [D.TRADE_FACTORY]), call(committee, NUTBOX_COMMITTEE_ABI, 'verifyContract', [D.TRADE_FACTORY])] : [])
  ])
  if (ratio && (!optional[0][2] || !optional[1] || BigInt(ratio) > optional[0][1])) throw new Error('TRADE_POOL_UNAVAILABLE')
  const optionalPools = ratio ? [{ factory: D.TRADE_FACTORY, rewardRatio: ratio, meta: '0x' }] : []
  const settingsCount = config.constituentAssets.length + optionalPools.length
  const totalFee = pumpFee + (hasShare ? 0n : ipFee) + communityFee + settingsFee * BigInt(settingsCount), value = totalFee + initial
  if (bnb < value + ethers.parseEther('0.001')) throw new Error('INSUFFICIENT_CREATE_BALANCE: keep 0.001 BNB plus wallet-estimated gas')
  const { salt, token } = await saltFor(snapshot, from, input.salt, profile)
  return plan(snapshot, from, `v${profile.version}-create`, profile.pump, PUMP14_ABI, optionalPools.length ? CREATE_V14_WITH_POOLS : CREATE_V14,
    [tick, salt, config, ...(optionalPools.length ? [optionalPools] : [])], value,
    { version:profile.version, binanceWalletOnly:true, tick, salt, predictedToken: token, indexConfig: config, optionalPools, settingsCount,
      fees: { pumpFee, ipshareFee: hasShare ? 0n : ipFee, communityFee, settingsFee, totalFee, initialBuy: initial },
      gasCheck: 'Wallet preview must estimate gas and verify at least 0.001 BNB remains after value and gas.', rebuildAfterConfirmation: false })
}

export async function receipt(provider, hash) {
  if (!ethers.isHexString(hash, 32)) throw new Error('INVALID_TRANSACTION_HASH')
  if ((await provider.getNetwork()).chainId !== BigInt(D.CHAIN_ID)) throw new Error('WRONG_CHAIN')
  const r = await provider.getTransactionReceipt(hash)
  if (!r) return { chainId: D.CHAIN_ID, hash, status: 'PENDING_OR_UNKNOWN', retryBroadcast: false }
  if (Number(r.status) !== 1) return { chainId: D.CHAIN_ID, hash, status: 'REVERTED', blockNumber: r.blockNumber, retryBroadcast: false }
  const result = { chainId: D.CHAIN_ID, hash, status: 'CONFIRMED', blockNumber: r.blockNumber, blockHash: r.blockHash }
  const profile=Object.values(D.PROFILES).find(p=>same(r.to,p.pump))
  if (!profile) return result
  const tx = await provider.getTransaction(hash), iface = new ethers.Interface(PUMP14_ABI)
  if (!tx || !same(tx.to, profile.pump)) throw new Error('CREATION_TRANSACTION_UNAVAILABLE')
  const parsedTx = iface.parseTransaction({ data: tx.data, value: tx.value })
  if (parsedTx?.name !== 'createToken') return result
  const expected = predict(tx.from, parsedTx.args[1], profile.version)
  const events = r.logs.filter(log => same(log.address, profile.pump)).flatMap(log => {
    try { const event = iface.parseLog(log); return event ? [event] : [] } catch { return [] }
  })
  const created = events.find(event => event.name === 'NewToken' && same(event.args.creator, tx.from) && same(event.args.token, expected) && event.args.tick === parsedTx.args[0])
  if (!created) throw new Error(`CREATION_RECEIPT_MISMATCH: preserve hash ${hash}, do not recreate`)
  const linked = events.filter(event => same(event.args.token, expected))
  return { ...result, version: profile.version, binanceWalletOnly:profile.version>=15, creator: tx.from, token: expected, tick: created.args.tick, createHash: hash,
    nutboxCommunity: linked.find(event => event.name === 'NutboxLinked')?.args.community ?? null,
    stakingPools: linked.filter(event => event.name === 'NutboxStakingPoolLinked').map(event => ({ pool: event.args.pool, lpToken: event.args.lpToken, rewardRatio: event.args.rewardRatio })),
    optionalPools: linked.filter(event => event.name === 'NutboxOptionalPoolLinked').map(event => ({ pool: event.args.pool, factory: event.args.factory, rewardRatio: event.args.rewardRatio })) }
}
