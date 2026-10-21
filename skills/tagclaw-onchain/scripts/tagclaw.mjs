#!/usr/bin/env node
// Read-only: no wallet initialization, private-key access, signing, or transaction broadcast.
import fs from 'node:fs'
import { ethers } from 'ethers'
import { Snapshot } from './lib/snapshot.mjs'
import { trade, price, ipshare, nutbox, tokenInfo, tokenBalance } from './lib/prepare.mjs'
import { indexInfo, prepareIndex, miningPools } from './lib/index.mjs'
import { create, receipt } from './lib/creation.mjs'
import * as deployment from './lib/deployment.mjs'

const commands = ['deployments', 'price', 'token-info', 'token-balance', 'index-info', 'prepare-index', 'mining-pools', 'prepare-trade', 'prepare-create', 'ipshare-info', 'prepare-ipshare', 'pool-info', 'prepare-pool', 'receipt']
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
  const input = options['--input'] ? JSON.parse(fs.readFileSync(options['--input'] === '-' ? 0 : options['--input'], 'utf8')) : {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT_OBJECT')
  if (Object.keys(input).some(key => /private.?key|mnemonic|seed.?phrase|steem|clay|api.?key/i.test(key))) throw new Error('SIGNING_CREDENTIALS_NOT_ACCEPTED')
  let output
  if (command === 'deployments') output = deployment
  else {
    const rpc = options['--rpc-url'] || process.env.TAGCLAW_BNB_RPC || 'https://bsc-dataseed2.binance.org'
    const request = new ethers.FetchRequest(rpc); request.timeout = 20000
    const provider = new ethers.JsonRpcProvider(request)
    try {
      if (command === 'receipt') output = await receipt(provider, input.hash)
      else {
        const snapshot = await Snapshot.open(provider)
        switch (command) {
          case 'index-info': output = await indexInfo(snapshot, input); break
          case 'prepare-index': output = await prepareIndex(snapshot, input); break
          case 'mining-pools': output = await miningPools(snapshot, input); break
          case 'token-info': output = await tokenInfo(snapshot, input); break
          case 'token-balance': output = await tokenBalance(snapshot, input); break
          case 'price': output = await price(snapshot, input); break
          case 'prepare-trade': output = await trade(snapshot, input); break
          case 'prepare-create': output = await create(snapshot, input); break
          case 'ipshare-info': output = await ipshare(snapshot, input); break
          case 'prepare-ipshare': output = await ipshare(snapshot, input, true); break
          case 'pool-info': output = await nutbox(snapshot, input); break
          case 'prepare-pool': output = await nutbox(snapshot, input, true); break
        }
      }
    } finally { provider.destroy() }
  }
  if (options['--out']) fs.writeFileSync(options['--out'], json(output) + '\n', { mode: 0o600 })
  return output
}
try { process.stdout.write(json(await main()) + '\n') }
catch (error) { process.stderr.write((error.shortMessage || error.message) + '\n'); process.exitCode = 1 }
