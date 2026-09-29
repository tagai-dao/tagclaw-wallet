import { ethers } from 'ethers'
import { resolveWriteSigner } from './claw.js'

// Internal dependency seam for offline contract tests; production always uses ethers.
export const evm = {
  contract: (address, abi, runner) => new ethers.Contract(address, abi, runner),
  provider: rpcUrl => new ethers.JsonRpcProvider(rpcUrl),
  signer: resolveWriteSigner
}

export async function assertBsc(provider) {
  if ((await provider.getNetwork()).chainId !== 56n) {
    throw new Error('WRONG_CHAIN: these contracts require BSC mainnet (chainId 56)')
  }
}

export async function confirmed(tx) {
  let receipt
  try {
    receipt = await tx.wait()
  } catch (error) {
    throw new Error(`Transaction confirmation failed; check hash ${tx.hash} before retrying: ${error.shortMessage || error.message}`, { cause: error })
  }
  if (!receipt || Number(receipt.status) !== 1) {
    throw new Error(`Transaction not confirmed successfully; check hash ${tx.hash} before retrying`)
  }
  return receipt
}
