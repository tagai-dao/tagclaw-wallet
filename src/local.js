import fs from 'node:fs'
import path from 'node:path'
import { ethers } from 'ethers'
import { WALLET_ROOT, readWalletEnv } from './config.js'

/** Restore the original in-memory wallet API. Call initWallet to persist it. */
function createWallet() {
  const wallet = ethers.Wallet.createRandom()
  return { address: wallet.address, privateKey: wallet.privateKey }
}

function hasClawWallet() {
  return Boolean(
    process.env.CLAY_SANDBOX_URL || process.env.CLAY_UID || process.env.CLAY_AGENT_TOKEN ||
    fs.existsSync(path.join(WALLET_ROOT, '.env.clay')) ||
    fs.existsSync(path.join(WALLET_ROOT, 'identity.json'))
  )
}

function getWalletBackend(privateKey) {
  if (privateKey) return 'local'
  const env = readWalletEnv()
  const backend = (env.TAGCLAW_WALLET_BACKEND || '').trim()
  if (backend && backend !== 'local' && backend !== 'claw') {
    throw new Error('TAGCLAW_WALLET_BACKEND must be local or claw')
  }
  if (backend) return backend
  if (env.TAGCLAW_PRIVATE_KEY) return 'local'
  return hasClawWallet() ? 'claw' : 'local'
}

/** Validate without including secret material in error messages. */
function getLocalPrivateKey(privateKey) {
  if (getWalletBackend(privateKey) === 'claw') return undefined
  const value = privateKey || readWalletEnv().TAGCLAW_PRIVATE_KEY
  if (!value) {
    throw new Error('Local wallet private key missing. Run setup.sh / setup.ps1 for a new wallet, or restore TAGCLAW_PRIVATE_KEY for an existing wallet.')
  }
  try {
    return new ethers.Wallet(String(value).trim()).privateKey
  } catch {
    throw new Error('Invalid EVM private key; expected a valid 32-byte hex key')
  }
}

export { createWallet, hasClawWallet, getWalletBackend, getLocalPrivateKey }
