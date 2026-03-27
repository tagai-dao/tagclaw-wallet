/**
 * tagclaw-wallet — minimal wallet utilities for local Agent usage
 * Dependencies: ethers, steem (no js-sha256/bs58; uses Node crypto + inline base58)
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { ethers } = require('ethers')
const steem = require('steem')
const { ClawEthersSigner } = require('@claw_wallet_sdk/claw_wallet/ethers')
const { ClawSandboxClient } = require('@claw_wallet_sdk/claw_wallet')

/** 与 install.sh / 沙箱写入的凭证同级：先 .env.clay 再 .env（后者可覆盖） */
const WALLET_ROOT = path.join(__dirname)
require('dotenv').config({ path: path.join(WALLET_ROOT, '.env.clay'), quiet: true })
require('dotenv').config({ path: path.join(WALLET_ROOT, '.env'), quiet: true })

/**
 * 与产品约定一致：必须用 JSON.stringify(..., null, 4)，禁止手抄整段字符串（Steem brain 派生依赖 Claw personal_sign）
 */
const RegisterSteemMessage = JSON.stringify(
  {
    project: 'tagai',
    method: 'generate-social-account'
  },
  null,
  4
)
const {
  ERC20_BALANCE_ABI,
  ERC20_TRANSFER_ABI,
  TOKEN_ALLOWANCE_ABI,
  UNISWAP_ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
  CL_POOL_MANAGER_ABI,
  WRAP_SWAPER_ABI,
  WRAP_SWAPER2_ABI,
  TOKEN_BUY_ABI,
  TOKEN1_BUY_ABI,
  TOKEN5_BUY_ABI,
  TOKEN_SELL_ABI,
  TOKEN_SUPPLY_ABI,
  PUMP_QUOTE_ABI,
  IPSHARE_ABI
} = require('./abi')

const STEEM_USERNAME = 'tagai'

// 模块级别配置，通过 configure() 修改
const _config = {
  apiUrl: 'https://bsc-api.tagai.fun'
}

/**
 * 设置模块级别配置（如 API 地址）
 * @param {{ apiUrl?: string }} opts
 */
function configure(opts = {}) {
  if (opts.apiUrl) _config.apiUrl = opts.apiUrl
}

/**
 * 根据 tick（代币名称）从 community detail API 获取 token 合约地址及元信息
 * @param {string} tick - 代币名称（区分大小写）
 * @returns {Promise<{ token: string, version: number, listed: boolean, isImport: boolean, pair: string | null }>}
 */
async function fetchTokenInfo(tick) {
  const url = `${_config.apiUrl}/community/detail?tick=${encodeURIComponent(tick)}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`fetchTokenInfo failed: HTTP ${resp.status} for tick="${tick}"`)
  }
  const data = await resp.json()
  if (!data || !data.token) {
    throw new Error(`fetchTokenInfo: no token found for tick="${tick}"`)
  }
  return {
    token: data.token,
    version: Number(data.version),
    listed: Number(data.listedDayNumber) > 0,
    isImport: !!data.isImport,
    pair: typeof data.pair === 'string' && data.pair ? data.pair : null
  }
}

// Base58 alphabet (Steem/Bitcoin compatible), implemented inline without third-party deps
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer) {
  const hex = buffer.length ? buffer.toString('hex') : ''
  if (!hex) return '' // Avoid BigInt('0x') error on empty buffer
  let num = BigInt('0x' + hex)
  if (num === 0n) return ''
  let s = ''
  while (num > 0n) {
    const r = num % 58n
    num = num / 58n
    s = BASE58_ALPHABET[Number(r)] + s
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) s = '1' + s
  return s
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex')
}

/** 32 字节 hex（64 字符，可带或不带 0x） */
function normalizeSecretHex64(secretHex) {
  const h = secretHex.replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new Error('secret hex must be 64 hex characters (32 bytes)')
  }
  return h.toLowerCase()
}

/** Steem brain 密码串：与 legacy「EVM 私钥 → brain」同一套编码，仅输入改为任意 32 字节材料 */
function brainKeyFromSecretHex(secretHex64) {
  const evmNo0x = normalizeSecretHex64(secretHex64)
  const pk = '0x80' + evmNo0x
  const first = sha256Hex(pk)
  const second = sha256Hex(first)
  const checksum = second.slice(0, 4)
  const privateWif = pk + checksum
  const result = 'P' + base58Encode(Buffer.from(privateWif.replace('0x', ''), 'hex'))
  return result
}

/** Derive Steem brain key (WIF format) from EVM private key */
function brainKeyFromEvmPrivateKey(evmPrivateKey) {
  return brainKeyFromSecretHex(evmPrivateKey.replace(/^0x/, ''))
}

/**
 * Derive Steem role keys from an EVM private key (TagClaw-compatible format)
 * @param {string} evmPrivateKey - private key starting with 0x
 * @returns {{ postingPub, postingPri, owner, active, memo }}
 */
function steemKeysFromBrainPass(pass) {
  const ownerKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['owner'])
  const activeKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['active'])
  const postingKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['posting'])
  const memoKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['memo'])
  return {
    postingPub: steem.auth.wifToPublic(postingKey.posting),
    postingPri: postingKey.posting,
    owner: steem.auth.wifToPublic(ownerKey.owner),
    active: steem.auth.wifToPublic(activeKey.active),
    memo: steem.auth.wifToPublic(memoKey.memo)
  }
}

/** 由本地 EVM 私钥派生 Steem（legacy，与 Claw 路径得到的 Steem 密钥不同） */
function generateSteemKeys(evmPrivateKey) {
  const pass = brainKeyFromEvmPrivateKey(evmPrivateKey.replace(/^0x/, ''))
  return steemKeysFromBrainPass(pass)
}

/**
 * Sign a message with EVM private key (personal_sign / eth_sign style)
 * @param {string} [privateKey] - 若省略或空串则走 Claw 沙箱签名
 * @param {string} message - plain UTF-8 message
 * @returns {Promise<string>} hex signature string (0x-prefixed)
 */
async function signMessage(privateKey, message) {
  if (privateKey && String(privateKey).trim().startsWith('0x')) {
    const wallet = new ethers.Wallet(privateKey.trim())
    return wallet.signMessage(message)
  }
  const signer = await getClawEthersSigner()
  return signer.signMessage(message)
}

// Default BNB Chain (BSC) RPC, override via TAGCLAW_BNB_RPC
const DEFAULT_BNB_RPC = process.env.TAGCLAW_BNB_RPC || 'https://bsc-dataseed2.binance.org'

// --- Claw sandbox (BitsLabSec claw_wallet_sdk) ---

function loadClawConfig() {
  const sandboxUrl = (process.env.CLAY_SANDBOX_URL || '').trim().replace(/\/+$/, '')
  const sandboxToken = (process.env.CLAY_AGENT_TOKEN || process.env.AGENT_TOKEN || '').trim()
  let uid = (process.env.CLAY_UID || '').trim()
  if (!uid) {
    const idPath = path.join(WALLET_ROOT, 'identity.json')
    if (fs.existsSync(idPath)) {
      try {
        const j = JSON.parse(fs.readFileSync(idPath, 'utf8'))
        uid = String(j.uid || j.UID || '').trim()
      } catch (_) {}
    }
  }
  return { sandboxUrl, sandboxToken, uid }
}

function assertClawConfig(cfg) {
  if (!cfg.sandboxUrl || !cfg.sandboxToken || !cfg.uid) {
    throw new Error(
      'Claw wallet: set CLAY_SANDBOX_URL, CLAY_AGENT_TOKEN (or AGENT_TOKEN), and CLAY_UID (or identity.json uid). Run bash install.sh in tagclaw-wallet and check .env.clay.'
    )
  }
}

function clawSignerConfig(cfg) {
  return {
    uid: cfg.uid,
    sandboxUrl: cfg.sandboxUrl,
    sandboxToken: cfg.sandboxToken
  }
}

/** personal_sign 结果 → 32 字节 hex（SHA256(r‖s‖v)） */
function kdfFromSignatureHex(signatureHex) {
  const sig = ethers.Signature.from(signatureHex)
  const r = Buffer.from(ethers.getBytes(sig.r))
  const s = Buffer.from(ethers.getBytes(sig.s))
  const v = ((Number(sig.v) % 256) + 256) % 256
  const vBuf = Buffer.from([v])
  const packed = Buffer.concat([r, s, vBuf])
  return crypto.createHash('sha256').update(packed).digest('hex')
}

async function getBscOrEthAddress(client) {
  try {
    return await client.getRequiredAddress('bsc')
  } catch (_) {
    return client.getRequiredAddress('ethereum')
  }
}

/**
 * 确保沙箱钱包可读出链上地址；失败时尝试 init / reactivate（与 install.sh 行为一致）
 * @param {ClawSandboxClient} client
 */
async function ensureWalletReadyWithClient(client) {
  async function tryReady() {
    try {
      await getBscOrEthAddress(client)
      return true
    } catch {
      return false
    }
  }
  if (await tryReady()) return
  try {
    await client.initWallet({})
  } catch (_) {
    /* 可能已存在 */
  }
  try {
    await client.reactivateWallet()
  } catch (_) {}
  if (await tryReady()) return
  throw new Error(
    'Claw wallet not ready: could not read bsc/ethereum address after init/reactivate. Is clay-sandbox running?'
  )
}

/** 用于链上读写：无 privateKey 时用 ClawEthersSigner + 公共 BSC RPC */
async function getClawEthersSigner(rpcUrl = DEFAULT_BNB_RPC) {
  const cfg = loadClawConfig()
  console.log(cfg)
  assertClawConfig(cfg)
  const client = new ClawSandboxClient(clawSignerConfig(cfg))
  await ensureWalletReadyWithClient(client)
  const address = await getBscOrEthAddress(client)
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ClawEthersSigner(clawSignerConfig(cfg), provider, address)
}

/**
 * @param {string} [privateKey]
 * @param {string} [rpcUrl]
 * @returns {Promise<import('ethers').Wallet | import('@bitslabsec/claw_wallet_sdk/ethers').ClawEthersSigner>}
 */
async function resolveWriteSigner(privateKey, rpcUrl = DEFAULT_BNB_RPC) {
  if (privateKey && String(privateKey).trim().startsWith('0x')) {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    return new ethers.Wallet(privateKey.trim(), provider)
  }
  return getClawEthersSigner(rpcUrl)
}

/**
 * 写链统一走 ethers 标准路径：合约方法或 signer.sendTransaction。
 * AbstractSigner.sendTransaction 内部为 populateTransaction → signTransaction → broadcastTransaction；
 * ClawEthersSigner 在 signTransaction 阶段走沙箱签名，行为与本地 Wallet 一致。
 */

/** Claw + RegisterSteemMessage 派生 Steem（无需本地 EVM 私钥） */
async function generateSteemKeysFromClaw(opts = {}) {
  const rpcUrl = opts.rpcUrl || DEFAULT_BNB_RPC
  const signer = await getClawEthersSigner(rpcUrl)
  const signatureHex = await signer.signMessage(RegisterSteemMessage)
  const secretHex = kdfFromSignatureHex(signatureHex)
  const pass = brainKeyFromSecretHex(secretHex)
  return steemKeysFromBrainPass(pass)
}

/** 查询沙箱中的 EVM 地址（BSC 优先） */
async function getClawWalletAddress(chain) {
  const cfg = loadClawConfig()
  assertClawConfig(cfg)
  const client = new ClawSandboxClient(clawSignerConfig(cfg))
  await ensureWalletReadyWithClient(client)
  if (chain) {
    return client.getRequiredAddress(chain)
  }
  return getBscOrEthAddress(client)
}


/**
 * 由沙箱对 challenge 哈希签名并经由 relay 完成「绑定代理钱包」（参见 BitsLabSec claw_wallet_sdk WalletBind 示例）
 * @param {string} messageHashHex - 后端/页面下发的 message_hash_hex
 * @returns {Promise<Record<string, unknown>>}
 */
async function bindClawWallet(messageHashHex) {
  const message_hash_hex = messageHashHex
  const cfg = loadClawConfig()
  assertClawConfig(cfg)
  const client = new ClawSandboxClient(clawSignerConfig(cfg))
  return client.bindWallet({ message_hash_hex })
}

function formatEnvLine(key, value) {
  const s = String(value)
  if (/[\s#'"]/.test(s)) return `${key}=${JSON.stringify(s)}`
  return `${key}=${s}`
}

/**
 * 将 EVM 地址与 Steem 材料合并写入 tagclaw-wallet/.env（保留其它已有行）
 * 键名与 POST /tagclaw/register 一致：ethAddr → TAGCLAW_ETH_ADDR；steemKeys.* → TAGCLAW_STEEM_*
 * @param {{ address: string, steemKeys: object }} data
 */
function mergeTagclawWalletEnv(data) {
  const { address, steemKeys } = data
  const envPath = path.join(WALLET_ROOT, '.env')
  const keysToSet = new Set([
    'TAGCLAW_ETH_ADDR',
    'TAGCLAW_STEEM_POSTING_PUB',
    'TAGCLAW_STEEM_POSTING_PRI',
    'TAGCLAW_STEEM_OWNER',
    'TAGCLAW_STEEM_ACTIVE',
    'TAGCLAW_STEEM_MEMO'
  ])
  const entries = {
    TAGCLAW_ETH_ADDR: address,
    TAGCLAW_STEEM_POSTING_PUB: steemKeys.postingPub,
    TAGCLAW_STEEM_POSTING_PRI: steemKeys.postingPri,
    TAGCLAW_STEEM_OWNER: steemKeys.owner,
    TAGCLAW_STEEM_ACTIVE: steemKeys.active,
    TAGCLAW_STEEM_MEMO: steemKeys.memo
  }
  const lines = []
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
      if (m && keysToSet.has(m[1])) continue
      lines.push(line)
    }
  }
  const tail = Object.entries(entries).map(([k, v]) => formatEnvLine(k, v))
  const body = [...lines, ...tail].join('\n').trimEnd()
  fs.writeFileSync(envPath, (body ? body + '\n' : tail.join('\n') + '\n'), 'utf8')
  return envPath
}

/** 拉取 Claw 地址 + 派生 Steem 并写入 .env */
async function syncTagclawWalletEnv(opts = {}) {
  const rpcUrl = opts.rpcUrl || DEFAULT_BNB_RPC
  const steemKeys = opts.steemKeys || (await generateSteemKeysFromClaw({ rpcUrl }))
  const address = await getClawWalletAddress()
  const envPath = mergeTagclawWalletEnv({ address, steemKeys })
  return { address, steemKeys, envPath }
}

/**
 * Query native BNB balance for an address (BNB Chain / BSC)
 * @param {string} address - 0x-prefixed address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ wei: string, ether: string }>} balance in wei string and ether string
 */
async function getBnbBalance(address, rpcUrl = DEFAULT_BNB_RPC) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wei = await provider.getBalance(address)
  const ether = ethers.formatEther(wei)
  return { wei: wei.toString(), ether }
}

// Pump/Swap constants aligned with tiptag-ui
const WETH = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const UNISWAP_V2_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
const UNISWAP_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
const PCS_CL_POOL_MANAGER = '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b'
const WRAP_SWAPER = '0x4cA57c64DFe1cF1be977093C75f9d9cdd1DD2E10'
const WRAP_SWAPER2 = '0x72D353c0469C10F6B769F13b67EEdB2E1F26FB01'
const IPSHARE1 = '0x7B0ddC305C32AAEbabc0FE372a4460e9903e95D0'
const IPSHARE2 = '0x24328DccA1bA54EeE82e2993F021802e64290486'
const IPSHARE_CONTRACT = '0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922'
const IPSHARE_DECIMALS = 18
const PUMP_CONTRACTS = {
  1: '0xa77253Ac630502A35A6FcD210A01f613D33ba7cD',
  2: '0x3DC52C69C3C8be568372E16d50E9F3FEc796610c',
  3: '0xc9FaA3c05a5178C380d9C28Edffa38d90D606F22',
  4: '0x0476571a77Cc8Fc28796935Cf173c265F2021448',
  5: '0x2cAbfDE43f93422fFb070f0Fa03d2951dbBC7749',
  6: '0x201308B193bC0Aa81Ac540A7D3B3ADb530a39861',
  7: '0x3E75E2db40E7cc9C7d7869Fc2d97eDAb01724212'
}
const ZERO_ADDRESS = ethers.ZeroAddress
const MAX_UINT256 = ethers.MaxUint256
const DEFAULT_DEADLINE_SECONDS = 300n
const TOKEN_PRICE_UNIT = 10n ** 18n
const Q192 = 2n ** 192n

/**
 * Query ERC20 token balance on BNB Chain for an address
 * @param {string} address - 0x-prefixed holder address
 * @param {string} tokenContractAddress - 0x-prefixed ERC20 contract address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ raw: string, formatted: string, symbol: string, decimals: number }>}
 */
async function getErc20Balance(address, tokenContractAddress, rpcUrl = DEFAULT_BNB_RPC) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const contract = new ethers.Contract(tokenContractAddress, ERC20_BALANCE_ABI, provider)
  const [raw, decimals, symbol] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals(),
    contract.symbol().catch(() => 'UNKNOWN')
  ])
  const formatted = ethers.formatUnits(raw, decimals)
  return {
    raw: raw.toString(),
    formatted,
    symbol: symbol || 'UNKNOWN',
    decimals: Number(decimals)
  }
}

/**
 * Transfer native BNB to a target address
 * @param {string} [privateKey] - 本地私钥；省略则使用 Claw
 * @param {string} toAddress - recipient address, 0x-prefixed
 * @param {string} amount - amount as wei string or ether string (e.g. "0.01")
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @param {{ gasLimit?: string | bigint }} [opts] - optional tx settings, e.g. gasLimit
 * @returns {Promise<{ hash: string, from: string, to: string, value: string }>} tx hash and basic info
 */
async function transferBnb(privateKey, toAddress, amount, rpcUrl = DEFAULT_BNB_RPC, opts = {}) {
  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  // If amount includes a decimal point/exponent, treat as ether units; otherwise wei string
  const valueWei = amount.includes('.') || amount.includes('e') || amount.includes('E')
    ? ethers.parseEther(amount)
    : BigInt(amount)

  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: valueWei,
    ...(opts.gasLimit != null && { gasLimit: opts.gasLimit })
  })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    from: receipt.from,
    to: toAddress,
    value: valueWei.toString()
  }
}

/**
 * Transfer ERC20 to a target address
 * @param {string} [privateKey] - 本地私钥；省略则使用 Claw
 * @param {string} tokenContractAddress - ERC20 contract address, 0x-prefixed
 * @param {string} toAddress - recipient address, 0x-prefixed
 * @param {string} amount - human-readable amount, converted using token decimals
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @param {{ gasLimit?: string | bigint }} [opts] - optional tx settings, e.g. gasLimit
 * @returns {Promise<{ hash: string, from: string, to: string, token: string, value: string }>}
 */
async function transferErc20(privateKey, tokenContractAddress, toAddress, amount, rpcUrl = DEFAULT_BNB_RPC, opts = {}) {
  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const contract = new ethers.Contract(tokenContractAddress, ERC20_TRANSFER_ABI, wallet)
  const decimals = await contract.decimals()
  const amountRaw = ethers.parseUnits(amount, decimals)
  const transferOverrides = opts.gasLimit != null ? { gasLimit: opts.gasLimit } : {}
  const tx = await contract.transfer(toAddress, amountRaw, transferOverrides)
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    from: receipt.from,
    to: toAddress,
    token: tokenContractAddress,
    value: amountRaw.toString()
  }
}

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

function calcMinBySlippage(amount, slippageBps) {
  return amount * BigInt(10000 - slippageBps) / 10000n
}

function getReadableError(e) {
  if (!e) return 'unknown error'
  if (typeof e === 'string') return e
  return e.shortMessage || e.reason || e.message || String(e)
}

function throwWalletError(code, detail) {
  throw new Error(`${code}: ${detail}`)
}

function formatIpShareAmount(amount) {
  return ethers.formatUnits(amount, IPSHARE_DECIMALS)
}

function formatUnlockTime(unlockTime) {
  if (unlockTime <= 0n) return null
  return new Date(Number(unlockTime) * 1000).toISOString()
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

function getIpShareContract(runner) {
  return new ethers.Contract(IPSHARE_CONTRACT, IPSHARE_ABI, runner)
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

async function getBuyAmountUseEth(token, ethAmount, provider) {
  const router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_ROUTER_ABI, provider)
  const amounts = await router.getAmountsOut(ethAmount, [WETH, token])
  return amounts[amounts.length - 1]
}

async function getSellAmountUseToken(token, tokenAmount, provider) {
  const router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_ROUTER_ABI, provider)
  const amounts = await router.getAmountsOut(tokenAmount, [token, WETH])
  return amounts[amounts.length - 1] * 9800n / 10000n
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

async function getUnlistedBuyAmount(token, version, ethAmount, provider) {
  const pumpAddress = PUMP_CONTRACTS[Number(version)]
  if (!pumpAddress) {
    throwWalletError('INVALID_VERSION', `unsupported version=${version}`)
  }
  const tokenContract = new ethers.Contract(token, TOKEN_SUPPLY_ABI, provider)
  const pumpContract = new ethers.Contract(pumpAddress, PUMP_QUOTE_ABI, provider)
  const supply = await tokenContract.bondingCurveSupply()
  const afterFee = ethAmount * 9800n / 10000n
  return pumpContract.getBuyAmountByValue(supply, afterFee)
}

async function getUnlistedSellAmount(token, version, tokenAmount, provider) {
  const pumpAddress = PUMP_CONTRACTS[Number(version)]
  if (!pumpAddress) {
    throwWalletError('INVALID_VERSION', `unsupported version=${version}`)
  }
  const tokenContract = new ethers.Contract(token, TOKEN_SUPPLY_ABI, provider)
  const pumpContract = new ethers.Contract(pumpAddress, PUMP_QUOTE_ABI, provider)
  const supply = await tokenContract.bondingCurveSupply()
  return pumpContract.getSellPriceAfterFee(supply, tokenAmount)
}

async function getBnbPriceUsd() {
  const url = `${_config.apiUrl}/tiptag/getETHPrice`

  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      throwWalletError('BNB_PRICE_FETCH_FAILED', `HTTP ${resp.status} for ${url}`)
    }

    const text = await resp.text()
    if (!text) {
      throwWalletError('BNB_PRICE_FETCH_FAILED', 'empty response body')
    }

    let raw = text
    try {
      raw = JSON.parse(text)
    } catch {
      // Keep raw text when the endpoint returns a plain number string.
    }

    return parseNumericApiValue(raw, 'BNB_PRICE_FETCH_FAILED')
  } catch (e) {
    const detail = getReadableError(e)
    if (detail.startsWith('BNB_PRICE_FETCH_FAILED:')) {
      throw e
    }
    throwWalletError('BNB_PRICE_FETCH_FAILED', detail)
  }
}

async function getPairPriceInBnb(token, pair, provider) {
  const pairContract = new ethers.Contract(pair, PAIR_ABI, provider)
  const [reserves, token0] = await Promise.all([
    pairContract.getReserves(),
    pairContract.token0()
  ])
  const [reserve0, reserve1] = reserves
  const reserve0Value = toTokenUnitNumber(reserve0)
  const reserve1Value = toTokenUnitNumber(reserve1)

  if (reserve0Value <= 0 || reserve1Value <= 0) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `invalid reserves for pair=${pair}`)
  }

  return String(token0).toLowerCase() === String(token).toLowerCase()
    ? reserve1Value / reserve0Value
    : reserve0Value / reserve1Value
}

async function resolvePairAddress(token, pair, provider) {
  if (pair && ethers.isAddress(pair)) {
    return pair
  }

  const factory = new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, provider)
  const resolvedPair = await factory.getPair(token, WETH)
  if (!resolvedPair || resolvedPair === ZERO_ADDRESS) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `no pair found for token=${token}`)
  }

  return resolvedPair
}

async function getV7PoolPriceInBnb(poolId, provider) {
  const manager = new ethers.Contract(PCS_CL_POOL_MANAGER, CL_POOL_MANAGER_ABI, provider)
  const [sqrtPriceX96] = await manager.getSlot0(poolId)
  if (sqrtPriceX96 === 0n) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `pool=${poolId} returned zero price`)
  }

  // 与前端口径保持一致：sqrtPriceX96^2 / 2^192 即 1 个 token 的 BNB 价格。
  const scaledPrice = sqrtPriceX96 * sqrtPriceX96 * TOKEN_PRICE_UNIT / Q192
  const price = toTokenUnitNumber(scaledPrice)
  if (price <= 0) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `pool=${poolId} returned invalid price`)
  }
  return price
}

async function getBondingCurvePriceInBnb(token, version, provider) {
  const pumpAddress = PUMP_CONTRACTS[Number(version)]
  if (!pumpAddress) {
    throwWalletError('INVALID_VERSION', `unsupported version=${version}`)
  }

  const tokenContract = new ethers.Contract(token, TOKEN_SUPPLY_ABI, provider)
  const pumpContract = new ethers.Contract(pumpAddress, PUMP_QUOTE_ABI, provider)
  const supply = await tokenContract.bondingCurveSupply()
  const rawPrice = await pumpContract.getPrice(supply, TOKEN_PRICE_UNIT)
  const price = toTokenUnitNumber(rawPrice)

  if (price <= 0) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `curve price is zero for token=${token}`)
  }

  return price
}

async function getTokenPriceInBnb(tokenInfo, rpcUrl = DEFAULT_BNB_RPC) {
  const { token, version, listed, isImport, pair } = tokenInfo || {}
  if (!token || !ethers.isAddress(token)) {
    throwWalletError('INVALID_TOKEN_INFO', 'token must be a valid address')
  }
  if (!Number.isInteger(version) || version <= 0) {
    throwWalletError('INVALID_TOKEN_INFO', `invalid version=${version}`)
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)

  try {
    if (!listed) {
      return await getBondingCurvePriceInBnb(token, version, provider)
    }

    if (Number(version) === 7 && pair && isBytes32Hex(pair)) {
      return await getV7PoolPriceInBnb(pair, provider)
    }

    if (isImport) {
      if (!pair || !ethers.isAddress(pair)) {
        throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `import token requires pair address, token=${token}`)
      }
      return await getPairPriceInBnb(token, pair, provider)
    }

    const resolvedPair = await resolvePairAddress(token, pair, provider)
    return await getPairPriceInBnb(token, resolvedPair, provider)
  } catch (e) {
    const detail = getReadableError(e)
    if (
      detail.startsWith('INVALID_TOKEN_INFO:') ||
      detail.startsWith('INVALID_VERSION:') ||
      detail.startsWith('TOKEN_PRICE_QUOTE_FAILED:')
    ) {
      throw e
    }
    throwWalletError('TOKEN_PRICE_QUERY_FAILED', detail)
  }
}

/**
 * Query token price by tick.
 * @param {Object} params
 * @param {string} params.tick - token symbol used by community detail API
 * @param {string} [params.rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{
 *   tick: string,
 *   token: string,
 *   version: number,
 *   listed: boolean,
 *   isImport: boolean,
 *   pair: string | null,
 *   bnbPriceUsd: number,
 *   tokenPriceInBnb: number,
 *   tokenPriceUsd: number
 * }>}
 */
async function getTokenPrice(params) {
  const { tick, rpcUrl = DEFAULT_BNB_RPC } = params || {}
  if (!tick || typeof tick !== 'string') {
    throwWalletError('INVALID_TICK', 'tick is required')
  }

  const normalizedTick = tick.trim()
  if (!normalizedTick) {
    throwWalletError('INVALID_TICK', 'tick is required')
  }

  const tokenInfo = await fetchTokenInfo(normalizedTick)
  const { token, version, listed, isImport, pair } = tokenInfo

  if (!token || !ethers.isAddress(token)) {
    throwWalletError('INVALID_TOKEN_INFO', 'invalid token address from API')
  }
  if (!Number.isInteger(version) || version <= 0) {
    throwWalletError('INVALID_TOKEN_INFO', 'invalid version from API')
  }

  const [bnbPriceUsd, tokenPriceInBnb] = await Promise.all([
    getBnbPriceUsd(),
    getTokenPriceInBnb(tokenInfo, rpcUrl)
  ])

  return {
    tick: normalizedTick,
    token,
    version,
    listed,
    isImport,
    pair,
    bnbPriceUsd,
    tokenPriceInBnb,
    tokenPriceUsd: tokenPriceInBnb * bnbPriceUsd
  }
}

/**
 * Buy token (aligned with tiptag-ui src/utils/pump.ts buyToken branch logic)
 * version / listed / isImport 会自动通过 community detail API 获取，无需外部传入
 * @param {Object} params
 * @param {string} [params.privateKey] - 本地私钥；省略则使用 Claw 沙箱签名
 * @param {string} params.tick - 代币名称（区分大小写）
 * @param {string|bigint|number} params.ethAmount - input BNB amount (wei)
 * @param {string|null|undefined} [params.sellsman] - referrer address, 默认零地址
 * @param {number} [params.slippage=200] - slippage in bps, 默认 200 即 2%
 * @param {string} [params.rpcUrl] - RPC URL
 * @param {string} [params.signature] - required when version=5 and listed=false
 * @returns {Promise<{ hash: string, route: string, expectedAmount: string, amountOutMin?: string }>}
 */
async function buyToken(params) {
  const {
    privateKey,
    tick,
    ethAmount,
    sellsman,
    slippage = 200,
    rpcUrl = DEFAULT_BNB_RPC,
    signature
  } = params

  if (!tick) throw new Error('tick is required')

  const tokenInfo = await fetchTokenInfo(tick)
  const { token, version, listed, isImport } = tokenInfo

  if (!token || !ethers.isAddress(token)) throw new Error('invalid token address from API')
  if (!Number.isInteger(version) || version <= 0) throw new Error('invalid version from API')

  if (ethAmount == null || ethAmount === '') {
    throwWalletError('INVALID_ETH_AMOUNT', 'ethAmount is required')
  }

  const ethAmountBn = BigInt(ethAmount)
  if (ethAmountBn <= 0n) {
    throwWalletError('INVALID_ETH_AMOUNT', 'ethAmount must be greater than 0')
  }
  const slippageBps = normalizeSlippage(slippage)
  const sellsmanAddr = normalizeSellsman(sellsman)

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  await ensureNativeBalance(provider, wallet.address, ethAmountBn, 'buy requires ethAmount balance')

  try {
    let expectedAmount
    if (listed) {
      // Keep parity with frontend: apply 2% fee before quote, then apply slippage protection
      expectedAmount = await getBuyAmountUseEth(token, ethAmountBn * 9800n / 10000n, provider)
      const amountOutMin = calcMinBySlippage(expectedAmount, slippageBps)
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECONDS

      if (isImport) {
        const wrap = new ethers.Contract(WRAP_SWAPER2, WRAP_SWAPER2_ABI, wallet)
        const tx = await wrap.buyToken(
          sellsmanAddr,
          amountOutMin,
          [WETH, token],
          wallet.address,
          deadline,
          UNISWAP_V2_ROUTER,
          { value: ethAmountBn }
        )
        const receipt = await tx.wait()
        return {
          hash: receipt.hash,
          route: 'listed-import-wrap2-buy',
          expectedAmount: expectedAmount.toString(),
          amountOutMin: amountOutMin.toString()
        }
      }

      const wrap = new ethers.Contract(WRAP_SWAPER, WRAP_SWAPER_ABI, wallet)
      const ipshare = Number(version) === 1 ? IPSHARE1 : IPSHARE2

      const tx = await wrap.buyToken(
        sellsmanAddr,
        amountOutMin,
        [WETH, token],
        wallet.address,
        deadline,
        ipshare,
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return {
        hash: receipt.hash,
        route: 'listed-wrap-buy',
        expectedAmount: expectedAmount.toString(),
        amountOutMin: amountOutMin.toString()
      }
    }

    expectedAmount = await getUnlistedBuyAmount(token, version, ethAmountBn, provider)
    if (expectedAmount <= 0n) {
      throwWalletError('QUOTE_FAILED', 'computed expected token amount is 0')
    }

    if (Number(version) === 1) {
      const contract = new ethers.Contract(token, TOKEN1_BUY_ABI, wallet)
      const tx = await contract.buyToken(
        expectedAmount,
        sellsmanAddr,
        slippageBps,
        ZERO_ADDRESS,
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return { hash: receipt.hash, route: 'unlisted-token1-buy', expectedAmount: expectedAmount.toString() }
    }

    if (Number(version) === 5) {
      if (!signature) {
        throwWalletError('INVALID_SIGNATURE_FOR_V5_UNLISTED', 'version=5 and listed=false requires signature')
      }
      const contract = new ethers.Contract(token, TOKEN5_BUY_ABI, wallet)
      const tx = await contract.buyToken(
        expectedAmount,
        sellsmanAddr,
        slippageBps,
        signature,
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return { hash: receipt.hash, route: 'unlisted-token5-buy', expectedAmount: expectedAmount.toString() }
    }

    const contract = new ethers.Contract(token, TOKEN_BUY_ABI, wallet)
    const tx = await contract.buyToken(expectedAmount, sellsmanAddr, slippageBps, { value: ethAmountBn })
    const receipt = await tx.wait()
    return { hash: receipt.hash, route: 'unlisted-tokenN-buy', expectedAmount: expectedAmount.toString() }
  } catch (e) {
    throwWalletError('BUY_TOKEN_FAILED', getReadableError(e))
  }
}

/**
 * Sell token (aligned with tiptag-ui src/utils/pump.ts sellToken branch logic)
 * version / listed / isImport 会自动通过 community detail API 获取，无需外部传入
 * @param {Object} params
 * @param {string} [params.privateKey] - 本地私钥；省略则使用 Claw
 * @param {string} params.tick - 代币名称（区分大小写）
 * @param {string|bigint|number} params.amount - token amount to sell (raw)
 * @param {string|null|undefined} [params.sellsman] - referrer address, 默认零地址
 * @param {number} [params.slippage=200] - slippage in bps, 默认 200 即 2%
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, route: string, approveHash?: string | null, amountOutMin?: string }>}
 */
async function sellToken(params) {
  const {
    privateKey,
    tick,
    amount,
    sellsman,
    slippage = 200,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  if (!tick) throw new Error('tick is required')

  const tokenInfo = await fetchTokenInfo(tick)
  const { token, version, listed, isImport } = tokenInfo

  if (!token || !ethers.isAddress(token)) throw new Error('invalid token address from API')
  if (!Number.isInteger(version) || version <= 0) throw new Error('invalid version from API')
  if (amount == null || amount === '') {
    throwWalletError('INVALID_TOKEN_AMOUNT', 'amount is required')
  }

  const amountBn = BigInt(amount)
  if (amountBn <= 0n) {
    throwWalletError('INVALID_TOKEN_AMOUNT', 'amount must be greater than 0')
  }
  const slippageBps = normalizeSlippage(slippage)
  const sellsmanAddr = normalizeSellsman(sellsman)

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  await ensureTokenBalance(provider, token, wallet.address, amountBn)

  try {
    if (listed) {
      const spender = isImport ? WRAP_SWAPER2 : WRAP_SWAPER
      const approveResult = await ensureAllowance(token, wallet.address, spender, amountBn, wallet)
      const expectedReceive = await getSellAmountUseToken(token, amountBn, provider)
      const amountOutMin = calcMinBySlippage(expectedReceive, slippageBps)
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECONDS

      if (isImport) {
        const wrap = new ethers.Contract(WRAP_SWAPER2, WRAP_SWAPER2_ABI, wallet)
        const tx = await wrap.sellToken(
          amountBn,
          amountOutMin,
          [token, WETH],
          wallet.address,
          deadline,
          sellsmanAddr,
          UNISWAP_V2_ROUTER
        )
        const receipt = await tx.wait()
        return {
          hash: receipt.hash,
          route: 'listed-import-wrap2-sell',
          approveHash: approveResult.hash,
          expectedReceive: expectedReceive.toString(),
          amountOutMin: amountOutMin.toString()
        }
      }

      const wrap = new ethers.Contract(WRAP_SWAPER, WRAP_SWAPER_ABI, wallet)
      const ipshare = Number(version) === 1 ? IPSHARE1 : IPSHARE2
      const tx = await wrap.sellToken(
        amountBn,
        amountOutMin,
        [token, WETH],
        wallet.address,
        deadline,
        sellsmanAddr,
        ipshare
      )
      const receipt = await tx.wait()
      return {
        hash: receipt.hash,
        route: 'listed-wrap-sell',
        approveHash: approveResult.hash,
        expectedReceive: expectedReceive.toString(),
        amountOutMin: amountOutMin.toString()
      }
    }

    // Keep parity with frontend: in unlisted branch, quote receiveEth first, then call sellToken
    const expectedReceive = await getUnlistedSellAmount(token, version, amountBn, provider)
    if (expectedReceive <= 0n) {
      throwWalletError('QUOTE_FAILED', 'computed expected receive ETH is 0')
    }

    const contract = new ethers.Contract(token, TOKEN_SELL_ABI, wallet)
    const tx = await contract.sellToken(amountBn, expectedReceive, sellsmanAddr, slippageBps)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      route: 'unlisted-token-sell',
      expectedReceive: expectedReceive.toString()
    }
  } catch (e) {
    throwWalletError('SELL_TOKEN_FAILED', getReadableError(e))
  }
}

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
  configure,
  RegisterSteemMessage,
  generateSteemKeys,
  generateSteemKeysFromClaw,
  signMessage,
  getClawWalletAddress,
  bindClawWallet,
  syncTagclawWalletEnv,
  mergeTagclawWalletEnv,
  getBnbBalance,
  getErc20Balance,
  getTokenPrice,
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
  IPSHARE_CONTRACT,
  DEFAULT_BNB_RPC
}
