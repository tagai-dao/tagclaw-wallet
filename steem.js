/**
 * Steem 密钥派生：base58 编码、brain key 生成、角色密钥派生
 * 纯函数模块，无副作用
 */
const crypto = require('crypto')
const steemAuth = require('@steemit/steem-js/lib/auth')
const { STEEM_USERNAME } = require('./constants')

// Base58 alphabet (Steem/Bitcoin compatible), implemented inline without third-party deps
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer) {
  const hex = buffer.length ? buffer.toString('hex') : ''
  if (!hex) return ''
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

function steemKeysFromBrainPass(pass) {
  const ownerKey = steemAuth.getPrivateKeys(STEEM_USERNAME, pass, ['owner'])
  const activeKey = steemAuth.getPrivateKeys(STEEM_USERNAME, pass, ['active'])
  const postingKey = steemAuth.getPrivateKeys(STEEM_USERNAME, pass, ['posting'])
  const memoKey = steemAuth.getPrivateKeys(STEEM_USERNAME, pass, ['memo'])
  return {
    postingPub: steemAuth.wifToPublic(postingKey.posting),
    postingPri: postingKey.posting,
    owner: steemAuth.wifToPublic(ownerKey.owner),
    active: steemAuth.wifToPublic(activeKey.active),
    memo: steemAuth.wifToPublic(memoKey.memo)
  }
}

/**
 * 由本地 EVM 私钥派生 Steem（legacy，与 Claw 路径得到的 Steem 密钥不同）
 * @param {string} evmPrivateKey - private key starting with 0x
 * @returns {{ postingPub, postingPri, owner, active, memo }}
 */
function generateSteemKeys(evmPrivateKey) {
  const pass = brainKeyFromEvmPrivateKey(evmPrivateKey.replace(/^0x/, ''))
  return steemKeysFromBrainPass(pass)
}

module.exports = {
  brainKeyFromSecretHex,
  steemKeysFromBrainPass,
  generateSteemKeys
}
