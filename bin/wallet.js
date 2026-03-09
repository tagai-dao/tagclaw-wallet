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
 *   node bin/wallet.js ipshare-supply --subject 0x...
 *   node bin/wallet.js ipshare-buy --private-key 0x... --subject 0x... --value 1000000000000000
 *   node bin/wallet.js ipshare-claim --private-key 0x... --subject 0x...
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
  sellToken,
  getIpShareSupply,
  getIpShareBalance,
  getIpShareStakeInfo,
  getIpSharePendingRewards,
  createIpShare,
  buyIpShare,
  sellIpShare,
  stakeIpShare,
  unstakeIpShare,
  redeemIpShare,
  claimIpShareRewards,
  IPSHARE_CONTRACT
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
  let subject = ''
  let holder = ''
  let staker = ''
  let value = ''
  let amountOutMin = ''
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
    else if (args[i] === '--subject' && args[i + 1]) subject = args[++i]
    else if (args[i] === '--holder' && args[i + 1]) holder = args[++i]
    else if (args[i] === '--staker' && args[i + 1]) staker = args[++i]
    else if (args[i] === '--value' && args[i + 1]) value = args[++i]
    else if (args[i] === '--amount-out-min' && args[i + 1]) amountOutMin = args[++i]
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
    signature,
    subject,
    holder,
    staker,
    value,
    amountOutMin
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
    signature,
    subject,
    holder,
    staker,
    value,
    amountOutMin
  } = parseArgs()

  if (apiUrl) configure({ apiUrl })

  if (!cmd) {
    err('Usage: node bin/wallet.js <create-wallet|steem-keys|sign|balance-bnb|balance-erc20|transfer-bnb|transfer-erc20|buy-token|sell-token|ipshare-supply|ipshare-balance|ipshare-stake-info|ipshare-pending-rewards|ipshare-create|ipshare-buy|ipshare-sell|ipshare-stake|ipshare-unstake|ipshare-redeem|ipshare-claim> [options]')
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

    if (cmd === 'ipshare-supply') {
      if (!subject) err('ipshare-supply requires --subject 0x...')
      const result = await getIpShareSupply(subject, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'ipshare-balance') {
      if (!subject) err('ipshare-balance requires --subject 0x...')
      if (!holder) err('ipshare-balance requires --holder 0x...')
      const result = await getIpShareBalance(subject, holder, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'ipshare-stake-info') {
      if (!subject) err('ipshare-stake-info requires --subject 0x...')
      if (!staker) err('ipshare-stake-info requires --staker 0x...')
      const result = await getIpShareStakeInfo(subject, staker, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'ipshare-pending-rewards') {
      if (!subject) err('ipshare-pending-rewards requires --subject 0x...')
      if (!staker) err('ipshare-pending-rewards requires --staker 0x...')
      const result = await getIpSharePendingRewards(subject, staker, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'ipshare-create') {
      if (!privateKey) err('ipshare-create requires --private-key 0x...')
      const result = await createIpShare({
        privateKey,
        subject: subject || undefined,
        value: value || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-buy') {
      if (!privateKey) err('ipshare-buy requires --private-key 0x...')
      if (!subject) err('ipshare-buy requires --subject 0x...')
      if (!value) err('ipshare-buy requires --value <wei>')
      const result = await buyIpShare({
        privateKey,
        subject,
        value,
        amountOutMin: amountOutMin || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-sell') {
      if (!privateKey) err('ipshare-sell requires --private-key 0x...')
      if (!subject) err('ipshare-sell requires --subject 0x...')
      if (!amount) err('ipshare-sell requires --amount <raw uint256>')
      const result = await sellIpShare({
        privateKey,
        subject,
        amount,
        amountOutMin: amountOutMin || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-stake') {
      if (!privateKey) err('ipshare-stake requires --private-key 0x...')
      if (!subject) err('ipshare-stake requires --subject 0x...')
      if (!amount) err('ipshare-stake requires --amount <raw uint256>')
      const result = await stakeIpShare({
        privateKey,
        subject,
        amount,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-unstake') {
      if (!privateKey) err('ipshare-unstake requires --private-key 0x...')
      if (!subject) err('ipshare-unstake requires --subject 0x...')
      if (!amount) err('ipshare-unstake requires --amount <raw uint256>')
      const result = await unstakeIpShare({
        privateKey,
        subject,
        amount,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-redeem') {
      if (!privateKey) err('ipshare-redeem requires --private-key 0x...')
      if (!subject) err('ipshare-redeem requires --subject 0x...')
      const result = await redeemIpShare({
        privateKey,
        subject,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-claim') {
      if (!privateKey) err('ipshare-claim requires --private-key 0x...')
      if (!subject) err('ipshare-claim requires --subject 0x...')
      const result = await claimIpShareRewards({
        privateKey,
        subject,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    err('Unknown command: ' + cmd + '. Use create-wallet | steem-keys | sign | balance-bnb | balance-erc20 | transfer-bnb | transfer-erc20 | buy-token | sell-token | ipshare-supply | ipshare-balance | ipshare-stake-info | ipshare-pending-rewards | ipshare-create | ipshare-buy | ipshare-sell | ipshare-stake | ipshare-unstake | ipshare-redeem | ipshare-claim (IPShare contract: ' + IPSHARE_CONTRACT + ')')
  } catch (e) {
    err(e.message || String(e))
  }
}

main()
