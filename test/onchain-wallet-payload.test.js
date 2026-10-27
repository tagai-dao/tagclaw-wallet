import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'
import { plan } from '../skills/tagclaw-onchain/scripts/lib/prepare.mjs'
import { walletPayload } from '../skills/tagclaw-onchain/scripts/lib/wallet-payload.mjs'
import { MULTICALL3 } from '../skills/tagclaw-onchain/scripts/lib/deployment.mjs'

const from = '0x1111111111111111111111111111111111111111'
const target = '0x2222222222222222222222222222222222222222'
const spender = '0x3333333333333333333333333333333333333333'
const abi = ['function approve(address,uint256) returns(bool)']

function makePlan(timestamp = 1000, value = 0n) {
  const snapshot = {
    block: { timestamp },
    metadata: () => ({ chainId: 56, blockNumber: 123, blockHash: ethers.ZeroHash, blockTimestamp: timestamp, multicall: MULTICALL3 })
  }
  return plan(snapshot, from, 'approve-pool', target, abi, 'approve', [spender, 100n], value, { rebuildAfterConfirmation: true, quote: { minimumOut: '90' } })
}

test('a preparation exports one unsigned wallet handoff with exact decimal and JSON-RPC quantities', () => {
  const input = makePlan(1000, 123456789012345678901234567890n)
  const output = walletPayload(input, 1100)
  assert.equal(input.schemaVersion, 1)
  assert.equal(output.kind, 'external-wallet-handoff')
  assert.equal(output.status, 'UNSIGNED')
  assert.equal(output.walletIncluded, false)
  assert.equal(output.requiresWalletPreview, true)
  assert.equal(output.requiresUserAuthorization, true)
  assert.equal(output.transaction.value, '123456789012345678901234567890')
  const binance = output.walletRequests.binance
  assert.equal(binance.operation, 'contract-call preview')
  assert.deepEqual(binance.parameters, { binanceChainId: '56', from, to: target, value: output.transaction.value, inputData: input.transactions[0].data })
  const generic = output.walletRequests.eip1193
  assert.equal(generic.requiredChainId, '0x38')
  assert.equal(generic.request.method, 'eth_sendTransaction')
  assert.equal(generic.request.params.length, 1)
  assert.equal(BigInt(generic.request.params[0].value), 123456789012345678901234567890n)
  assert.equal(generic.request.params[0].data, binance.parameters.inputData)
  assert.equal(output.rebuildAfterConfirmation, true)
  assert.equal(output.review.quote.minimumOut, '90')
  assert.equal(output.txHash, undefined)
  assert.equal(output.requestId, undefined)
  assert.equal(output.signature, undefined)
})

test('zero-value approvals retain exact calldata and a later swap cannot be hidden in the export', () => {
  const input = makePlan()
  const output = walletPayload(input, 1100)
  assert.equal(output.transaction.value, '0')
  assert.equal(output.walletRequests.eip1193.request.params[0].value, '0x0')
  const decoded = new ethers.Interface(abi).parseTransaction({ data: output.transaction.data })
  assert.equal(decoded.args[0], spender)
  assert.equal(decoded.args[1], 100n)
  assert.equal(output.snapshot.blockNumber, 123)
  assert.equal(output.snapshot.multicall, MULTICALL3)
  assert.throws(() => walletPayload({ ...input, transactions: [...input.transactions, ...input.transactions] }, 1100), /TRANSACTION_COUNT/)
})

test('invalid, expired, wrong-chain and inconsistent transaction plans cannot become wallet requests', () => {
  const cases = [
    input => { input.kind = 'signed-transaction' },
    input => { input.schemaVersion = 2 },
    input => { input.chainId = 1 },
    input => { input.transactions[0].chainId = 1 },
    input => { input.transactions[0].from = ethers.ZeroAddress },
    input => { input.transactions[0].to = 'not-an-address' },
    input => { input.transactions[0].value = 9007199254740992 },
    input => { input.transactions[0].value = '-1' },
    input => { input.transactions[0].value = '0x1' },
    input => { input.transactions[0].value = String(ethers.MaxUint256 + 1n) },
    input => { input.transactions[0].data = '0xabc' },
    input => { input.transactions[0].inputData = '0x12345678' },
    input => { input.transactions[0].gasLimit = '1000000' },
    input => { input.blockHash = '0x1234' },
    input => { input.expiresAt = 1301 },
    input => { input.expiresAt = 1100 }
  ]
  for (const mutate of cases) {
    const input = makePlan()
    mutate(input)
    assert.throws(() => walletPayload(input, 1100))
  }
  assert.throws(() => walletPayload(makePlan(), 1300), /EXPIRED/)
})

test('otherwise-valid historical plans without schemaVersion or the data alias remain exportable', () => {
  const input = makePlan()
  delete input.schemaVersion
  delete input.transactions[0].data
  assert.equal(walletPayload(input, 1100).transaction.data, input.transactions[0].inputData)
})

test('the CLI exports offline without an RPC or installed wallet and describes its preparation-only role', () => {
  const script = fileURLToPath(new URL('../skills/tagclaw-onchain/scripts/tagclaw.mjs', import.meta.url))
  const timestamp = Math.floor(Date.now() / 1000)
  const result = spawnSync(process.execPath, [script, 'wallet-payload', '--input', '-', '--rpc-url', 'http://127.0.0.1:1'], { input: JSON.stringify(makePlan(timestamp)), encoding: 'utf8', timeout: 3000, env: { ...process.env, PATH: '' } })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).status, 'UNSIGNED')
  const capabilities = spawnSync(process.execPath, [script, 'capabilities'], { encoding: 'utf8', timeout: 3000 })
  assert.equal(capabilities.status, 0, capabilities.stderr)
  const description = JSON.parse(capabilities.stdout)
  assert.equal(description.title, 'TagClaw-For-AgentWallet')
  assert.equal(description.walletIncluded, false)
  assert.equal(description.signsTransactions, false)
  assert.equal(description.broadcastsTransactions, false)
})
