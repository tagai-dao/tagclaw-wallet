/**
 * Claw 沙箱钱包集成：signer 管理、地址查询、绑定、签名、Steem 派生
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ethers } from 'ethers'
import { ClawEthersSigner } from '@claw_wallet_sdk/claw_wallet/ethers'
import { ClawSandboxClient } from '@claw_wallet_sdk/claw_wallet'
import { DEFAULT_BNB_RPC, RegisterSteemMessage } from './constants.js'
import { WALLET_ROOT, mergeTagclawWalletEnv } from './config.js'
import { brainKeyFromSecretHex, steemKeysFromBrainPass, generateSteemKeys } from './steem.js'
import { getLocalPrivateKey, getWalletBackend } from './local.js'

// ─── Claw 配置加载 ───────────────────────────────────

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
  if (!cfg.sandboxUrl || !cfg.uid) {
    throw new Error(
      'Claw wallet: restore CLAY_SANDBOX_URL, CLAY_AGENT_TOKEN (or AGENT_TOKEN), and CLAY_UID (or identity.json uid) from the existing installation. See README Existing Claw Wallet accounts.'
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

// ─── 密钥派生 ─────────────────────────────────────────

/** personal_sign 结果 → 32 字节 hex（SHA256(r‖s‖v)） */
function kdfFromSignatureHex(signatureHex) {
  const sig = ethers.Signature.from(signatureHex)
  const r = Buffer.from(ethers.getBytes(sig.r))
  const s = Buffer.from(ethers.getBytes(sig.s))
  const v = ((Number(sig.v) % 256) + 256) % 256
  const vBuf = Buffer.from([v])
  const packed = Buffer.concat([r, s, vBuf])
  return createHash('sha256').update(packed).digest('hex')
}

// ─── 沙箱钱包就绪检测 ────────────────────────────────

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
  } catch (e) {
    console.error(e)
  }
  if (await tryReady()) return
  throw new Error(
    'Claw wallet not ready: could not read bsc/ethereum address after init/reactivate. Is clay-sandbox running?'
  )
}

// ─── Signer 创建 ─────────────────────────────────────

/** 用于链上读写：无 privateKey 时用 ClawEthersSigner + 公共 BSC RPC */
async function getClawEthersSigner(rpcUrl = DEFAULT_BNB_RPC) {
  const cfg = loadClawConfig()
  assertClawConfig(cfg)
  const client = new ClawSandboxClient(clawSignerConfig(cfg))
  await ensureWalletReadyWithClient(client)
  const address = await getBscOrEthAddress(client)
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ClawEthersSigner(clawSignerConfig(cfg), provider, address)
}

/**
 * 统一 signer 解析：显式私钥 > 已配置的钱包（本地 .env / Claw 沙箱）
 * @param {string} [privateKey]
 * @param {string} [rpcUrl]
 * @returns {Promise<import('ethers').Wallet | ClawEthersSigner>}
 */
async function resolveWriteSigner(privateKey, rpcUrl = DEFAULT_BNB_RPC) {
  const localKey = getLocalPrivateKey(privateKey)
  if (localKey) {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    return new ethers.Wallet(localKey, provider)
  }
  return getClawEthersSigner(rpcUrl)
}

// ─── 公开业务方法 ─────────────────────────────────────

/**
 * Sign a message with EVM private key (personal_sign / eth_sign style)
 * @param {string} [privateKey] - 省略时使用已配置的本地私钥或 Claw 钱包
 * @param {string} message - plain UTF-8 message
 * @returns {Promise<string>} hex signature string (0x-prefixed)
 */
async function signMessage(privateKey, message) {
  const localKey = getLocalPrivateKey(privateKey)
  if (localKey) {
    const wallet = new ethers.Wallet(localKey)
    return wallet.signMessage(message)
  }
  const signer = await getClawEthersSigner()
  return signer.signMessage(message)
}

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
 * 由沙箱对 challenge 哈希签名并经由 relay 完成「绑定代理钱包」
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

/** 同步已配置钱包的地址和 Steem 密钥，保持原有派生算法。 */
async function syncTagclawWalletEnv(opts = {}) {
  const rpcUrl = opts.rpcUrl || DEFAULT_BNB_RPC
  const backend = getWalletBackend(opts.privateKey)
  const privateKey = getLocalPrivateKey(opts.privateKey)
  const steemKeys = opts.steemKeys || (privateKey
    ? generateSteemKeys(privateKey)
    : await generateSteemKeysFromClaw({ rpcUrl }))
  const address = privateKey ? new ethers.Wallet(privateKey).address : await getClawWalletAddress()
  const envPath = mergeTagclawWalletEnv({ address, steemKeys, privateKey, backend })
  return { address, steemKeys, envPath, backend }
}

export {
  resolveWriteSigner,
  signMessage,
  generateSteemKeysFromClaw,
  getClawWalletAddress,
  bindClawWallet,
  syncTagclawWalletEnv
}
