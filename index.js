/**
 * tagclaw-wallet — 极简钱包能力，供 Agent 在本机使用
 * 仅依赖: ethers, steem（无 js-sha256/bs58，用 Node 内置 crypto + 内联 base58）
 */
const crypto = require('crypto')
const { ethers } = require('ethers')
const steem = require('steem')

const STEEM_USERNAME = 'tagai'

// Base58 字母表（与 Steem/Bitcoin 一致），内联实现，无第三方包
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer) {
  const hex = buffer.length ? buffer.toString('hex') : ''
  if (!hex) return '' // 空 buffer 避免 BigInt('0x') 报错
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

/** 从 EVM 私钥生成 Steem brain key（WIF 格式） */
function brainKeyFromEvmPrivateKey(evmPrivateKey) {
  const pk = '0x80' + evmPrivateKey.replace(/^0x/, '')
  const first = sha256Hex(pk)
  const second = sha256Hex(first)
  const checksum = second.slice(0, 4)
  const privateWif = pk + checksum
  const result = 'P' + base58Encode(Buffer.from(privateWif, 'hex'))
  return result
}

/**
 * 在本机生成新的 EVM 钱包
 * @returns {{ address, privateKey }}
 */
function createWallet() {
  const wallet = ethers.Wallet.createRandom()
  return { address: wallet.address, privateKey: wallet.privateKey }
}

/**
 * 从 EVM 私钥生成 Steem 各角色密钥（与 TagClaw 注册所需格式一致）
 * @param {string} evmPrivateKey - 0x 开头的私钥
 * @returns {{ postingPub, postingPri, owner, active, memo }}
 */
function generateSteemKeys(evmPrivateKey) {
  console.log(53, evmPrivateKey)
  const pass = brainKeyFromEvmPrivateKey(evmPrivateKey.replace(/^0x/, ''))
  console.log(57, pass)
  const ownerKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['owner'])
  const activeKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['active'])
  const postingKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['posting'])
  const memoKey = steem.auth.getPrivateKeys(STEEM_USERNAME, pass, ['memo'])
  console.log(63, postingKey, ownerKey, activeKey, memoKey)
  return {
    postingPub: steem.auth.wifToPublic(postingKey.posting),
    postingPri: postingKey.posting,
    owner: steem.auth.wifToPublic(ownerKey.owner),
    active: steem.auth.wifToPublic(activeKey.active),
    memo: steem.auth.wifToPublic(memoKey.memo)
  }
}

/**
 * 生成钱包 + Steem 密钥
 * @returns {{ address, privateKey, steemKeys }}
 */
function createWalletAndSteemKeys() {
  const { address, privateKey } = createWallet()
  const steemKeys = generateSteemKeys(privateKey)
  return { address, privateKey, steemKeys }
}

/**
 * 使用 EVM 私钥对消息签名（personal_sign / eth_sign 格式）
 * @param {string} privateKey - 0x 开头的私钥
 * @param {string} message - 原文（UTF-8）
 * @returns {Promise<string>} 签名十六进制字符串（0x 开头）
 */
async function signMessage(privateKey, message) {
  const wallet = new ethers.Wallet(privateKey)
  return wallet.signMessage(message)
}

// BNB Chain (BSC) 默认 RPC，可通过环境变量 TAGCLAW_BNB_RPC 覆盖
const DEFAULT_BNB_RPC = process.env.TAGCLAW_BNB_RPC || 'https://bsc-dataseed2.binance.org'

/**
 * 查询地址的 BNB 原生代币余额（BNB Chain / BSC）
 * @param {string} address - 0x 开头的地址
 * @param {string} [rpcUrl] - RPC 地址，不传则用 DEFAULT_BNB_RPC
 * @returns {Promise<{ wei: string, ether: string }>} 余额（wei 字符串与 ether 单位字符串）
 */
async function getBnbBalance(address, rpcUrl = DEFAULT_BNB_RPC) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wei = await provider.getBalance(address)
  const ether = ethers.formatEther(wei)
  return { wei: wei.toString(), ether }
}

// 查询 ERC20 余额所需的最小 ABI（balanceOf, decimals, symbol）
const ERC20_BALANCE_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]

/**
 * 查询地址在 BNB Chain 上某 ERC20 合约中的代币余额
 * @param {string} address - 0x 开头的持有者地址
 * @param {string} tokenContractAddress - 0x 开头的 ERC20 合约地址
 * @param {string} [rpcUrl] - RPC 地址，不传则用 DEFAULT_BNB_RPC
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

module.exports = {
  createWallet,
  generateSteemKeys,
  createWalletAndSteemKeys,
  signMessage,
  getBnbBalance,
  getErc20Balance,
  DEFAULT_BNB_RPC
}
