/**
 * BNB / ERC20 余额查询与转账
 */
const { ethers } = require('ethers')
const { ERC20_BALANCE_ABI, ERC20_TRANSFER_ABI } = require('./abi')
const { DEFAULT_BNB_RPC } = require('./constants')
const { resolveWriteSigner } = require('./claw')

/**
 * Query native BNB balance for an address (BNB Chain / BSC)
 * @param {string} address - 0x-prefixed address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ wei: string, ether: string }>}
 */
async function getBnbBalance(address, rpcUrl = DEFAULT_BNB_RPC) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wei = await provider.getBalance(address)
  const ether = ethers.formatEther(wei)
  return { wei: wei.toString(), ether }
}

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
 * @param {{ gasLimit?: string | bigint }} [opts] - optional tx settings
 * @returns {Promise<{ hash: string, from: string, to: string, value: string }>}
 */
async function transferBnb(privateKey, toAddress, amount, rpcUrl = DEFAULT_BNB_RPC, opts = {}) {
  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
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
 * @param {{ gasLimit?: string | bigint }} [opts] - optional tx settings
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

module.exports = {
  getBnbBalance,
  getErc20Balance,
  transferBnb,
  transferErc20
}
