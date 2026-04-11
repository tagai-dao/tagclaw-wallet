/**
 * 通用校验、格式化、guard 工具函数
 * 不含业务逻辑，仅被其他模块按需引用
 */
import { ethers } from 'ethers'
import {
  ERC20_BALANCE_ABI,
  TOKEN_ALLOWANCE_ABI,
  ERC1155_APPROVAL_ABI
} from './abi/index.js'
import { ZERO_ADDRESS, MAX_UINT256, NUTBOX_FACTORIES } from './constants.js'

// ─── 输入校验 ────────────────────────────────────────

function normalizeSellsman(sellsman) {
  if (!sellsman || !ethers.isAddress(sellsman)) return ZERO_ADDRESS
  return sellsman
}

function normalizeSlippage(slippage = 0) {
  const n = Number(slippage)
  if (!Number.isInteger(n) || n < 0 || n > 10000) {
    throw new Error('slippage must be an integer between 0 and 10000')
  }
  return n
}

function normalizeAddress(value, fieldName) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${fieldName} must be a valid address`)
  }
  return value
}

function normalizeRequiredBigInt(value, fieldName, { allowZero = false } = {}) {
  if (value == null || value === '') {
    throwWalletError(`INVALID_${fieldName.toUpperCase()}`, `${fieldName} is required`)
  }
  const amount = BigInt(value)
  if (allowZero ? amount < 0n : amount <= 0n) {
    throwWalletError(
      `INVALID_${fieldName.toUpperCase()}`,
      `${fieldName} must be ${allowZero ? 'greater than or equal to 0' : 'greater than 0'}`
    )
  }
  return amount
}

function normalizeOptionalBigInt(value, fieldName) {
  if (value == null || value === '') return 0n
  const amount = BigInt(value)
  if (amount < 0n) {
    throwWalletError(`INVALID_${fieldName.toUpperCase()}`, `${fieldName} must be greater than or equal to 0`)
  }
  return amount
}

// ─── 数学 / 格式化 ────────────────────────────────────

function calcMinBySlippage(amount, slippageBps) {
  return amount * BigInt(10000 - slippageBps) / 10000n
}

function isBytes32Hex(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

function toTokenUnitNumber(value) {
  return Number(value) / 1e18
}

function parseNumericApiValue(raw, errorCode) {
  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
  if (!Number.isFinite(parsed)) {
    throwWalletError(errorCode, `invalid numeric response=${String(raw)}`)
  }
  return parsed
}

function toLowerAddress(value) {
  return String(value || '').toLowerCase()
}

function serializeBigIntMap(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? value.toString() : value
    ])
  )
}

// ─── 错误处理 ─────────────────────────────────────────

function getReadableError(e) {
  if (!e) return 'unknown error'
  if (typeof e === 'string') return e
  return e.shortMessage || e.reason || e.message || String(e)
}

function throwWalletError(code, detail) {
  throw new Error(`${code}: ${detail}`)
}

// ─── Nutbox 池类型识别 ────────────────────────────────

function detectNutboxPoolKind(poolFactory) {
  const normalized = toLowerAddress(poolFactory)
  if (normalized === toLowerAddress(NUTBOX_FACTORIES.erc20Staking)) return 'erc20_staking'
  if (normalized === toLowerAddress(NUTBOX_FACTORIES.erc20Locking)) return 'erc20_locking'
  if (normalized === toLowerAddress(NUTBOX_FACTORIES.erc1155Staking)) return 'erc1155_staking'
  if (normalized === toLowerAddress(NUTBOX_FACTORIES.socialCuration)) return 'social_curation'
  return 'unknown'
}

// ─── 合约通用读取 ─────────────────────────────────────

async function readAddressArray(contract, getterName, maxItems = 255) {
  const values = []
  for (let i = 0; i < maxItems; i++) {
    try {
      values.push(await contract[getterName](i))
    } catch {
      break
    }
  }
  return values
}

async function readOptionalContractValue(readFn, fallback = null) {
  try {
    return await readFn()
  } catch {
    return fallback
  }
}

async function estimateGasReserve(txBuilder, provider) {
  try {
    const [gasEstimate, feeData] = await Promise.all([
      txBuilder(),
      provider.getFeeData()
    ])
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n
    if (!gasEstimate || !gasPrice) return 0n
    return gasEstimate * gasPrice * 120n / 100n
  } catch {
    return ethers.parseEther('0.0003')
  }
}

// ─── 余额 / 授权 guard ───────────────────────────────

async function ensureNativeBalance(provider, address, required, context) {
  const available = await provider.getBalance(address)
  if (available < required) {
    throwWalletError(
      'INSUFFICIENT_NATIVE_BALANCE',
      `${context}; required=${required.toString()} wei, available=${available.toString()} wei`
    )
  }
}

async function ensureTokenBalance(provider, token, owner, required) {
  const tokenContract = new ethers.Contract(token, ERC20_BALANCE_ABI, provider)
  const available = await tokenContract.balanceOf(owner)
  if (available < required) {
    throwWalletError(
      'INSUFFICIENT_TOKEN_BALANCE',
      `token=${token}, required=${required.toString()}, available=${available.toString()}`
    )
  }
}

async function ensureAllowance(token, owner, spender, amount, signer) {
  const tokenContract = new ethers.Contract(token, TOKEN_ALLOWANCE_ABI, signer)
  const allowance = await tokenContract.allowance(owner, spender)
  if (allowance >= amount) {
    return { approved: false, hash: null }
  }
  const tx = await tokenContract.approve(spender, MAX_UINT256)
  const receipt = await tx.wait()
  return { approved: true, hash: receipt.hash }
}

async function ensureErc1155Approval(token, owner, operator, signer) {
  const contract = new ethers.Contract(token, ERC1155_APPROVAL_ABI, signer)
  const approved = await contract.isApprovedForAll(owner, operator)
  if (approved) {
    return { approved: false, hash: null }
  }
  const tx = await contract.setApprovalForAll(operator, true)
  const receipt = await tx.wait()
  return { approved: true, hash: receipt.hash }
}

export {
  normalizeSellsman,
  normalizeSlippage,
  normalizeAddress,
  normalizeRequiredBigInt,
  normalizeOptionalBigInt,
  calcMinBySlippage,
  isBytes32Hex,
  toTokenUnitNumber,
  parseNumericApiValue,
  toLowerAddress,
  serializeBigIntMap,
  getReadableError,
  throwWalletError,
  detectNutboxPoolKind,
  readAddressArray,
  readOptionalContractValue,
  estimateGasReserve,
  ensureNativeBalance,
  ensureTokenBalance,
  ensureAllowance,
  ensureErc1155Approval
}
