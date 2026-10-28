#!/usr/bin/env node
// No wallet initialization, private-key access, signing, or chain broadcast. Note commands write public metadata.
import fs from 'node:fs'
import { ethers } from 'ethers'
import { Snapshot } from './lib/snapshot.mjs'
import { trade, price, ipshare, ipshareQuote, nutbox, tokenInfo, tokenBalance, tokenState, agentTradeIdentity } from './lib/prepare.mjs'
import { indexInfo, prepareIndex, miningPools } from './lib/index.mjs'
import { create, creationOptions, receipt } from './lib/creation.mjs'
import * as deployment from './lib/deployment.mjs'
import { PublicApi, API_RESOURCES, resolveToken } from './lib/api.mjs'
import { legacyState, legacyTrade, legacyPrice } from './lib/legacy.mjs'
import { walletPayload } from './lib/wallet-payload.mjs'
import { TradeNotesApi,attachNote,attachFollow,verifyPublishedNote } from './lib/trade-notes.mjs'

const commands = ['prepare-note','attach-note','submit-note','note-status','verify-note','capabilities', 'wallet-payload', 'api', 'resolve-token', 'token-search', 'creation-options', 'deployments', 'price', 'token-info', 'token-balance', 'index-info', 'prepare-index', 'mining-pools', 'prepare-trade', 'prepare-create', 'ipshare-info', 'ipshare-quote', 'prepare-ipshare', 'pool-info', 'prepare-pool', 'receipt']
const json = value => JSON.stringify(value, (_, value) => typeof value === 'bigint' ? String(value) : value)
async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help' || command === 'help') return { commands, usage: 'node scripts/tagclaw.mjs <command> --input request.json [--rpc-url HTTPS_URL] [--out plan.json]', units: 'BNB=wei; tokens=raw integers; slippage=integer bps; chain=BSC 56' }
  if (!commands.includes(command)) throw new Error('UNKNOWN_COMMAND')
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--rpc-url', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('INVALID_ARGUMENT: use --input, --rpc-url, --out; signing keys are not accepted')
    options[args[i]] = args[i + 1]
  }
  let input = options['--input'] ? JSON.parse(fs.readFileSync(options['--input'] === '-' ? 0 : options['--input'], 'utf8')) : {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT_OBJECT')
  if (Object.keys(input).some(key => /private.?key|mnemonic|seed.?phrase|steem|clay|api.?key/i.test(key))) throw new Error('SIGNING_CREDENTIALS_NOT_ACCEPTED')
  let output
  const api = new PublicApi()
  const notes = new TradeNotesApi()
  if (command === 'capabilities') output = { title: 'TagClaw-For-AgentWallet', chainId: 56, walletIncluded: false, signsTransactions: false, broadcastsTransactions: false, registrationRequired: false, publicTradeNotes: true, createVersions: [16], nativeTokenVersions: [...Object.keys(deployment.LEGACY_PUMPS), ...Object.keys(deployment.PROFILES)].map(Number), importDexVersions: [2, 3, 4], commands, publicResources: Object.keys(API_RESOURCES), limitations: ['Legacy v5 buys and v8 curve trades require protocol eligibility signatures', 'Handle-gated curve buys require a Binance Wallet handle', 'Unknown Nutbox factories require an explicit adapter; never infer calldata', 'No social account registration or prediction markets'] }
  else if (command === 'prepare-note') output = await notes.prepare(input)
  else if (command === 'attach-note') output = attachNote(input)
  else if (command === 'submit-note') output = await notes.submit(input)
  else if (command === 'wallet-payload') output = walletPayload(input)
  else if (command === 'deployments') output = deployment
  else if (['api', 'token-search'].includes(command)) output = await api.get(command === 'api' ? input.resource : command, input)
  else if (command === 'resolve-token' && !ethers.isAddress(input.tick ?? input.token ?? input.query)) output = await resolveToken(input, api)
  else {
    const rpc = options['--rpc-url'] || process.env.TAGCLAW_BNB_RPC || 'https://bsc-dataseed2.binance.org'
    const request = new ethers.FetchRequest(rpc); request.timeout = 20000
    const provider = new ethers.JsonRpcProvider(request)
    try {
      if (command === 'note-status') {
        output=await notes.status(input)
        if(output.status==='accepted')output.verificationCheck=await verifyPublishedNote(provider,output)
      }
      else if (command === 'verify-note') output=await verifyPublishedNote(provider,input)
      else if (command === 'receipt') output = await receipt(provider, input.hash)
      else {
        const snapshot = await Snapshot.open(provider)
        if (command === 'resolve-token') output = await resolveToken(input, api, snapshot)
        else {
        if(command==='prepare-trade')await agentTradeIdentity(snapshot,input)
        let legacy
        const tokenCommands = ['token-info', 'price', 'prepare-trade', 'token-balance', 'mining-pools', 'index-info', 'prepare-index']
        if (tokenCommands.includes(command)) {
          if (!ethers.isAddress(input.token)) {
            const resolved = await resolveToken(input, api, snapshot)
            input = { ...input, token: resolved.data.token }
          }
          if (['token-info', 'price', 'prepare-trade', 'mining-pools'].includes(command)) {
            try { await tokenState(snapshot, input.token) }
            catch (error) {
              if (!error.message.startsWith('UNSUPPORTED_TOKEN_DEPLOYMENT')) throw error
              const resolved = await resolveToken({ ...input, tick: undefined }, api, snapshot)
              legacy = await legacyState(snapshot, resolved.data)
            }
          }
        }
        let follow
        if(command==='prepare-trade'&&(input.followTxHash||input.followAgentId)){
          if(input.side!=='buy')throw new Error('FOLLOW_REQUIRES_BUY')
          follow=await notes.follow(input)
          if(input.sellsman&&input.sellsman.toLowerCase()!==follow.ipshareSubject.toLowerCase())throw new Error('FOLLOW_REFERRAL_CONFLICT')
          input={...input,sellsman:follow.ipshareSubject}
        }
        if (legacy && command === 'token-info') { const { metadata, ...state } = legacy; output = state }
        else if (legacy && command === 'price') output = await legacyPrice(snapshot, input, legacy)
        else if (legacy && command === 'prepare-trade') output = await legacyTrade(snapshot, input, legacy)
        else if (legacy && command === 'mining-pools') output = await api.get('nutbox-by-token', input)
        else switch (command) {
          case 'creation-options': output = await creationOptions(snapshot, input); break
          case 'index-info': output = await indexInfo(snapshot, input); break
          case 'prepare-index': output = await prepareIndex(snapshot, input); break
          case 'mining-pools': output = await miningPools(snapshot, input); break
          case 'token-info': output = await tokenInfo(snapshot, input); break
          case 'token-balance': output = await tokenBalance(snapshot, input); break
          case 'price': output = await price(snapshot, input); break
          case 'prepare-trade': output = await trade(snapshot, input); break
          case 'prepare-create': output = await create(snapshot, input); break
          case 'ipshare-info': output = await ipshare(snapshot, input); break
          case 'ipshare-quote': output = await ipshareQuote(snapshot, input); break
          case 'prepare-ipshare': output = await ipshare(snapshot, input, true); break
          case 'pool-info': output = await nutbox(snapshot, input); break
          case 'prepare-pool': output = await nutbox(snapshot, input, true); break
        }
        if(follow){
          if(!output.rebuildAfterConfirmation)follow=await notes.followIntent(input,follow)
          output=attachFollow(output,follow)
        }
        }
      }
    } finally { provider.destroy() }
  }
  if (options['--out']) fs.writeFileSync(options['--out'], json(output) + '\n', { mode: 0o600 })
  return output
}
try { process.stdout.write(json(await main()) + '\n') }
catch (error) { process.stderr.write((error.shortMessage || error.message) + '\n'); process.exitCode = 1 }
