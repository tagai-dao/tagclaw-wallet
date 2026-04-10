/**
 * Nutbox 社区 / 矿池全套操作：创建社区、添加矿池、质押、提取、领奖
 */
const { ethers } = require('ethers')
const {
  NUTBOX_COMMUNITY_ABI,
  NUTBOX_POOL_ABI,
  ERC20_STAKING_POOL_ABI,
  ERC20_LOCKING_POOL_ABI,
  ERC1155_STAKING_POOL_ABI,
  SOCIAL_CURATION_POOL_ABI,
  NUTBOX_COMMITTEE_ABI,
  PUMP_CREATE_ABI,
  IPSHARE_ABI,
  TOKEN_NUTBOX_ABI
} = require('./abi')
const {
  DEFAULT_BNB_RPC,
  PUMP_CONTRACTS,
  NUTBOX_FACTORIES,
  MIN_CREATE_BNB_REMAINING,
  ZERO_ADDRESS
} = require('./constants')
const { resolveRequestConfig, requestJson } = require('./config')
const { resolveWriteSigner } = require('./claw')
const {
  normalizeAddress,
  normalizeRequiredBigInt,
  throwWalletError,
  isBytes32Hex,
  toLowerAddress,
  detectNutboxPoolKind,
  readAddressArray,
  readOptionalContractValue,
  estimateGasReserve,
  serializeBigIntMap,
  ensureAllowance,
  ensureErc1155Approval
} = require('./helpers')

// ─── 内部辅助 ─────────────────────────────────────────

async function fetchNutboxCommunityByCToken(ctoken, requestConfig = {}) {
  const { apiKey } = resolveRequestConfig(requestConfig)
  if (!apiKey) {
    throwWalletError('MISSING_TAGCLAW_API_KEY', 'pass --tagclaw-api-key or export TAGCLAW_API_KEY before using --ctoken lookup')
  }
  return requestJson('/tagclaw/nutbox/community/by-ctoken', {
    query: { ctoken }
  }, requestConfig)
}

function resolveBytes32Salt(value) {
  if (!value) {
    throwWalletError('INVALID_SALT', 'salt is required')
  }
  if (!isBytes32Hex(value)) {
    throwWalletError('INVALID_SALT', 'salt must be a 0x-prefixed 32-byte hex value')
  }
  return value
}

function saltIndexToBytes32(index) {
  return ethers.toBeHex(BigInt(index), 32)
}

function normalizeRatioList(ratios) {
  const list = Array.isArray(ratios)
    ? ratios
    : String(ratios || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

  if (list.length === 0) {
    throwWalletError('INVALID_RATIOS', 'ratios are required')
  }

  const parsed = list.map((value) => {
    const ratio = Number(value)
    if (!Number.isInteger(ratio) || ratio < 0 || ratio > 10000) {
      throwWalletError('INVALID_RATIOS', `invalid ratio=${value}`)
    }
    return ratio
  })

  const sum = parsed.reduce((total, current) => total + current, 0)
  if (sum !== 10000) {
    throwWalletError('INVALID_RATIOS', `ratio sum must equal 10000, received=${sum}`)
  }

  return parsed
}

function normalizeCsvAddresses(value, fieldName) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (items.length === 0) {
    throwWalletError(`INVALID_${fieldName.toUpperCase()}`, `${fieldName} is required`)
  }

  return items.map((item) => normalizeAddress(item, fieldName))
}

async function resolveCommunityAndCommittee(poolOrCommunityAddress, provider) {
  const maybePool = new ethers.Contract(poolOrCommunityAddress, NUTBOX_POOL_ABI, provider)
  let community = poolOrCommunityAddress
  try {
    community = await maybePool.getCommunity()
  } catch {}
  const communityContract = new ethers.Contract(community, NUTBOX_COMMUNITY_ABI, provider)
  const committee = await communityContract.committee()
  return { community, committee, communityContract }
}

async function ensureCommunityOwner(community, signer) {
  const contract = new ethers.Contract(community, NUTBOX_COMMUNITY_ABI, signer.provider)
  const owner = await contract.owner()
  if (toLowerAddress(owner) !== toLowerAddress(signer.address)) {
    throwWalletError('NUTBOX_NOT_COMMUNITY_OWNER', `community owner=${owner}, signer=${signer.address}`)
  }
}

// ─── Committee 费用查询 ──────────────────────────────

async function getNutboxCommitteeFees(committee, rpcUrl = DEFAULT_BNB_RPC) {
  const committeeAddr = normalizeAddress(committee, 'committee')
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const contract = new ethers.Contract(committeeAddr, NUTBOX_COMMITTEE_ABI, provider)
  const [createCommunityFee, communitySettingsFee, poolOperationFee, feeRecipient] = await Promise.all([
    contract.getCreateCommunityFee(),
    contract.getCommunitySettingsFee(),
    contract.getPoolOperationFee(),
    contract.getFeeRecipient().catch(() => ZERO_ADDRESS)
  ])
  return {
    committee: committeeAddr,
    createCommunityFee: createCommunityFee.toString(),
    communitySettingsFee: communitySettingsFee.toString(),
    poolOperationFee: poolOperationFee.toString(),
    feeRecipient
  }
}

async function getNutboxFactories() {
  return {
    chainId: 56,
    factories: {
      erc20Staking: NUTBOX_FACTORIES.erc20Staking,
      erc20Locking: NUTBOX_FACTORIES.erc20Locking,
      erc1155Staking: NUTBOX_FACTORIES.erc1155Staking,
      socialCuration: NUTBOX_FACTORIES.socialCuration
    }
  }
}

// ─── 创建社区 ─────────────────────────────────────────

async function buildCreateCommunityQuote(params) {
  const {
    privateKey,
    tick,
    rpcUrl = DEFAULT_BNB_RPC,
    salt
  } = params

  if (!tick) {
    throwWalletError('INVALID_TICK', 'tick is required')
  }

  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = signer.provider
  const creator = signer.address
  const pumpAddress = PUMP_CONTRACTS[8]
  const pumpReader = new ethers.Contract(pumpAddress, PUMP_CREATE_ABI, provider)
  const explicitSalt = salt ? resolveBytes32Salt(salt) : null

  const [createFee, ipshareAddress, committeeAddress, lastSaltIndexRaw] = await Promise.all([
    pumpReader.createFee(),
    pumpReader.getIPShare(),
    pumpReader.nutboxCommittee(),
    pumpReader.getLastSaltIndex(creator)
  ])
  const lastSaltIndex = BigInt(lastSaltIndexRaw)
  const nextSaltIndex = lastSaltIndex + 1n
  const saltHex = explicitSalt || saltIndexToBytes32(nextSaltIndex)

  const ipshareContract = new ethers.Contract(ipshareAddress, IPSHARE_ABI, provider)
  const [ipshareCreated, rawIpShareCreateFee, committeeFees, balance] = await Promise.all([
    ipshareContract.ipshareCreated(creator).catch(() => false),
    ipshareContract.createFee(),
    getNutboxCommitteeFees(committeeAddress, rpcUrl),
    provider.getBalance(creator)
  ])

  const ipshareCreateFee = ipshareCreated ? 0n : BigInt(rawIpShareCreateFee)
  const nutboxCreateCommunityFee = BigInt(committeeFees.createCommunityFee)
  const nutboxSettingsFee = BigInt(committeeFees.communitySettingsFee)
  const totalRequiredFee = BigInt(createFee) + ipshareCreateFee + nutboxCreateCommunityFee + nutboxSettingsFee
  const gasReserve = await estimateGasReserve(
    () => pumpReader.createToken.estimateGas(tick, saltHex, { value: totalRequiredFee }),
    provider
  )
  const minimumRequiredBalance = totalRequiredFee + gasReserve + MIN_CREATE_BNB_REMAINING

  return {
    tick,
    creator,
    pumpAddress,
    ipshareAddress,
    committee: committeeAddress,
    salt: saltHex,
    lastSaltIndex,
    nextSaltIndex,
    createFee: BigInt(createFee),
    ipshareCreateFee,
    nutboxCreateCommunityFee,
    nutboxSettingsFee,
    totalRequiredFee,
    gasReserve,
    minimumRequiredBalance,
    balance
  }
}

async function createCommunity(params) {
  const {
    privateKey,
    tick,
    rpcUrl = DEFAULT_BNB_RPC,
    salt,
    quoteOnly = false
  } = params

  const quote = await buildCreateCommunityQuote({ privateKey, tick, rpcUrl, salt })

  const result = {
    route: quoteOnly ? 'v8-create-community-quote' : 'v8-create-community',
    tick: quote.tick,
    creator: quote.creator,
    version: 8,
    salt: quote.salt,
    lastSaltIndex: quote.lastSaltIndex.toString(),
    nextSaltIndex: quote.nextSaltIndex.toString(),
    pump: quote.pumpAddress,
    ipshare: quote.ipshareAddress,
    committee: quote.committee,
    createFee: quote.createFee.toString(),
    ipshareCreateFee: quote.ipshareCreateFee.toString(),
    nutboxCreateCommunityFee: quote.nutboxCreateCommunityFee.toString(),
    nutboxSettingsFee: quote.nutboxSettingsFee.toString(),
    totalRequiredFee: quote.totalRequiredFee.toString(),
    estimatedGasReserve: quote.gasReserve.toString(),
    minimumRequiredBalance: quote.minimumRequiredBalance.toString(),
    balance: quote.balance.toString(),
    minimumRemainingBalance: MIN_CREATE_BNB_REMAINING.toString(),
    canCreate: quote.balance >= quote.minimumRequiredBalance
  }

  if (quoteOnly) {
    return result
  }

  if (quote.balance < quote.minimumRequiredBalance) {
    throwWalletError(
      'INSUFFICIENT_CREATE_BALANCE',
      `required=${quote.minimumRequiredBalance.toString()}, available=${quote.balance.toString()}`
    )
  }

  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const pumpWriter = new ethers.Contract(quote.pumpAddress, PUMP_CREATE_ABI, signer)
  const tx = await pumpWriter.createToken(quote.tick, quote.salt, { value: quote.totalRequiredFee })
  const receipt = await tx.wait()
  const iface = new ethers.Interface(PUMP_CREATE_ABI)

  let token = ZERO_ADDRESS
  let creator = quote.creator
  let nutboxCommunity = ZERO_ADDRESS
  let nutboxSocialPool = ZERO_ADDRESS

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed.name === 'NewToken') {
        token = parsed.args.token
        creator = parsed.args.creator
      } else if (parsed.name === 'NutboxLinked') {
        nutboxCommunity = parsed.args.community
        nutboxSocialPool = parsed.args.socialPool
      }
    } catch {}
  }

  if (token !== ZERO_ADDRESS && (nutboxCommunity === ZERO_ADDRESS || nutboxSocialPool === ZERO_ADDRESS)) {
    const tokenReader = new ethers.Contract(token, TOKEN_NUTBOX_ABI, signer.provider)
    nutboxCommunity = await readOptionalContractValue(() => tokenReader.nutboxCommunity(), nutboxCommunity)
    nutboxSocialPool = await readOptionalContractValue(() => tokenReader.nutboxSocialPool(), nutboxSocialPool)
  }

  return {
    ...result,
    hash: receipt.hash,
    createHash: receipt.hash,
    token,
    creator,
    nutboxCommunity,
    nutboxSocialPool
  }
}

// ─── 社区 / 矿池查询 ────────────────────────────────

async function getNutboxCommunity(params) {
  const {
    community,
    ctoken,
    address,
    rpcUrl = DEFAULT_BNB_RPC,
    apiUrl,
    apiKey
  } = params

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  let communityAddr = community
  let indexedData = null

  if (!communityAddr) {
    if (!ctoken) {
      throwWalletError('INVALID_COMMUNITY', 'community or ctoken is required')
    }
    const data = await fetchNutboxCommunityByCToken(ctoken, { apiUrl, apiKey })
    if (!data || !data.community) {
      throwWalletError('NUTBOX_COMMUNITY_NOT_FOUND', `no Nutbox community found for ctoken=${ctoken}`)
    }
    indexedData = data
    communityAddr = data.community
  }

  const communityContract = new ethers.Contract(normalizeAddress(communityAddr, 'community'), NUTBOX_COMMUNITY_ABI, provider)
  const [owner, committee, feeRatio, rewardCalculator, communityToken, activePools, createdPools, totalPendingRewards] = await Promise.all([
    readOptionalContractValue(() => communityContract.owner(), ZERO_ADDRESS),
    readOptionalContractValue(() => communityContract.committee(), ZERO_ADDRESS),
    readOptionalContractValue(() => communityContract.feeRatio(), 0),
    readOptionalContractValue(() => communityContract.rewardCalculator(), ZERO_ADDRESS),
    readOptionalContractValue(() => communityContract.communityToken(), ZERO_ADDRESS),
    readAddressArray(communityContract, 'activedPools'),
    readAddressArray(communityContract, 'createdPools'),
    address ? readOptionalContractValue(() => communityContract.getTotalPendingRewards(normalizeAddress(address, 'address')), 0n) : 0n
  ])

  return {
    route: 'nutbox-community',
    community: normalizeAddress(communityAddr, 'community'),
    owner,
    committee,
    feeRatio: Number(feeRatio),
    rewardCalculator,
    communityToken,
    activePools,
    createdPools,
    totalPendingRewards: totalPendingRewards.toString(),
    indexedData
  }
}

async function getNutboxPool(params) {
  const {
    pool,
    address,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const base = new ethers.Contract(poolAddr, NUTBOX_POOL_ABI, provider)
  const [name, community, factory, totalStakedAmount, userStakedAmount] = await Promise.all([
    readOptionalContractValue(() => base.name(), ''),
    base.getCommunity(),
    base.getFactory(),
    readOptionalContractValue(() => base.getTotalStakedAmount(), 0n),
    address ? readOptionalContractValue(() => base.getUserStakedAmount(normalizeAddress(address, 'address')), 0n) : 0n
  ])

  const poolKind = detectNutboxPoolKind(factory)
  let extra = {}

  if (poolKind === 'erc20_staking') {
    const contract = new ethers.Contract(poolAddr, ERC20_STAKING_POOL_ABI, provider)
    const [stakeToken, depositInfo] = await Promise.all([
      contract.stakeToken(),
      address ? readOptionalContractValue(() => contract.getUserDepositInfo(normalizeAddress(address, 'address')), null) : null
    ])
    extra = {
      stakeToken,
      depositInfo: depositInfo ? {
        hasDeposited: depositInfo.hasDeposited,
        amount: depositInfo.amount.toString()
      } : null
    }
  } else if (poolKind === 'erc20_locking') {
    const contract = new ethers.Contract(poolAddr, ERC20_LOCKING_POOL_ABI, provider)
    const [stakeToken, lockDuration, depositInfo, claimableAmount, redeemRequests] = await Promise.all([
      contract.stakeToken(),
      contract.lockDuration(),
      address ? readOptionalContractValue(() => contract.getUserDepositInfo(normalizeAddress(address, 'address')), null) : null,
      address ? readOptionalContractValue(() => contract.claimableAmount(normalizeAddress(address, 'address')), 0n) : 0n,
      address ? readOptionalContractValue(() => contract.redeemRequests(normalizeAddress(address, 'address')), []) : []
    ])
    extra = {
      stakeToken,
      lockDuration: lockDuration.toString(),
      claimableAmount: claimableAmount.toString(),
      depositInfo: depositInfo ? {
        hasDeposited: depositInfo.hasDeposited,
        amount: depositInfo.amount.toString()
      } : null,
      redeemRequests: redeemRequests.map((item) => serializeBigIntMap(item))
    }
  } else if (poolKind === 'erc1155_staking') {
    const contract = new ethers.Contract(poolAddr, ERC1155_STAKING_POOL_ABI, provider)
    const [stakeToken, tokenId, depositInfo] = await Promise.all([
      contract.stakeToken(),
      contract.tokenId(),
      address ? readOptionalContractValue(() => contract.getUserDepositInfo(normalizeAddress(address, 'address')), null) : null
    ])
    extra = {
      stakeToken,
      tokenId: tokenId.toString(),
      depositInfo: depositInfo ? {
        hasDeposited: depositInfo.hasDeposited,
        amount: depositInfo.amount.toString()
      } : null
    }
  } else if (poolKind === 'social_curation') {
    const contract = new ethers.Contract(poolAddr, SOCIAL_CURATION_POOL_ABI, provider)
    const totalClaimed = await readOptionalContractValue(() => contract.totalClaimed(), 0n)
    extra = {
      totalClaimed: totalClaimed.toString()
    }
  }

  return {
    route: 'nutbox-pool',
    pool: poolAddr,
    community,
    factory,
    poolKind,
    name,
    totalStakedAmount: totalStakedAmount.toString(),
    userStakedAmount: userStakedAmount.toString(),
    ...extra
  }
}

// ─── 矿池管理（添加 / 设置比例）─────────────────────

async function addNutboxPool({
  privateKey,
  community,
  name,
  poolFactory,
  meta,
  ratios,
  rpcUrl = DEFAULT_BNB_RPC
}) {
  const communityAddr = normalizeAddress(community, 'community')
  const ratioList = normalizeRatioList(ratios)
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  await ensureCommunityOwner(communityAddr, signer)
  const provider = signer.provider
  const { committee } = await resolveCommunityAndCommittee(communityAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const contract = new ethers.Contract(communityAddr, NUTBOX_COMMUNITY_ABI, signer)
  const tx = await contract.adminAddPool(name, ratioList, poolFactory, meta, {
    value: BigInt(fees.communitySettingsFee)
  })
  const receipt = await tx.wait()
  const activePools = await readAddressArray(new ethers.Contract(communityAddr, NUTBOX_COMMUNITY_ABI, provider), 'activedPools')
  return {
    hash: receipt.hash,
    community: communityAddr,
    name,
    poolFactory,
    ratios: ratioList,
    settingsFee: fees.communitySettingsFee,
    activePools
  }
}

async function addNutboxErc20StakingPool(params) {
  const stakeToken = normalizeAddress(params.stakeToken, 'stakeToken')
  return addNutboxPool({
    ...params,
    poolFactory: NUTBOX_FACTORIES.erc20Staking,
    meta: ethers.solidityPacked(['address'], [stakeToken])
  })
}

async function addNutboxErc20LockingPool(params) {
  const stakeToken = normalizeAddress(params.stakeToken, 'stakeToken')
  const lockDuration = normalizeRequiredBigInt(params.lockDuration, 'lockDuration')
  return addNutboxPool({
    ...params,
    poolFactory: NUTBOX_FACTORIES.erc20Locking,
    meta: ethers.solidityPacked(['address', 'uint256'], [stakeToken, lockDuration])
  })
}

async function addNutboxErc1155Pool(params) {
  const stakeToken = normalizeAddress(params.stakeToken, 'stakeToken')
  const tokenId = normalizeRequiredBigInt(params.tokenId, 'tokenId', { allowZero: true })
  return addNutboxPool({
    ...params,
    poolFactory: NUTBOX_FACTORIES.erc1155Staking,
    meta: ethers.solidityPacked(['address', 'uint256'], [stakeToken, tokenId])
  })
}

async function setNutboxPoolRatios(params) {
  const {
    privateKey,
    community,
    ratios,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const communityAddr = normalizeAddress(community, 'community')
  const ratioList = normalizeRatioList(ratios)
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  await ensureCommunityOwner(communityAddr, signer)
  const provider = signer.provider
  const { committee } = await resolveCommunityAndCommittee(communityAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const contract = new ethers.Contract(communityAddr, NUTBOX_COMMUNITY_ABI, signer)
  const tx = await contract.adminSetPoolRatios(ratioList, {
    value: BigInt(fees.communitySettingsFee)
  })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    community: communityAddr,
    ratios: ratioList,
    settingsFee: fees.communitySettingsFee
  }
}

// ─── 领取奖励 ─────────────────────────────────────────

async function claimNutboxRewards(params) {
  const {
    privateKey,
    community,
    pools,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const communityAddr = normalizeAddress(community, 'community')
  const poolList = Array.isArray(pools) ? pools : normalizeCsvAddresses(pools, 'pools')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = signer.provider
  const { committee, communityContract } = await resolveCommunityAndCommittee(communityAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const pendingList = await Promise.all(
    poolList.map((pool) => communityContract.getPoolPendingRewards(pool, signer.address).catch(() => 0n))
  )
  const totalPending = pendingList.reduce((sum, item) => sum + BigInt(item), 0n)
  const writer = new ethers.Contract(communityAddr, NUTBOX_COMMUNITY_ABI, signer)
  const tx = await writer.withdrawPoolsRewards(poolList, {
    value: BigInt(fees.poolOperationFee)
  })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    community: communityAddr,
    pools: poolList,
    poolOperationFee: fees.poolOperationFee,
    totalPendingRewards: totalPending.toString()
  }
}

// ─── ERC20 质押 / 提取 ───────────────────────────────

async function depositNutboxErc20Pool(params) {
  const {
    privateKey,
    pool,
    amount,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = signer.provider
  const info = await getNutboxPool({ pool: poolAddr, address: signer.address, rpcUrl })
  if (info.poolKind !== 'erc20_staking' && info.poolKind !== 'erc20_locking') {
    throwWalletError('INVALID_POOL_KIND', `expected erc20 pool, received ${info.poolKind}`)
  }
  const { committee } = await resolveCommunityAndCommittee(poolAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const approveResult = await ensureAllowance(info.stakeToken, signer.address, poolAddr, amountBn, signer)
  const abi = info.poolKind === 'erc20_locking' ? ERC20_LOCKING_POOL_ABI : ERC20_STAKING_POOL_ABI
  const contract = new ethers.Contract(poolAddr, abi, signer)
  const tx = await contract.deposit(amountBn, { value: BigInt(fees.poolOperationFee) })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    approveHash: approveResult.hash,
    pool: poolAddr,
    poolKind: info.poolKind,
    amount: amountBn.toString(),
    poolOperationFee: fees.poolOperationFee
  }
}

async function withdrawNutboxErc20Pool(params) {
  const {
    privateKey,
    pool,
    amount,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = signer.provider
  const info = await getNutboxPool({ pool: poolAddr, address: signer.address, rpcUrl })
  if (info.poolKind !== 'erc20_staking' && info.poolKind !== 'erc20_locking') {
    throwWalletError('INVALID_POOL_KIND', `expected erc20 pool, received ${info.poolKind}`)
  }
  const { committee } = await resolveCommunityAndCommittee(poolAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const abi = info.poolKind === 'erc20_locking' ? ERC20_LOCKING_POOL_ABI : ERC20_STAKING_POOL_ABI
  const contract = new ethers.Contract(poolAddr, abi, signer)
  const tx = await contract.withdraw(amountBn, { value: BigInt(fees.poolOperationFee) })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    pool: poolAddr,
    poolKind: info.poolKind,
    amount: amountBn.toString(),
    poolOperationFee: fees.poolOperationFee
  }
}

async function redeemNutboxErc20Locking(params) {
  const {
    privateKey,
    pool,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const info = await getNutboxPool({ pool: poolAddr, address: signer.address, rpcUrl })
  if (info.poolKind !== 'erc20_locking') {
    throwWalletError('INVALID_POOL_KIND', `expected erc20_locking pool, received ${info.poolKind}`)
  }
  const contract = new ethers.Contract(poolAddr, ERC20_LOCKING_POOL_ABI, signer)
  const tx = await contract.redeem()
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    pool: poolAddr,
    poolKind: 'erc20_locking'
  }
}

// ─── ERC1155 质押 / 提取 ─────────────────────────────

async function depositNutboxErc1155Pool(params) {
  const {
    privateKey,
    pool,
    amount,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = signer.provider
  const info = await getNutboxPool({ pool: poolAddr, address: signer.address, rpcUrl })
  if (info.poolKind !== 'erc1155_staking') {
    throwWalletError('INVALID_POOL_KIND', `expected erc1155_staking pool, received ${info.poolKind}`)
  }
  const { committee } = await resolveCommunityAndCommittee(poolAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const approveResult = await ensureErc1155Approval(info.stakeToken, signer.address, poolAddr, signer)
  const contract = new ethers.Contract(poolAddr, ERC1155_STAKING_POOL_ABI, signer)
  const tx = await contract.deposit(amountBn, { value: BigInt(fees.poolOperationFee) })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    approveHash: approveResult.hash,
    pool: poolAddr,
    poolKind: 'erc1155_staking',
    amount: amountBn.toString(),
    poolOperationFee: fees.poolOperationFee
  }
}

async function withdrawNutboxErc1155Pool(params) {
  const {
    privateKey,
    pool,
    amount,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const info = await getNutboxPool({ pool: poolAddr, address: signer.address, rpcUrl })
  if (info.poolKind !== 'erc1155_staking') {
    throwWalletError('INVALID_POOL_KIND', `expected erc1155_staking pool, received ${info.poolKind}`)
  }
  const provider = signer.provider
  const { committee } = await resolveCommunityAndCommittee(poolAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const contract = new ethers.Contract(poolAddr, ERC1155_STAKING_POOL_ABI, signer)
  const tx = await contract.withdraw(amountBn, { value: BigInt(fees.poolOperationFee) })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    pool: poolAddr,
    poolKind: 'erc1155_staking',
    amount: amountBn.toString(),
    poolOperationFee: fees.poolOperationFee
  }
}

// ─── Social Curation Pool ────────────────────────────

async function harvestNutboxSocialPool(params) {
  const {
    privateKey,
    pool,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const info = await getNutboxPool({ pool: poolAddr, rpcUrl })
  if (info.poolKind !== 'social_curation') {
    throwWalletError('INVALID_POOL_KIND', `expected social_curation pool, received ${info.poolKind}`)
  }
  const provider = signer.provider
  const { committee } = await resolveCommunityAndCommittee(poolAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const contract = new ethers.Contract(poolAddr, SOCIAL_CURATION_POOL_ABI, signer)
  const tx = await contract.harvestRewards({ value: BigInt(fees.poolOperationFee) })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    pool: poolAddr,
    poolKind: 'social_curation',
    poolOperationFee: fees.poolOperationFee
  }
}

async function claimNutboxSocialPool(params) {
  const {
    privateKey,
    pool,
    orderId,
    amount,
    deadline,
    signature,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const poolAddr = normalizeAddress(pool, 'pool')
  const orderIdBn = normalizeRequiredBigInt(orderId, 'orderId', { allowZero: true })
  const amountBn = normalizeRequiredBigInt(amount, 'amount')
  const deadlineBn = normalizeRequiredBigInt(deadline, 'deadline')
  if (!signature) {
    throwWalletError('INVALID_SIGNATURE', 'signature is required')
  }
  const signer = await resolveWriteSigner(privateKey, rpcUrl)
  const info = await getNutboxPool({ pool: poolAddr, rpcUrl })
  if (info.poolKind !== 'social_curation') {
    throwWalletError('INVALID_POOL_KIND', `expected social_curation pool, received ${info.poolKind}`)
  }
  const provider = signer.provider
  const { committee } = await resolveCommunityAndCommittee(poolAddr, provider)
  const fees = await getNutboxCommitteeFees(committee, rpcUrl)
  const contract = new ethers.Contract(poolAddr, SOCIAL_CURATION_POOL_ABI, signer)
  const tx = await contract.claim(orderIdBn, amountBn, deadlineBn, signature, {
    value: BigInt(fees.poolOperationFee)
  })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    pool: poolAddr,
    poolKind: 'social_curation',
    orderId: orderIdBn.toString(),
    amount: amountBn.toString(),
    deadline: deadlineBn.toString(),
    poolOperationFee: fees.poolOperationFee
  }
}

module.exports = {
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
  claimNutboxSocialPool
}
