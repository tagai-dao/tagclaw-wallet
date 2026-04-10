#!/usr/bin/env node
/**
 * tagclaw-wallet CLI — wallet-only capabilities with JSON output for agent parsing
 *
 * Usage:
 *   # Claw 沙箱：按 README 从 Claw-Wallet-Skill 下载脚本后 bash install.sh（在 tagclaw-wallet 目录）
 *   node bin/wallet.js claw-address
 *   node bin/wallet.js bind-wallet --message-hex <64-hex-from-bind-page>
 *   node bin/wallet.js sync-env   # Claw 地址 + Steem 密钥写入同级 .env
 *   node bin/wallet.js steem-keys   # 默认 Claw 签名派生；可选 --private-key 走 legacy
 *   node bin/wallet.js sign --message "..."   # 默认 Claw；可选 --private-key
 *   node bin/wallet.js balance-bnb --address 0x...
 *   node bin/wallet.js balance-erc20 --address 0x... --token 0x...
 *   node bin/wallet.js transfer-bnb --private-key 0x... --to 0x... --amount 0.01
 *   node bin/wallet.js transfer-erc20 --private-key 0x... --token 0x... --to 0x... --amount 100
 *   node bin/wallet.js buy-token --private-key 0x... --tick MyToken --eth-amount 1000000000000000
 *   node bin/wallet.js sell-token --private-key 0x... --tick MyToken --amount 1000000000000000000
 *   node bin/wallet.js create-community --tick MyToken --quote-only
 *   node bin/wallet.js price-token --tick TagClaw
 *   node bin/wallet.js nutbox-community --ctoken 0x...
 *   node bin/wallet.js nutbox-pool --pool 0x...
 *   node bin/wallet.js ipshare-supply --subject 0x...
 *   node bin/wallet.js ipshare-buy --private-key 0x... --subject 0x... --value 1000000000000000
 *   node bin/wallet.js ipshare-claim --private-key 0x... --subject 0x...
 *
 * On success, outputs exactly one JSON line to stdout; errors go to stderr and exit with code 1.
 */
const {
  generateSteemKeys,
  generateSteemKeysFromClaw,
  signMessage,
  getClawWalletAddress,
  bindClawWallet,
  syncTagclawWalletEnv,
  getBnbBalance,
  getErc20Balance,
  getTokenPrice,
  transferBnb,
  transferErc20,
  buyToken,
  sellToken,
  createCommunity,
  getNutboxCommunity,
  getNutboxPool,
  getNutboxFactories,
  getNutboxCommitteeFees,
  addNutboxErc20StakingPool,
  addNutboxErc20LockingPool,
  addNutboxErc1155Pool,
  setNutboxPoolRatios,
  claimNutboxRewards,
  depositNutboxErc20Pool,
  withdrawNutboxErc20Pool,
  redeemNutboxErc20Locking,
  depositNutboxErc1155Pool,
  withdrawNutboxErc1155Pool,
  harvestNutboxSocialPool,
  claimNutboxSocialPool,
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
  let bindMessageHash = ''
  let tagclawApiKey = ''
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
  let chain = ''
  let community = ''
  let ctoken = ''
  let committee = ''
  let pool = ''
  let name = ''
  let stakeToken = ''
  let lockDuration = ''
  let tokenId = ''
  let pools = ''
  let ratios = ''
  let orderId = ''
  let deadline = ''
  let salt = ''
  let quoteOnly = false
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--private-key' && args[i + 1]) privateKey = args[++i]
    else if (args[i] === '--message') { i++; message = args[i] !== undefined ? args[i] : '' }
    else if (args[i] === '--address' && args[i + 1]) address = args[++i]
    else if (args[i] === '--token' && args[i + 1]) token = args[++i]
    else if (args[i] === '--tick' && args[i + 1]) tick = args[++i]
    else if (args[i] === '--rpc-url' && args[i + 1]) rpcUrl = args[++i]
    else if (args[i] === '--api-url' && args[i + 1]) apiUrl = args[++i]
    else if (args[i] === '--tagclaw-api-key' && args[i + 1]) tagclawApiKey = args[++i]
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
    else if (args[i] === '--chain' && args[i + 1]) chain = args[++i]
    else if (args[i] === '--community' && args[i + 1]) community = args[++i]
    else if (args[i] === '--ctoken' && args[i + 1]) ctoken = args[++i]
    else if (args[i] === '--committee' && args[i + 1]) committee = args[++i]
    else if (args[i] === '--pool' && args[i + 1]) pool = args[++i]
    else if (args[i] === '--name' && args[i + 1]) name = args[++i]
    else if (args[i] === '--stake-token' && args[i + 1]) stakeToken = args[++i]
    else if (args[i] === '--lock-duration' && args[i + 1]) lockDuration = args[++i]
    else if (args[i] === '--token-id' && args[i + 1]) tokenId = args[++i]
    else if (args[i] === '--pools' && args[i + 1]) pools = args[++i]
    else if (args[i] === '--ratios' && args[i + 1]) ratios = args[++i]
    else if (args[i] === '--order-id' && args[i + 1]) orderId = args[++i]
    else if (args[i] === '--deadline' && args[i + 1]) deadline = args[++i]
    else if (args[i] === '--salt' && args[i + 1]) salt = args[++i]
    else if (args[i] === '--quote-only') quoteOnly = true
    else if (args[i] === '--message-hex') {
      i++
      bindMessageHash = args[i] !== undefined ? String(args[i]).trim() : ''
    }
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
    tagclawApiKey,
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
    amountOutMin,
    chain,
    community,
    ctoken,
    committee,
    pool,
    name,
    stakeToken,
    lockDuration,
    tokenId,
    pools,
    ratios,
    orderId,
    deadline,
    salt,
    quoteOnly,
    bindMessageHash
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
    tagclawApiKey,
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
    amountOutMin,
    chain,
    community,
    ctoken,
    committee,
    pool,
    name,
    stakeToken,
    lockDuration,
    tokenId,
    pools,
    ratios,
    orderId,
    deadline,
    salt,
    quoteOnly,
    bindMessageHash
  } = parseArgs()

  if (!cmd) {
    err(
      'Usage: node bin/wallet.js <claw-address|bind-wallet|sync-env|steem-keys|sign|balance-bnb|balance-erc20|price-token|transfer-bnb|transfer-erc20|buy-token|sell-token|create-community|nutbox-community|nutbox-pool|nutbox-factories|nutbox-committee-fees|nutbox-add-erc20-staking-pool|nutbox-add-erc20-locking-pool|nutbox-add-erc1155-pool|nutbox-set-pool-ratios|nutbox-claim-rewards|nutbox-deposit-erc20-staking|nutbox-withdraw-erc20-staking|nutbox-deposit-erc20-locking|nutbox-withdraw-erc20-locking|nutbox-redeem-erc20-locking|nutbox-deposit-erc1155|nutbox-withdraw-erc1155|nutbox-harvest-social-pool|nutbox-claim-social-pool|ipshare-supply|ipshare-balance|ipshare-stake-info|ipshare-pending-rewards|ipshare-create|ipshare-buy|ipshare-sell|ipshare-stake|ipshare-unstake|ipshare-redeem|ipshare-claim> [options]'
    )
  }

  try {
    if (cmd === 'claw-address') {
      const address = await getClawWalletAddress(chain || undefined)
      out(chain ? { address, chain } : { address })
      return
    }

    if (cmd === 'bind-wallet') {
      if (!bindMessageHash) {
        err(
          'bind-wallet requires --message-hex <64-hex>: paste the string from clawwallet.cc bind page, e.g. node bin/wallet.js bind-wallet --message-hex 41cde59663fe4d1755e60f0392434ac43dea609310ae5e8a9209ce41f268f67d'
        )
      }
      const result = await bindClawWallet(bindMessageHash)
      out(result)
      return
    }

    if (cmd === 'sync-env') {
      const result = await syncTagclawWalletEnv({ rpcUrl: rpcUrl || undefined })
      out({ ...result, envPath: result.envPath })
      return
    }

    if (cmd === 'steem-keys') {
      const result = privateKey
        ? generateSteemKeys(privateKey)
        : await generateSteemKeysFromClaw({ rpcUrl: rpcUrl || undefined })
      out(result)
      return
    }

    if (cmd === 'sign') {
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : ''
      const signature = await signMessage(pk, message || '')
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

    if (cmd === 'price-token') {
      if (!tick) err('price-token requires --tick <token-name>')
      const result = await getTokenPrice({
        tick,
        rpcUrl: rpcUrl || undefined,
        apiUrl: apiUrl || undefined,
        apiKey: tagclawApiKey || undefined
      })
      out(result)
      return
    }

    if (cmd === 'transfer-bnb') {
      if (!to) err('transfer-bnb requires --to 0x...')
      if (!amount) err('transfer-bnb requires --amount <ether or wei>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : ''
      const result = await transferBnb(pk, to, amount, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'transfer-erc20') {
      if (!token) err('transfer-erc20 requires --token 0x... (ERC20 contract address)')
      if (!to) err('transfer-erc20 requires --to 0x...')
      if (!amount) err('transfer-erc20 requires --amount <human amount>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : ''
      const result = await transferErc20(pk, token, to, amount, rpcUrl || undefined)
      out(result)
      return
    }

    if (cmd === 'buy-token') {
      if (!tick) err('buy-token requires --tick <token-name>')
      if (!ethAmount) err('buy-token requires --eth-amount <wei>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined

      const result = await buyToken({
        privateKey: pk,
        tick,
        ethAmount,
        sellsman: sellsman || undefined,
        slippage: slippage ? Number(slippage) : undefined,
        rpcUrl: rpcUrl || undefined,
        signature: signature || undefined,
        apiUrl: apiUrl || undefined,
        apiKey: tagclawApiKey || undefined
      })
      out(result)
      return
    }

    if (cmd === 'sell-token') {
      if (!tick) err('sell-token requires --tick <token-name>')
      if (!amount) err('sell-token requires --amount <raw uint256>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined

      const result = await sellToken({
        privateKey: pk,
        tick,
        amount,
        sellsman: sellsman || undefined,
        slippage: slippage ? Number(slippage) : undefined,
        rpcUrl: rpcUrl || undefined,
        apiUrl: apiUrl || undefined,
        apiKey: tagclawApiKey || undefined
      })
      out(result)
      return
    }

    if (cmd === 'create-community') {
      if (!tick) err('create-community requires --tick <token-name>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await createCommunity({
        privateKey: pk,
        tick,
        salt: salt || undefined,
        quoteOnly,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'nutbox-community') {
      if (!community && !ctoken) err('nutbox-community requires --community 0x... or --ctoken 0x...')
      const result = await getNutboxCommunity({
        community: community || undefined,
        ctoken: ctoken || undefined,
        address: address || undefined,
        rpcUrl: rpcUrl || undefined,
        apiUrl: apiUrl || undefined,
        apiKey: tagclawApiKey || undefined
      })
      out(result)
      return
    }

    if (cmd === 'nutbox-pool') {
      if (!pool) err('nutbox-pool requires --pool 0x...')
      const result = await getNutboxPool({
        pool,
        address: address || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'nutbox-factories') {
      out(await getNutboxFactories())
      return
    }

    if (cmd === 'nutbox-committee-fees') {
      if (!committee) err('nutbox-committee-fees requires --committee 0x...')
      out(await getNutboxCommitteeFees(committee, rpcUrl || undefined))
      return
    }

    if (cmd === 'nutbox-add-erc20-staking-pool') {
      if (!community) err('nutbox-add-erc20-staking-pool requires --community 0x...')
      if (!name) err('nutbox-add-erc20-staking-pool requires --name "Pool Name"')
      if (!stakeToken) err('nutbox-add-erc20-staking-pool requires --stake-token 0x...')
      if (!ratios) err('nutbox-add-erc20-staking-pool requires --ratios 7000,3000')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await addNutboxErc20StakingPool({
        privateKey: pk,
        community,
        name,
        stakeToken,
        ratios,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-add-erc20-locking-pool') {
      if (!community) err('nutbox-add-erc20-locking-pool requires --community 0x...')
      if (!name) err('nutbox-add-erc20-locking-pool requires --name "Pool Name"')
      if (!stakeToken) err('nutbox-add-erc20-locking-pool requires --stake-token 0x...')
      if (!lockDuration) err('nutbox-add-erc20-locking-pool requires --lock-duration <seconds>')
      if (!ratios) err('nutbox-add-erc20-locking-pool requires --ratios 7000,3000')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await addNutboxErc20LockingPool({
        privateKey: pk,
        community,
        name,
        stakeToken,
        lockDuration,
        ratios,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-add-erc1155-pool') {
      if (!community) err('nutbox-add-erc1155-pool requires --community 0x...')
      if (!name) err('nutbox-add-erc1155-pool requires --name "Pool Name"')
      if (!stakeToken) err('nutbox-add-erc1155-pool requires --stake-token 0x...')
      if (!tokenId) err('nutbox-add-erc1155-pool requires --token-id <id>')
      if (!ratios) err('nutbox-add-erc1155-pool requires --ratios 7000,3000')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await addNutboxErc1155Pool({
        privateKey: pk,
        community,
        name,
        stakeToken,
        tokenId,
        ratios,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-set-pool-ratios') {
      if (!community) err('nutbox-set-pool-ratios requires --community 0x...')
      if (!ratios) err('nutbox-set-pool-ratios requires --ratios 7000,3000')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await setNutboxPoolRatios({
        privateKey: pk,
        community,
        ratios,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-claim-rewards') {
      if (!community) err('nutbox-claim-rewards requires --community 0x...')
      if (!pools) err('nutbox-claim-rewards requires --pools 0xPOOL1,0xPOOL2')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await claimNutboxRewards({
        privateKey: pk,
        community,
        pools,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-deposit-erc20-staking' || cmd === 'nutbox-deposit-erc20-locking') {
      if (!pool) err(`${cmd} requires --pool 0x...`)
      if (!amount) err(`${cmd} requires --amount <raw uint256>`)
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await depositNutboxErc20Pool({
        privateKey: pk,
        pool,
        amount,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-withdraw-erc20-staking' || cmd === 'nutbox-withdraw-erc20-locking') {
      if (!pool) err(`${cmd} requires --pool 0x...`)
      if (!amount) err(`${cmd} requires --amount <raw uint256>`)
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await withdrawNutboxErc20Pool({
        privateKey: pk,
        pool,
        amount,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-redeem-erc20-locking') {
      if (!pool) err('nutbox-redeem-erc20-locking requires --pool 0x...')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await redeemNutboxErc20Locking({
        privateKey: pk,
        pool,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-deposit-erc1155') {
      if (!pool) err('nutbox-deposit-erc1155 requires --pool 0x...')
      if (!amount) err('nutbox-deposit-erc1155 requires --amount <raw uint256>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await depositNutboxErc1155Pool({
        privateKey: pk,
        pool,
        amount,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-withdraw-erc1155') {
      if (!pool) err('nutbox-withdraw-erc1155 requires --pool 0x...')
      if (!amount) err('nutbox-withdraw-erc1155 requires --amount <raw uint256>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await withdrawNutboxErc1155Pool({
        privateKey: pk,
        pool,
        amount,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-harvest-social-pool') {
      if (!pool) err('nutbox-harvest-social-pool requires --pool 0x...')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await harvestNutboxSocialPool({
        privateKey: pk,
        pool,
        rpcUrl: rpcUrl || undefined
      }))
      return
    }

    if (cmd === 'nutbox-claim-social-pool') {
      if (!pool) err('nutbox-claim-social-pool requires --pool 0x...')
      if (!orderId) err('nutbox-claim-social-pool requires --order-id <uint256>')
      if (!amount) err('nutbox-claim-social-pool requires --amount <raw uint256>')
      if (!deadline) err('nutbox-claim-social-pool requires --deadline <unix seconds>')
      if (!signature) err('nutbox-claim-social-pool requires --signature 0x...')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      out(await claimNutboxSocialPool({
        privateKey: pk,
        pool,
        orderId,
        amount,
        deadline,
        signature,
        rpcUrl: rpcUrl || undefined
      }))
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
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await createIpShare({
        privateKey: pk,
        subject: subject || undefined,
        value: value || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-buy') {
      if (!subject) err('ipshare-buy requires --subject 0x...')
      if (!value) err('ipshare-buy requires --value <wei>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await buyIpShare({
        privateKey: pk,
        subject,
        value,
        amountOutMin: amountOutMin || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-sell') {
      if (!subject) err('ipshare-sell requires --subject 0x...')
      if (!amount) err('ipshare-sell requires --amount <raw uint256>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await sellIpShare({
        privateKey: pk,
        subject,
        amount,
        amountOutMin: amountOutMin || undefined,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-stake') {
      if (!subject) err('ipshare-stake requires --subject 0x...')
      if (!amount) err('ipshare-stake requires --amount <raw uint256>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await stakeIpShare({
        privateKey: pk,
        subject,
        amount,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-unstake') {
      if (!subject) err('ipshare-unstake requires --subject 0x...')
      if (!amount) err('ipshare-unstake requires --amount <raw uint256>')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await unstakeIpShare({
        privateKey: pk,
        subject,
        amount,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-redeem') {
      if (!subject) err('ipshare-redeem requires --subject 0x...')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await redeemIpShare({
        privateKey: pk,
        subject,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    if (cmd === 'ipshare-claim') {
      if (!subject) err('ipshare-claim requires --subject 0x...')
      const pk = privateKey && privateKey.startsWith('0x') ? privateKey : undefined
      const result = await claimIpShareRewards({
        privateKey: pk,
        subject,
        rpcUrl: rpcUrl || undefined
      })
      out(result)
      return
    }

    err(
      'Unknown command: ' +
        cmd +
        '. Use claw-address | bind-wallet | steem-keys | sign | balance-bnb | balance-erc20 | price-token | transfer-bnb | transfer-erc20 | buy-token | sell-token | create-community | nutbox-community | nutbox-pool | nutbox-factories | nutbox-committee-fees | nutbox-add-erc20-staking-pool | nutbox-add-erc20-locking-pool | nutbox-add-erc1155-pool | nutbox-set-pool-ratios | nutbox-claim-rewards | nutbox-deposit-erc20-staking | nutbox-withdraw-erc20-staking | nutbox-deposit-erc20-locking | nutbox-withdraw-erc20-locking | nutbox-redeem-erc20-locking | nutbox-deposit-erc1155 | nutbox-withdraw-erc1155 | nutbox-harvest-social-pool | nutbox-claim-social-pool | ipshare-supply | ipshare-balance | ipshare-stake-info | ipshare-pending-rewards | ipshare-create | ipshare-buy | ipshare-sell | ipshare-stake | ipshare-unstake | ipshare-redeem | ipshare-claim (IPShare contract: ' +
        IPSHARE_CONTRACT +
        ')'
    )
  } catch (e) {
    err(e.message || String(e))
  }
}

main()
