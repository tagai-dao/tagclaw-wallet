#!/usr/bin/env node
/**
 * tagclaw-wallet CLI — 纯钱包能力，仅输出 JSON 供 agent 解析并执行后续动作
 *
 * 用法:
 *   node bin/wallet.js create-wallet
 *   node bin/wallet.js steem-keys --private-key 0x...
 *   node bin/wallet.js sign --private-key 0x... --message "要签名的内容"
 *   node bin/wallet.js balance-bnb --address 0x...
 *   node bin/wallet.js balance-erc20 --address 0x... --token 0x...
 *   node bin/wallet.js transfer-bnb --private-key 0x... --to 0x... --amount 0.01
 *   node bin/wallet.js transfer-erc20 --private-key 0x... --token 0x... --to 0x... --amount 100
 *
 * 所有成功结果仅输出一行 JSON 到 stdout，错误输出到 stderr 并 exit 1。
 */
const { createWallet, generateSteemKeys, signMessage, getBnbBalance, getErc20Balance, transferBnb, transferErc20 } = require('../index.js')

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
  let rpcUrl = ''
  let to = ''
  let amount = ''
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--private-key' && args[i + 1]) privateKey = args[++i]
    else if (args[i] === '--message') { i++; message = args[i] !== undefined ? args[i] : '' }
    else if (args[i] === '--address' && args[i + 1]) address = args[++i]
    else if (args[i] === '--token' && args[i + 1]) token = args[++i]
    else if (args[i] === '--rpc-url' && args[i + 1]) rpcUrl = args[++i]
    else if (args[i] === '--to' && args[i + 1]) to = args[++i]
    else if (args[i] === '--amount' && args[i + 1]) amount = args[++i]
  }
  return { cmd, privateKey, message, address, token, rpcUrl, to, amount }
}

async function main() {
  const { cmd, privateKey, message, address, token, rpcUrl, to, amount } = parseArgs()

  if (!cmd) {
    err('Usage: node bin/wallet.js <create-wallet|steem-keys|sign|balance-bnb|balance-erc20|transfer-bnb|transfer-erc20> [options]')
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

    err('Unknown command: ' + cmd + '. Use create-wallet | steem-keys | sign | balance-bnb | balance-erc20 | transfer-bnb | transfer-erc20')
  } catch (e) {
    err(e.message || String(e))
  }
}

main()
