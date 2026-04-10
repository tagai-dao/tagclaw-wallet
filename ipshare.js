/**
 * IPShare 全套操作：查询、创建、买卖、质押、赎回、领奖
 */
const { ethers } = require('ethers')
const { IPSHARE_ABI } = require('./abi')
const { DEFAULT_BNB_RPC, IPSHARE_CONTRACT, IPSHARE_DECIMALS } = require('./constants')
const { resolveWriteSigner } = require('./claw')
const {
  normalizeAddress,
  normalizeRequiredBigInt,
  normalizeOptionalBigInt,
  throwWalletError,
  getReadableError,
  ensureNativeBalance
} = require('./helpers')

// ─── 内部辅助 ─────────────────────────────────────────

function getIpShareContract(runner) {
  return new ethers.Contract(IPSHARE_CONTRACT, IPSHARE_ABI, runner)
}

function formatIpShareAmount(amount) {
  return ethers.formatUnits(amount, IPSHARE_DECIMALS)
}

function formatUnlockTime(unlockTime) {
  if (unlockTime <= 0n) return null
  return new Date(Number(unlockTime) * 1000).toISOString()
}

function serializeStakeInfo(subject, info) {
  const amount = BigInt(info.amount)
  const redeemAmount = BigInt(info.redeemAmount)
  const unlockTime = BigInt(info.unlockTime)
  const debts = BigInt(info.debts)
  const profit = BigInt(info.profit)

  return {
    contract: IPSHARE_CONTRACT,
    subject,
    staker: info.staker,
    amountRaw: amount.toString(),
    amountFormatted: formatIpShareAmount(amount),
    redeemAmountRaw: redeemAmount.toString(),
    redeemAmountFormatted: formatIpShareAmount(redeemAmount),
    unlockTime: unlockTime.toString(),
    unlockTimeIso: formatUnlockTime(unlockTime),
    debtsRaw: debts.toString(),
    debtsFormatted: formatIpShareAmount(debts),
    profitRaw: profit.toString(),
    profitFormatted: formatIpShareAmount(profit),
    isStaking: amount > 0n,
    isUnstaking: redeemAmount > 0n
  }
}

async function ensureIpShareBalance(provider, subject, holder, required) {
  const contract = getIpShareContract(provider)
  const available = await contract.ipshareBalance(subject, holder)
  if (available < required) {
    throwWalletError(
      'INSUFFICIENT_IPSHARE_BALANCE',
      `subject=${subject}, required=${required.toString()}, available=${available.toString()}`
    )
  }
}

// ─── 查询 ─────────────────────────────────────────────

/**
 * Query IPShare supply for a subject.
 * @param {string} subject - subject address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ contract: string, subject: string, raw: string, formatted: string }>}
 */
async function getIpShareSupply(subject, rpcUrl = DEFAULT_BNB_RPC) {
  const subjectAddr = normalizeAddress(subject, 'subject')
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  try {
    const contract = getIpShareContract(provider)
    const raw = await contract.ipshareSupply(subjectAddr)
    return {
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      raw: raw.toString(),
      formatted: formatIpShareAmount(raw)
    }
  } catch (e) {
    throwWalletError('IPSHARE_QUERY_FAILED', getReadableError(e))
  }
}

/**
 * Query IPShare balance for a holder under a subject.
 * @param {string} subject - subject address
 * @param {string} holder - holder address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ contract: string, subject: string, holder: string, raw: string, formatted: string }>}
 */
async function getIpShareBalance(subject, holder, rpcUrl = DEFAULT_BNB_RPC) {
  const subjectAddr = normalizeAddress(subject, 'subject')
  const holderAddr = normalizeAddress(holder, 'holder')
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  try {
    const contract = getIpShareContract(provider)
    const raw = await contract.ipshareBalance(subjectAddr, holderAddr)
    return {
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      holder: holderAddr,
      raw: raw.toString(),
      formatted: formatIpShareAmount(raw)
    }
  } catch (e) {
    throwWalletError('IPSHARE_QUERY_FAILED', getReadableError(e))
  }
}

/**
 * Query stake info for a subject/staker pair.
 * @param {string} subject - subject address
 * @param {string} staker - staker address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<Object>}
 */
async function getIpShareStakeInfo(subject, staker, rpcUrl = DEFAULT_BNB_RPC) {
  const subjectAddr = normalizeAddress(subject, 'subject')
  const stakerAddr = normalizeAddress(staker, 'staker')
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  try {
    const contract = getIpShareContract(provider)
    const info = await contract.getStakerInfo(subjectAddr, stakerAddr)
    return serializeStakeInfo(subjectAddr, info)
  } catch (e) {
    throwWalletError('IPSHARE_QUERY_FAILED', getReadableError(e))
  }
}

/**
 * Query pending IPShare rewards for a staker.
 * @param {string} subject - subject address
 * @param {string} staker - staker address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ contract: string, subject: string, staker: string, raw: string, formatted: string }>}
 */
async function getIpSharePendingRewards(subject, staker, rpcUrl = DEFAULT_BNB_RPC) {
  const subjectAddr = normalizeAddress(subject, 'subject')
  const stakerAddr = normalizeAddress(staker, 'staker')
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  try {
    const contract = getIpShareContract(provider)
    const raw = await contract.getPendingProfits(subjectAddr, stakerAddr)
    return {
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      staker: stakerAddr,
      raw: raw.toString(),
      formatted: formatIpShareAmount(raw)
    }
  } catch (e) {
    throwWalletError('IPSHARE_QUERY_FAILED', getReadableError(e))
  }
}

// ─── 写操作 ───────────────────────────────────────────

/**
 * Create IPShare for a subject. If subject is omitted, wallet address is used.
 * @param {Object} params
 * @param {string} params.privateKey - creator private key
 * @param {string} [params.subject] - subject address, defaults to wallet address
 * @param {string|bigint|number} [params.value] - payable value in wei, defaults to on-chain createFee
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, value: string, createFee: string }>}
 */
async function createIpShare(params) {
  const {
    privateKey,
    subject,
    value,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  const subjectAddr = subject ? normalizeAddress(subject, 'subject') : wallet.address

  try {
    const contract = getIpShareContract(wallet)
    const createFee = await contract.createFee()
    const valueBn = value == null || value === '' ? createFee : normalizeRequiredBigInt(value, 'value', { allowZero: true })

    if (valueBn < createFee) {
      throwWalletError('INVALID_CREATE_VALUE', `value must be at least createFee=${createFee.toString()}`)
    }
    await ensureNativeBalance(provider, wallet.address, valueBn, 'create ipshare requires payable value')

    const tx = await contract.createShare(subjectAddr, { value: valueBn })
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      value: valueBn.toString(),
      createFee: createFee.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_CREATE_FAILED', getReadableError(e))
  }
}

/**
 * Buy IPShare with BNB. Buyer is always the sender wallet.
 * @param {Object} params
 * @param {string} params.privateKey - buyer private key
 * @param {string} params.subject - subject address
 * @param {string|bigint|number} params.value - BNB value in wei
 * @param {string|bigint|number} [params.amountOutMin=0] - minimum IPShare out in raw units
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, buyer: string, value: string, expectedAmount: string, amountOutMin: string }>}
 */
async function buyIpShare(params) {
  const {
    privateKey,
    subject,
    value,
    amountOutMin,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const subjectAddr = normalizeAddress(subject, 'subject')
  const valueBn = normalizeRequiredBigInt(value, 'value')
  const amountOutMinBn = normalizeOptionalBigInt(amountOutMin, 'amountOutMin')

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  await ensureNativeBalance(provider, wallet.address, valueBn, 'buy ipshare requires payable value')

  try {
    const contract = getIpShareContract(wallet)
    const expectedAmount = await contract.buyShares.staticCall(subjectAddr, wallet.address, amountOutMinBn, { value: valueBn })
    const tx = await contract.buyShares(subjectAddr, wallet.address, amountOutMinBn, { value: valueBn })
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      buyer: wallet.address,
      value: valueBn.toString(),
      expectedAmount: expectedAmount.toString(),
      amountOutMin: amountOutMinBn.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_BUY_FAILED', getReadableError(e))
  }
}

/**
 * Sell IPShare for BNB.
 * @param {Object} params
 * @param {string} params.privateKey - seller private key
 * @param {string} params.subject - subject address
 * @param {string|bigint|number} params.amount - IPShare raw amount to sell
 * @param {string|bigint|number} [params.amountOutMin=0] - minimum BNB out in wei
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, seller: string, amount: string, expectedReceive: string, amountOutMin: string }>}
 */
async function sellIpShare(params) {
  const {
    privateKey,
    subject,
    amount,
    amountOutMin,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const subjectAddr = normalizeAddress(subject, 'subject')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')
  const amountOutMinBn = normalizeOptionalBigInt(amountOutMin, 'amountOutMin')

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  await ensureIpShareBalance(provider, subjectAddr, wallet.address, amountBn)

  try {
    const contract = getIpShareContract(wallet)
    const expectedReceive = await contract.getSellPriceAfterFee(subjectAddr, amountBn)
    const tx = await contract.sellShares(subjectAddr, amountBn, amountOutMinBn)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      seller: wallet.address,
      amount: amountBn.toString(),
      expectedReceive: expectedReceive.toString(),
      amountOutMin: amountOutMinBn.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_SELL_FAILED', getReadableError(e))
  }
}

/**
 * Stake IPShare for a subject.
 * @param {Object} params
 * @param {string} params.privateKey - staker private key
 * @param {string} params.subject - subject address
 * @param {string|bigint|number} params.amount - IPShare raw amount to stake
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, staker: string, amount: string }>}
 */
async function stakeIpShare(params) {
  const {
    privateKey,
    subject,
    amount,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const subjectAddr = normalizeAddress(subject, 'subject')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  await ensureIpShareBalance(provider, subjectAddr, wallet.address, amountBn)

  try {
    const contract = getIpShareContract(wallet)
    const tx = await contract.stake(subjectAddr, amountBn)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      staker: wallet.address,
      amount: amountBn.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_STAKE_FAILED', getReadableError(e))
  }
}

/**
 * Start unstaking IPShare for a subject.
 * @param {Object} params
 * @param {string} params.privateKey - staker private key
 * @param {string} params.subject - subject address
 * @param {string|bigint|number} params.amount - IPShare raw amount to unstake
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, staker: string, amount: string }>}
 */
async function unstakeIpShare(params) {
  const {
    privateKey,
    subject,
    amount,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const subjectAddr = normalizeAddress(subject, 'subject')
  const amountBn = normalizeRequiredBigInt(amount, 'amount')

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider

  try {
    const readContract = getIpShareContract(provider)
    const stakeInfo = await readContract.getStakerInfo(subjectAddr, wallet.address)
    if (BigInt(stakeInfo.amount) < amountBn) {
      throwWalletError(
        'INSUFFICIENT_STAKED_IPSHARE',
        `subject=${subjectAddr}, required=${amountBn.toString()}, available=${stakeInfo.amount.toString()}`
      )
    }

    const contract = getIpShareContract(wallet)
    const tx = await contract.unstake(subjectAddr, amountBn)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      staker: wallet.address,
      amount: amountBn.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_UNSTAKE_FAILED', getReadableError(e))
  }
}

/**
 * Redeem IPShare after the unstake lock period.
 * @param {Object} params
 * @param {string} params.privateKey - staker private key
 * @param {string} params.subject - subject address
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, staker: string, redeemAmount: string }>}
 */
async function redeemIpShare(params) {
  const {
    privateKey,
    subject,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const subjectAddr = normalizeAddress(subject, 'subject')
  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider

  try {
    const readContract = getIpShareContract(provider)
    const stakeInfo = await readContract.getStakerInfo(subjectAddr, wallet.address)
    const redeemAmount = BigInt(stakeInfo.redeemAmount)

    const contract = getIpShareContract(wallet)
    const tx = await contract.redeem(subjectAddr)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      staker: wallet.address,
      redeemAmount: redeemAmount.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_REDEEM_FAILED', getReadableError(e))
  }
}

/**
 * Claim pending IPShare rewards. Caller decides whether claiming is needed.
 * @param {Object} params
 * @param {string} params.privateKey - staker private key
 * @param {string} params.subject - subject address
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, contract: string, subject: string, staker: string, pendingRewards: string }>}
 */
async function claimIpShareRewards(params) {
  const {
    privateKey,
    subject,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  const subjectAddr = normalizeAddress(subject, 'subject')
  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider

  try {
    const readContract = getIpShareContract(provider)
    const pendingRewards = await readContract.getPendingProfits(subjectAddr, wallet.address)

    const contract = getIpShareContract(wallet)
    const tx = await contract.claim(subjectAddr)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      contract: IPSHARE_CONTRACT,
      subject: subjectAddr,
      staker: wallet.address,
      pendingRewards: pendingRewards.toString()
    }
  } catch (e) {
    throwWalletError('IPSHARE_CLAIM_FAILED', getReadableError(e))
  }
}

module.exports = {
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
}
