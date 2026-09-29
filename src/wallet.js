import fs from 'node:fs'
import path from 'node:path'
import { WALLET_ROOT, readWalletEnv } from './config.js'
import { createWallet, getLocalPrivateKey, getWalletBackend } from './local.js'
import { getClawWalletAddress, syncTagclawWalletEnv } from './claw.js'
import { ethers } from 'ethers'

/** Idempotent bootstrap: create locally only when no existing identity is found. */
async function initWallet(opts = {}) {
  const lockPath = path.join(WALLET_ROOT, '.wallet-init.lock')
  let lock
  try {
    lock = fs.openSync(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Wallet initialization already in progress (.wallet-init.lock)')
    throw error
  }
  try {
    const env = readWalletEnv()
    if (opts.privateKey || env.TAGCLAW_PRIVATE_KEY || getWalletBackend() === 'claw') {
      return await syncTagclawWalletEnv(opts)
    }
    if (env.TAGCLAW_WALLET_BACKEND || Object.keys(env).some(key =>
      (key === 'TAGCLAW_ETH_ADDR' || key.startsWith('TAGCLAW_STEEM_')) && env[key]
    )) {
      throw new Error('Existing wallet identity found without a private key. Restore its key or Claw configuration; refusing to generate a replacement.')
    }
    return await syncTagclawWalletEnv({ ...opts, privateKey: createWallet().privateKey })
  } finally {
    fs.closeSync(lock)
    fs.unlinkSync(lockPath)
  }
}

async function getWalletAddress() {
  const privateKey = getLocalPrivateKey()
  return privateKey ? new ethers.Wallet(privateKey).address : getClawWalletAddress()
}

export { initWallet, getWalletAddress }
