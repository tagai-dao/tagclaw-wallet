import { ethers } from 'ethers'
import { CHAIN_ID } from './deployment.mjs'

export function walletPayload(input, now = Math.floor(Date.now() / 1000)) {
  if (!input || input.kind !== 'unsigned-transaction-plan' || input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new Error('INVALID_TRANSACTION_PLAN')
  if (input.chainId !== CHAIN_ID || !Array.isArray(input.transactions) || input.transactions.length !== 1) throw new Error('INVALID_PLAN_CHAIN_OR_TRANSACTION_COUNT')
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now) throw new Error('PLAN_EXPIRED: rebuild before wallet preview')
  if (!Number.isSafeInteger(input.blockNumber) || input.blockNumber < 0 || !ethers.isHexString(input.blockHash, 32) || !Number.isSafeInteger(input.blockTimestamp) || input.blockTimestamp < 0 || input.expiresAt <= input.blockTimestamp || input.expiresAt > input.blockTimestamp + 300) throw new Error('INVALID_PLAN_SNAPSHOT')
  const transaction = input.transactions[0]
  if (!transaction || transaction.chainId !== CHAIN_ID) throw new Error('INVALID_TRANSACTION_CHAIN')
  if (Object.keys(transaction).some(field => !['chainId', 'from', 'to', 'value', 'data', 'inputData', 'method'].includes(field))) throw new Error('UNSUPPORTED_TRANSACTION_FIELDS: wallet gas and nonce options need explicit handling')
  const addresses = ['from', 'to'].map(field => {
    if (!ethers.isAddress(transaction[field]) || transaction[field].toLowerCase() === ethers.ZeroAddress) throw new Error(`INVALID_TRANSACTION_${field.toUpperCase()}`)
    return ethers.getAddress(transaction[field])
  })
  const [from, to] = addresses
  if (typeof transaction.value !== 'string' || !/^\d+$/.test(transaction.value) || BigInt(transaction.value) > ethers.MaxUint256) throw new Error('INVALID_TRANSACTION_VALUE: use decimal wei string')
  const value = BigInt(transaction.value).toString()
  const data = transaction.data ?? transaction.inputData
  if (typeof data !== 'string' || !/^0x(?:[0-9a-f]{2}){4,}$/i.test(data)) throw new Error('INVALID_TRANSACTION_DATA')
  if (transaction.inputData !== undefined && String(transaction.inputData).toLowerCase() !== data.toLowerCase()) throw new Error('TRANSACTION_DATA_MISMATCH')
  return {
    schemaVersion: 1,
    kind: 'external-wallet-handoff',
    status: 'UNSIGNED',
    walletIncluded: false,
    action: input.action,
    chainId: CHAIN_ID,
    expiresAt: input.expiresAt,
    snapshot: { blockNumber: input.blockNumber, blockHash: input.blockHash, blockTimestamp: input.blockTimestamp, multicall: input.multicall },
    transaction: { chainId: CHAIN_ID, from, to, value, data },
    review: { quote: input.quote ?? null, fees: input.fees ?? null, gasCheck: input.gasCheck ?? null, authorityChange: input.authorityChange ?? null, predictedToken: input.predictedToken ?? null, indexConfig: input.indexConfig ?? null,
      ...(input.tradeNote ? { publicMessage: {text:input.tradeNote.text,conf:input.tradeNote.conf,follow:input.tradeNote.follow??null,commitment:input.tradeNote.commitment} } : {}) },
    requiresWalletPreview: true,
    requiresUserAuthorization: true,
    rebuildAfterConfirmation: input.rebuildAfterConfirmation === true,
    walletRequests: {
      binance: { operation: 'contract-call preview', parameters: { binanceChainId: String(CHAIN_ID), from, to, value, inputData: data } },
      eip1193: { requiredChainId: ethers.toQuantity(CHAIN_ID), request: { method: 'eth_sendTransaction', params: [{ from, to, value: ethers.toQuantity(BigInt(value)), data }] } }
    }
  }
}
