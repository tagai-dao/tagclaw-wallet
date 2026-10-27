import { ethers } from 'ethers'
import { CHAIN_ID, MULTICALL3 } from './deployment.mjs'

export const MULTICALL_ABI = [
  'function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns((bool success,bytes returnData)[])',
  'function getBlockNumber() view returns(uint256)',
  'function getEthBalance(address) view returns(uint256)'
]
const aggregate = new ethers.Interface(MULTICALL_ABI)

export function call(target, abi, method, args = []) {
  return { target: ethers.getAddress(target), iface: new ethers.Interface(abi), method, args }
}

export class Snapshot {
  static async open(provider) {
    if ((await provider.getNetwork()).chainId !== BigInt(CHAIN_ID)) throw new Error('WRONG_CHAIN: require BSC mainnet 56')
    const block = await provider.getBlock('latest')
    if (!block || !Number.isSafeInteger(block.number) || !block.hash) throw new Error('BLOCK_UNAVAILABLE')
    if (await provider.getCode(MULTICALL3, block.number) === '0x') throw new Error('MULTICALL_UNAVAILABLE: verified BSC Multicall3 is not deployed at this block')
    return new Snapshot(provider, block)
  }

  constructor(provider, block) { this.provider = provider; this.block = block }

  async read(calls) {
    const result = []
    for (let start = 0; start < calls.length; start += 32) result.push(...await this.chunk(calls.slice(start, start + 32)))
    return result
  }

  async chunk(calls) {
    // The anchor detects providers that accidentally ignore the requested historical block.
    const input = [call(MULTICALL3, MULTICALL_ABI, 'getBlockNumber'), ...calls]
    const encoded = input.map(c => [c.target, true, c.iface.encodeFunctionData(c.method, c.args)])
    let raw
    try {
      raw = await this.provider.call({ to: MULTICALL3, data: aggregate.encodeFunctionData('aggregate3', [encoded]), blockTag: this.block.number })
    } catch (error) {
      // Gas/size-limited nodes may need smaller batches; never fall back to individual calls.
      if (calls.length > 1) {
        const middle = Math.ceil(calls.length / 2)
        return [...await this.chunk(calls.slice(0, middle)), ...await this.chunk(calls.slice(middle))]
      }
      throw new Error(`MULTICALL_FAILED at block ${this.block.number}: ${error.shortMessage || error.message}`)
    }
    const rows = aggregate.decodeFunctionResult('aggregate3', raw)[0]
    if (rows.length !== input.length) throw new Error('MULTICALL_INCOMPLETE')
    const decoded = rows.map((row, index) => {
      const c = input[index]
      if (!row.success || row.returnData === '0x') {
        if (c.optional === true) return null
        throw new Error(`MULTICALL_SUBCALL_FAILED: ${c.target} ${c.method} at block ${this.block.number}`)
      }
      try {
        const values = c.iface.decodeFunctionResult(c.method, row.returnData)
        return values.length === 1 ? values[0] : values
      } catch { throw new Error(`MULTICALL_DECODE_FAILED: ${c.target} ${c.method}`) }
    })
    if (decoded[0] !== BigInt(this.block.number)) throw new Error('MULTICALL_BLOCK_MISMATCH')
    return decoded.slice(1)
  }

  metadata() { return { chainId: CHAIN_ID, blockNumber: this.block.number, blockHash: this.block.hash, blockTimestamp: this.block.timestamp, multicall: MULTICALL3 } }
}
