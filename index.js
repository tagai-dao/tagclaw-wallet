/**
 * tagclaw-wallet — minimal wallet utilities for local Agent usage
 * Dependencies: ethers, steem (no js-sha256/bs58; uses Node crypto + inline base58)
 */
const crypto = require('crypto')
const { ethers } = require('ethers')
const steem = require('steem')
const {
  ERC20_BALANCE_ABI,
  ERC20_TRANSFER_ABI,
  TOKEN_ALLOWANCE_ABI,
  UNISWAP_ROUTER_ABI,
  WRAP_SWAPER_ABI,
  WRAP_SWAPER2_ABI,
  TOKEN_BUY_ABI,
  TOKEN1_BUY_ABI,
  TOKEN5_BUY_ABI,
  TOKEN_SELL_ABI,
  TOKEN_SUPPLY_ABI,
  PUMP_QUOTE_ABI
} = require('./abi')

const STEEM_USERNAME = 'tagai'

// Base58 alphabet (Steem/Bitcoin compatible), implemented inline without third-party deps
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(buffer) {
  const hex = buffer.length ? buffer.toString('hex') : ''
  if (!hex) return '' // Avoid BigInt('0x') error on empty buffer
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

/** Derive Steem brain key (WIF format) from EVM private key */
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
 * Generate a new EVM wallet locally
 * @returns {{ address, privateKey }}
 */
function createWallet() {
  const wallet = ethers.Wallet.createRandom()
  return { address: wallet.address, privateKey: wallet.privateKey }
}

/**
 * Derive Steem role keys from an EVM private key (TagClaw-compatible format)
 * @param {string} evmPrivateKey - private key starting with 0x
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
 * Generate wallet + Steem keys
 * @returns {{ address, privateKey, steemKeys }}
 */
function createWalletAndSteemKeys() {
  const { address, privateKey } = createWallet()
  const steemKeys = generateSteemKeys(privateKey)
  return { address, privateKey, steemKeys }
}

/**
 * Sign a message with EVM private key (personal_sign / eth_sign style)
 * @param {string} privateKey - private key starting with 0x
 * @param {string} message - plain UTF-8 message
 * @returns {Promise<string>} hex signature string (0x-prefixed)
 */
async function signMessage(privateKey, message) {
  const wallet = new ethers.Wallet(privateKey)
  return wallet.signMessage(message)
}

// Default BNB Chain (BSC) RPC, override via TAGCLAW_BNB_RPC
const DEFAULT_BNB_RPC = process.env.TAGCLAW_BNB_RPC || 'https://bsc-dataseed2.binance.org'

/**
 * Query native BNB balance for an address (BNB Chain / BSC)
 * @param {string} address - 0x-prefixed address
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{ wei: string, ether: string }>} balance in wei string and ether string
 */
async function getBnbBalance(address, rpcUrl = DEFAULT_BNB_RPC) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wei = await provider.getBalance(address)
  const ether = ethers.formatEther(wei)
  return { wei: wei.toString(), ether }
}

// Pump/Swap constants aligned with tiptag-ui
const WETH = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const UNISWAP_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
const WRAP_SWAPER = '0x4cA57c64DFe1cF1be977093C75f9d9cdd1DD2E10'
const WRAP_SWAPER2 = '0x72D353c0469C10F6B769F13b67EEdB2E1F26FB01'
const IPSHARE1 = '0x7B0ddC305C32AAEbabc0FE372a4460e9903e95D0'
const IPSHARE2 = '0x24328DccA1bA54EeE82e2993F021802e64290486'
const PUMP_CONTRACTS = {
  1: '0xa77253Ac630502A35A6FcD210A01f613D33ba7cD',
  2: '0x3DC52C69C3C8be568372E16d50E9F3FEc796610c',
  3: '0xc9FaA3c05a5178C380d9C28Edffa38d90D606F22',
  4: '0x0476571a77Cc8Fc28796935Cf173c265F2021448',
  5: '0x2cAbfDE43f93422fFb070f0Fa03d2951dbBC7749',
  6: '0x201308B193bC0Aa81Ac540A7D3B3ADb530a39861'
}
const ZERO_ADDRESS = ethers.ZeroAddress
const MAX_UINT256 = ethers.MaxUint256
const DEFAULT_DEADLINE_SECONDS = 300n

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
 * @param {string} privateKey - sender private key, 0x-prefixed
 * @param {string} toAddress - recipient address, 0x-prefixed
 * @param {string} amount - amount as wei string or ether string (e.g. "0.01")
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @param {{ gasLimit?: string | bigint }} [opts] - optional tx settings, e.g. gasLimit
 * @returns {Promise<{ hash: string, from: string, to: string, value: string }>} tx hash and basic info
 */
async function transferBnb(privateKey, toAddress, amount, rpcUrl = DEFAULT_BNB_RPC, opts = {}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  // If amount includes a decimal point/exponent, treat as ether units; otherwise wei string
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
 * @param {string} privateKey - sender private key, 0x-prefixed
 * @param {string} tokenContractAddress - ERC20 contract address, 0x-prefixed
 * @param {string} toAddress - recipient address, 0x-prefixed
 * @param {string} amount - human-readable amount, converted using token decimals
 * @param {string} [rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @param {{ gasLimit?: string | bigint }} [opts] - optional tx settings, e.g. gasLimit
 * @returns {Promise<{ hash: string, from: string, to: string, token: string, value: string }>}
 */
async function transferErc20(privateKey, tokenContractAddress, toAddress, amount, rpcUrl = DEFAULT_BNB_RPC, opts = {}) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  const contract = new ethers.Contract(tokenContractAddress, ERC20_TRANSFER_ABI, wallet)
  const decimals = await contract.decimals()
  const amountRaw = ethers.parseUnits(amount, decimals)
  const tx = await contract.transfer(toAddress, amountRaw, {
    ...(opts.gasLimit != null && { gasLimit: opts.gasLimit })
  })
  const receipt = await tx.wait()
  return {
    hash: receipt.hash,
    from: receipt.from,
    to: toAddress,
    token: tokenContractAddress,
    value: amountRaw.toString()
  }
}

function normalizeSellsman(sellsman) {
  if (!sellsman || !ethers.isAddress(sellsman)) return ZERO_ADDRESS
  return sellsman
}

function normalizeSlippage(slippage = 0) {
  const n = Number(slippage)
  if (!Number.isInteger(n) || n < 0 || n > 10000) {
    throw new Error('slippage must be an integer between 0 and 10000')
  }
  return n
}

function calcMinBySlippage(amount, slippageBps) {
  return amount * BigInt(10000 - slippageBps) / 10000n
}

function getReadableError(e) {
  if (!e) return 'unknown error'
  if (typeof e === 'string') return e
  return e.shortMessage || e.reason || e.message || String(e)
}

function throwWalletError(code, detail) {
  throw new Error(`${code}: ${detail}`)
}

async function ensureNativeBalance(provider, address, required, context) {
  const available = await provider.getBalance(address)
  if (available < required) {
    throwWalletError(
      'INSUFFICIENT_NATIVE_BALANCE',
      `${context}; required=${required.toString()} wei, available=${available.toString()} wei`
    )
  }
}

async function ensureTokenBalance(provider, token, owner, required) {
  const tokenContract = new ethers.Contract(token, ERC20_BALANCE_ABI, provider)
  const available = await tokenContract.balanceOf(owner)
  if (available < required) {
    throwWalletError(
      'INSUFFICIENT_TOKEN_BALANCE',
      `token=${token}, required=${required.toString()}, available=${available.toString()}`
    )
  }
}

async function getBuyAmountUseEth(token, ethAmount, provider) {
  const router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_ROUTER_ABI, provider)
  const amounts = await router.getAmountsOut(ethAmount, [WETH, token])
  return amounts[amounts.length - 1]
}

async function getSellAmountUseToken(token, tokenAmount, provider) {
  const router = new ethers.Contract(UNISWAP_V2_ROUTER, UNISWAP_ROUTER_ABI, provider)
  const amounts = await router.getAmountsOut(tokenAmount, [token, WETH])
  return amounts[amounts.length - 1] * 9800n / 10000n
}

async function ensureAllowance(token, owner, spender, amount, signer) {
  const tokenContract = new ethers.Contract(token, TOKEN_ALLOWANCE_ABI, signer)
  const allowance = await tokenContract.allowance(owner, spender)
  if (allowance >= amount) {
    return { approved: false, hash: null }
  }
  const tx = await tokenContract.approve(spender, MAX_UINT256)
  const receipt = await tx.wait()
  return { approved: true, hash: receipt.hash }
}

async function getUnlistedBuyAmount(token, version, ethAmount, provider) {
  const pumpAddress = PUMP_CONTRACTS[Number(version)]
  if (!pumpAddress) {
    throwWalletError('INVALID_VERSION', `unsupported version=${version}`)
  }
  const tokenContract = new ethers.Contract(token, TOKEN_SUPPLY_ABI, provider)
  const pumpContract = new ethers.Contract(pumpAddress, PUMP_QUOTE_ABI, provider)
  const supply = await tokenContract.bondingCurveSupply()
  const afterFee = ethAmount * 9800n / 10000n
  return pumpContract.getBuyAmountByValue(supply, afterFee)
}

async function getUnlistedSellAmount(token, version, tokenAmount, provider) {
  const pumpAddress = PUMP_CONTRACTS[Number(version)]
  if (!pumpAddress) {
    throwWalletError('INVALID_VERSION', `unsupported version=${version}`)
  }
  const tokenContract = new ethers.Contract(token, TOKEN_SUPPLY_ABI, provider)
  const pumpContract = new ethers.Contract(pumpAddress, PUMP_QUOTE_ABI, provider)
  const supply = await tokenContract.bondingCurveSupply()
  return pumpContract.getSellPriceAfterFee(supply, tokenAmount)
}

/**
 * Buy token (aligned with tiptag-ui src/utils/pump.ts buyToken branch logic)
 * @param {Object} params
 * @param {string} params.privateKey - sender private key
 * @param {string} params.token - token contract address
 * @param {number} params.version - token version
 * @param {string|bigint|number} params.ethAmount - input BNB amount (wei)
 * @param {string|null|undefined} [params.sellsman] - referrer address
 * @param {boolean} params.listed - whether token is listed
 * @param {boolean} params.isImport - whether token is import token (only meaningful when listed=true)
 * @param {number} [params.slippage=0] - slippage in bps
 * @param {string} [params.rpcUrl] - RPC URL
 * @param {string} [params.signature] - required when version=5 and listed=false
 * @returns {Promise<{ hash: string, route: string, expectedAmount: string, amountOutMin?: string }>}
 */
async function buyToken(params) {
  const {
    privateKey,
    token,
    version,
    ethAmount,
    sellsman,
    listed,
    isImport,
    slippage = 0,
    rpcUrl = DEFAULT_BNB_RPC,
    signature
  } = params

  if (!privateKey) throw new Error('privateKey is required')
  if (!token || !ethers.isAddress(token)) throw new Error('invalid token address')
  if (!Number.isInteger(Number(version)) || Number(version) <= 0) throw new Error('invalid version')

  if (ethAmount == null || ethAmount === '') {
    throwWalletError('INVALID_ETH_AMOUNT', 'ethAmount is required')
  }

  const ethAmountBn = BigInt(ethAmount)
  if (ethAmountBn <= 0n) {
    throwWalletError('INVALID_ETH_AMOUNT', 'ethAmount must be greater than 0')
  }
  const slippageBps = normalizeSlippage(slippage)
  const sellsmanAddr = normalizeSellsman(sellsman)

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  await ensureNativeBalance(provider, wallet.address, ethAmountBn, 'buy requires ethAmount balance')

  try {
    let expectedAmount
    if (listed) {
      // Keep parity with frontend: apply 2% fee before quote, then apply slippage protection
      expectedAmount = await getBuyAmountUseEth(token, ethAmountBn * 9800n / 10000n, provider)
      const amountOutMin = calcMinBySlippage(expectedAmount, slippageBps)
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECONDS

      if (isImport) {
        const wrap = new ethers.Contract(WRAP_SWAPER2, WRAP_SWAPER2_ABI, wallet)
        const tx = await wrap.buyToken(
          sellsmanAddr,
          amountOutMin,
          [WETH, token],
          wallet.address,
          deadline,
          UNISWAP_V2_ROUTER,
          { value: ethAmountBn }
        )
        const receipt = await tx.wait()
        return {
          hash: receipt.hash,
          route: 'listed-import-wrap2-buy',
          expectedAmount: expectedAmount.toString(),
          amountOutMin: amountOutMin.toString()
        }
      }

      const wrap = new ethers.Contract(WRAP_SWAPER, WRAP_SWAPER_ABI, wallet)
      const ipshare = Number(version) === 1 ? IPSHARE1 : IPSHARE2
      const tx = await wrap.buyToken(
        sellsmanAddr,
        amountOutMin,
        [WETH, token],
        wallet.address,
        deadline,
        ipshare,
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return {
        hash: receipt.hash,
        route: 'listed-wrap-buy',
        expectedAmount: expectedAmount.toString(),
        amountOutMin: amountOutMin.toString()
      }
    }

    expectedAmount = await getUnlistedBuyAmount(token, version, ethAmountBn, provider)
    if (expectedAmount <= 0n) {
      throwWalletError('QUOTE_FAILED', 'computed expected token amount is 0')
    }

    if (Number(version) === 1) {
      const contract = new ethers.Contract(token, TOKEN1_BUY_ABI, wallet)
      const tx = await contract.buyToken(expectedAmount, sellsmanAddr, slippageBps, ZERO_ADDRESS, { value: ethAmountBn })
      const receipt = await tx.wait()
      return { hash: receipt.hash, route: 'unlisted-token1-buy', expectedAmount: expectedAmount.toString() }
    }

    if (Number(version) === 5) {
      if (!signature) {
        throwWalletError('INVALID_SIGNATURE_FOR_V5_UNLISTED', 'version=5 and listed=false requires signature')
      }
      const contract = new ethers.Contract(token, TOKEN5_BUY_ABI, wallet)
      const tx = await contract.buyToken(expectedAmount, sellsmanAddr, slippageBps, signature, { value: ethAmountBn })
      const receipt = await tx.wait()
      return { hash: receipt.hash, route: 'unlisted-token5-buy', expectedAmount: expectedAmount.toString() }
    }

    const contract = new ethers.Contract(token, TOKEN_BUY_ABI, wallet)
    const tx = await contract.buyToken(expectedAmount, sellsmanAddr, slippageBps, { value: ethAmountBn })
    const receipt = await tx.wait()
    return { hash: receipt.hash, route: 'unlisted-tokenN-buy', expectedAmount: expectedAmount.toString() }
  } catch (e) {
    throwWalletError('BUY_TOKEN_FAILED', getReadableError(e))
  }
}

/**
 * Sell token (aligned with tiptag-ui src/utils/pump.ts sellToken branch logic)
 * @param {Object} params
 * @param {string} params.privateKey - sender private key
 * @param {string} params.token - token contract address
 * @param {number} params.version - token version
 * @param {string|bigint|number} params.amount - token amount to sell (raw)
 * @param {string|null|undefined} [params.sellsman] - referrer address
 * @param {boolean} params.listed - whether token is listed
 * @param {boolean} params.isImport - whether token is import token (only meaningful when listed=true)
 * @param {number} [params.slippage=0] - slippage in bps
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, route: string, approveHash?: string | null, amountOutMin?: string }>}
 */
async function sellToken(params) {
  const {
    privateKey,
    token,
    version,
    amount,
    sellsman,
    listed,
    isImport,
    slippage = 0,
    rpcUrl = DEFAULT_BNB_RPC
  } = params

  if (!privateKey) throw new Error('privateKey is required')
  if (!token || !ethers.isAddress(token)) throw new Error('invalid token address')
  if (!Number.isInteger(Number(version)) || Number(version) <= 0) throw new Error('invalid version')
  if (amount == null || amount === '') {
    throwWalletError('INVALID_TOKEN_AMOUNT', 'amount is required')
  }

  const amountBn = BigInt(amount)
  if (amountBn <= 0n) {
    throwWalletError('INVALID_TOKEN_AMOUNT', 'amount must be greater than 0')
  }
  const slippageBps = normalizeSlippage(slippage)
  const sellsmanAddr = normalizeSellsman(sellsman)

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(privateKey, provider)
  await ensureTokenBalance(provider, token, wallet.address, amountBn)

  try {
    if (listed) {
      const spender = isImport ? WRAP_SWAPER2 : WRAP_SWAPER
      const approveResult = await ensureAllowance(token, wallet.address, spender, amountBn, wallet)
      const expectedReceive = await getSellAmountUseToken(token, amountBn, provider)
      const amountOutMin = calcMinBySlippage(expectedReceive, slippageBps)
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECONDS

      if (isImport) {
        const wrap = new ethers.Contract(WRAP_SWAPER2, WRAP_SWAPER2_ABI, wallet)
        const tx = await wrap.sellToken(
          amountBn,
          amountOutMin,
          [token, WETH],
          wallet.address,
          deadline,
          sellsmanAddr,
          UNISWAP_V2_ROUTER
        )
        const receipt = await tx.wait()
        return {
          hash: receipt.hash,
          route: 'listed-import-wrap2-sell',
          approveHash: approveResult.hash,
          expectedReceive: expectedReceive.toString(),
          amountOutMin: amountOutMin.toString()
        }
      }

      const wrap = new ethers.Contract(WRAP_SWAPER, WRAP_SWAPER_ABI, wallet)
      const ipshare = Number(version) === 1 ? IPSHARE1 : IPSHARE2
      const tx = await wrap.sellToken(
        amountBn,
        amountOutMin,
        [token, WETH],
        wallet.address,
        deadline,
        sellsmanAddr,
        ipshare
      )
      const receipt = await tx.wait()
      return {
        hash: receipt.hash,
        route: 'listed-wrap-sell',
        approveHash: approveResult.hash,
        expectedReceive: expectedReceive.toString(),
        amountOutMin: amountOutMin.toString()
      }
    }

    // Keep parity with frontend: in unlisted branch, quote receiveEth first, then call sellToken
    const expectedReceive = await getUnlistedSellAmount(token, version, amountBn, provider)
    if (expectedReceive <= 0n) {
      throwWalletError('QUOTE_FAILED', 'computed expected receive ETH is 0')
    }

    const contract = new ethers.Contract(token, TOKEN_SELL_ABI, wallet)
    const tx = await contract.sellToken(amountBn, expectedReceive, sellsmanAddr, slippageBps)
    const receipt = await tx.wait()
    return {
      hash: receipt.hash,
      route: 'unlisted-token-sell',
      expectedReceive: expectedReceive.toString()
    }
  } catch (e) {
    throwWalletError('SELL_TOKEN_FAILED', getReadableError(e))
  }
}

module.exports = {
  createWallet,
  generateSteemKeys,
  createWalletAndSteemKeys,
  signMessage,
  getBnbBalance,
  getErc20Balance,
  transferBnb,
  transferErc20,
  buyToken,
  sellToken,
  DEFAULT_BNB_RPC
}
