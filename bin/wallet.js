#!/usr/bin/env node
/**
 * tagclaw-wallet CLI — wallet-only capabilities with JSON output for agent parsing
 *
 * Usage:
 *   node bin/wallet.js create-wallet
 *   node bin/wallet.js steem-keys --private-key 0x...
 *   node bin/wallet.js sign --private-key 0x... --message "message to sign"
 *   node bin/wallet.js balance-bnb --address 0x...
 *   node bin/wallet.js balance-erc20 --address 0x... --token 0x...
 *   node bin/wallet.js transfer-bnb --private-key 0x... --to 0x... --amount 0.01
 *   node bin/wallet.js transfer-erc20 --private-key 0x... --token 0x... --to 0x... --amount 100
 *   node bin/wallet.js buy-token --private-key 0x... --tick MyToken --eth-amount 1000000000000000
 *   node bin/wallet.js sell-token --private-key 0x... --tick MyToken --amount 1000000000000000000
 *
 * On success, outputs exactly one JSON line to stdout; errors go to stderr and exit with code 1.
 */
const {
  configure,
  createWallet,
  generateSteemKeys,
  signMessage,
  getBnbBalance,
  getErc20Balance,
  transferBnb,
  transferErc20,
  buyToken,
  sellToken
} = require('../index.js')

function out(json) {
  console.log(JSON.stringify(json))
}

function err(msg) {
  console.error(msg)
  process.exit(1)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const cmd = args[0]
  let privateKey = ''
  let message = ''
  let address = ''
  let token = ''
  let tick = ''
  let rpcUrl = ''
  let apiUrl = ''
  let to = ''
  let amount = ''
  let sellsman = ''
  let slippage = ''
  let ethAmount = ''
  let signature = ''
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--private-key' && args[i + 1]) privateKey = args[++i]
    else if (args[i] === '--message') { i++; message = args[i] !== undefined ? args[i] : '' }
    else if (args[i] === '--address' && args[i + 1]) address = args[++i]
    else if (args[i] === '--token' && args[i + 1]) token = args[++i]
    else if (args[i] === '--tick' && args[i + 1]) tick = args[++i]
    else if (args[i] === '--rpc-url' && args[i + 1]) rpcUrl = args[++i]
    else if (args[i] === '--api-url' && args[i + 1]) apiUrl = args[++i]
    else if (args[i] === '--to' && args[i + 1]) to = args[++i]
    else if (args[i] === '--amount' && args[i + 1]) amount = args[++i]
    else if (args[i] === '--sellsman' && args[i + 1]) sellsman = args[++i]
    else if (args[i] === '--slippage' && args[i + 1]) slippage = args[++i]
    else if (args[i] === '--eth-amount' && args[i + 1]) ethAmount = args[++i]
    else if (args[i] === '--signature' && args[i + 1]) signature = args[++i]
  }
  return {
    cmd,
    privateKey,
    message,
    address,
    token,
    tick,
    rpcUrl,
    apiUrl,
    to,
    amount,
    sellsman,
    slippage,
    ethAmount,
    signature
  }
}

async function main() {
  const {
    cmd,
    privateKey,
    message,
    address,
    token,
    tick,
    rpcUrl,
    apiUrl,
    to,
    amount,
    sellsman,
    slippage,
    ethAmount,
    signature
  } = parseArgs()

  if (apiUrl) configure({ apiUrl })

  if (!cmd) {
    err('Usage: node bin/wallet.js <create-wallet|steem-keys|sign|balance-bnb|balance-erc20|transfer-bnb|transfer-erc20|buy-token|sell-token> [options]')
  }

  try {
    if (cmd === 'create-wallet') {
      const result = createWallet()
      out(result)
      return
    }

    if (cmd === 'steem-keys') {
      if (!privateKey) err('steem-keys requires --private-key 0x...')
      const result = generateSteemKeys(privateKey)
      out(result)
      return
    }

    if (cmd === 'sign') {
      if (!privateKey) err('sign requires --private-key 0x...')
      const signature = await signMessage(privateKey, message || '')
      out({ signature })
      return
    }

    if (cmd === 'balance-bnb') {
      if (!address) err('balance-bnb requires --address 0x...')
      const result = await getBnbBalance(address, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'balance-erc20') {
      if (!address) err('balance-erc20 requires --address 0x...')
      if (!token) err('balance-erc20 requires --token 0x... (ERC20 contract address)')
      const result = await getErc20Balance(address, token, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'transfer-bnb') {
      if (!privateKey) err('transfer-bnb requires --private-key 0x...')
      if (!to) err('transfer-bnb requires --to 0x...')
      if (!amount) err('transfer-bnb requires --amount <ether or wei>')
      const result = await transferBnb(privateKey, to, amount, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'transfer-erc20') {
      if (!privateKey) err('transfer-erc20 requires --private-key 0x...')
      if (!token) err('transfer-erc20 requires --token 0x... (ERC20 contract address)')
      if (!to) err('transfer-erc20 requires --to 0x...')
      if (!amount) err('transfer-erc20 requires --amount <human amount>')
      const result = await transferErc20(privateKey, token, to, amount, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'buy-token') {
      if (!privateKey) err('buy-token requires --private-key 0x...')
      if (!tick) err('buy-token requires --tick <token-name>')
      if (!ethAmount) err('buy-token requires --eth-amount <wei>')

      const result = await buyToken({
        privateKey,
        tick,
        ethAmount,
        sellsman: sellsman || undefined,
        slippage: slippage ? Number(slippage) : undefined,
        rpcUrl: rpcUrl || undefined,
        signature: signature || undefined
      })
      out(result)
      return
    }

    if (cmd === 'sell-token') {
      if (!privateKey) err('sell-token requires --private-key 0x...')
      if (!tick) err('sell-token requires --tick <token-name>')
      if (!amount) err('sell-token requires --amount <raw uint256>')

      const result = await sellToken({
        privateKey,
        tick,
        amount,
        sellsman: sellsman || undefined,
        slippage: slippage ? Number(slippage) : undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    err('Unknown command: ' + cmd + '. Use create-wallet | steem-keys | sign | balance-bnb | balance-erc20 | transfer-bnb | transfer-erc20 | buy-token | sell-token')
  } catch (e) {
    err(e.message || String(e))
  }
}

main()
