/**
 * Token Pump 交易：buyToken / sellToken
 * 与 tiptag-ui src/utils/pump.ts 逻辑对齐
 */
import { ethers } from 'ethers'
import {
  WRAP_SWAPER_ABI,
  WRAP_SWAPER2_ABI,
  TOKEN_BUY_ABI,
  TOKEN1_BUY_ABI,
  TOKEN5_BUY_ABI,
  TOKEN8_BUY_ABI,
  TOKEN_SELL_ABI,
  TOKEN8_SELL_ABI
} from './abi/index.js'
import {
  DEFAULT_BNB_RPC,
  WETH,
  UNISWAP_V2_ROUTER,
  WRAP_SWAPER,
  WRAP_SWAPER2,
  IPSHARE1,
  IPSHARE2,
  ZERO_ADDRESS,
  DEFAULT_DEADLINE_SECONDS
} from './constants.js'
import { fetchTokenInfo, requestJson } from './config.js'
import { resolveWriteSigner } from './claw.js'
import {
  getBuyAmountUseEth,
  getSellAmountUseToken,
  getUnlistedBuyAmount,
  getUnlistedSellAmount
} from './price.js'
import {
  normalizeSellsman,
  normalizeSlippage,
  calcMinBySlippage,
  throwWalletError,
  getReadableError,
  ensureNativeBalance,
  ensureTokenBalance,
  ensureAllowance
} from './helpers.js'

// ─── 内部辅助 ─────────────────────────────────────────

async function fetchAgentTradeSignature(tokenAddr, ethAddr, requestConfig = {}) {
  return requestJson('/pump/getTradeSignatureAgent', {
    query: { tokenAddr, ethAddr }
  }, requestConfig)
}

// ─── buyToken ─────────────────────────────────────────

/**
 * Buy token (aligned with tiptag-ui src/utils/pump.ts buyToken branch logic)
 * version / listed / isImport 会自动通过 community detail API 获取，无需外部传入
 * @param {Object} params
 * @param {string} [params.privateKey] - 本地私钥；省略则使用 Claw 沙箱签名
 * @param {string} params.tick - 代币名称（区分大小写）
 * @param {string|bigint|number} params.ethAmount - input BNB amount (wei)
 * @param {string|null|undefined} [params.sellsman] - referrer address, 默认零地址
 * @param {number} [params.slippage=200] - slippage in bps, 默认 200 即 2%
 * @param {string} [params.rpcUrl] - RPC URL
 * @param {string} [params.signature] - required when version=5 and listed=false
 * @returns {Promise<{ hash: string, route: string, expectedAmount: string, amountOutMin?: string }>}
 */
async function buyToken(params) {
  const {
    privateKey,
    tick,
    ethAmount,
    sellsman,
    slippage = 200,
    rpcUrl = DEFAULT_BNB_RPC,
    signature,
    apiUrl,
    apiKey
  } = params

  if (!tick) throw new Error('tick is required')

  const requestConfig = { apiUrl, apiKey }
  const tokenInfo = await fetchTokenInfo(tick, requestConfig)
  const { token, version, listed, isImport } = tokenInfo

  if (!token || !ethers.isAddress(token)) throw new Error('invalid token address from API')
  if (!Number.isInteger(version) || version <= 0) throw new Error('invalid version from API')

  if (ethAmount == null || ethAmount === '') {
    throwWalletError('INVALID_ETH_AMOUNT', 'ethAmount is required')
  }

  const ethAmountBn = BigInt(ethAmount)
  if (ethAmountBn <= 0n) {
    throwWalletError('INVALID_ETH_AMOUNT', 'ethAmount must be greater than 0')
  }
  const slippageBps = normalizeSlippage(slippage)
  const sellsmanAddr = normalizeSellsman(sellsman)

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
  await ensureNativeBalance(provider, wallet.address, ethAmountBn, 'buy requires ethAmount balance')

  try {
    let expectedAmount
    if (listed) {
      expectedAmount = await getBuyAmountUseEth(token, ethAmountBn * 9800n / 10000n, provider)
      const amountOutMin = calcMinBySlippage(expectedAmount, slippageBps)
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_SECONDS

      if (isImport) {
        const wrap = new ethers.Contract(WRAP_SWAPER2, WRAP_SWAPER2_ABI, wallet)
        const tx = await wrap.buyToken(
          sellsmanAddr, amountOutMin, [WETH, token],
          wallet.address, deadline, UNISWAP_V2_ROUTER,
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
        sellsmanAddr, amountOutMin, [WETH, token],
        wallet.address, deadline, ipshare,
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
      const tx = await contract.buyToken(
        expectedAmount, sellsmanAddr, slippageBps, ZERO_ADDRESS,
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return { hash: receipt.hash, route: 'unlisted-token1-buy', expectedAmount: expectedAmount.toString() }
    }

    if (Number(version) === 5) {
      if (!signature) {
        throwWalletError('INVALID_SIGNATURE_FOR_V5_UNLISTED', 'version=5 and listed=false requires signature')
      }
      const contract = new ethers.Contract(token, TOKEN5_BUY_ABI, wallet)
      const tx = await contract.buyToken(
        expectedAmount, sellsmanAddr, slippageBps, signature,
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return { hash: receipt.hash, route: 'unlisted-token5-buy', expectedAmount: expectedAmount.toString() }
    }

    if (Number(version) === 8) {
      const signatureData = await fetchAgentTradeSignature(token, wallet.address, requestConfig)
      if (!signatureData || !signatureData.signature || !signatureData.deadline) {
        throwWalletError('INVALID_SIGNATURE_FOR_V8_UNLISTED', 'missing agent trade signature payload')
      }
      const contract = new ethers.Contract(token, TOKEN8_BUY_ABI, wallet)
      const tx = await contract.buyToken(
        expectedAmount, sellsmanAddr, slippageBps,
        signatureData.signature, BigInt(signatureData.deadline),
        { value: ethAmountBn }
      )
      const receipt = await tx.wait()
      return {
        hash: receipt.hash,
        route: 'unlisted-token8-buy',
        expectedAmount: expectedAmount.toString(),
        deadline: String(signatureData.deadline)
      }
    }

    const contract = new ethers.Contract(token, TOKEN_BUY_ABI, wallet)
    const tx = await contract.buyToken(expectedAmount, sellsmanAddr, slippageBps, { value: ethAmountBn })
    const receipt = await tx.wait()
    return { hash: receipt.hash, route: 'unlisted-tokenN-buy', expectedAmount: expectedAmount.toString() }
  } catch (e) {
    throwWalletError('BUY_TOKEN_FAILED', getReadableError(e))
  }
}

// ─── sellToken ────────────────────────────────────────

/**
 * Sell token (aligned with tiptag-ui src/utils/pump.ts sellToken branch logic)
 * version / listed / isImport 会自动通过 community detail API 获取，无需外部传入
 * @param {Object} params
 * @param {string} [params.privateKey] - 本地私钥；省略则使用 Claw
 * @param {string} params.tick - 代币名称（区分大小写）
 * @param {string|bigint|number} params.amount - token amount to sell (raw)
 * @param {string|null|undefined} [params.sellsman] - referrer address, 默认零地址
 * @param {number} [params.slippage=200] - slippage in bps, 默认 200 即 2%
 * @param {string} [params.rpcUrl] - RPC URL
 * @returns {Promise<{ hash: string, route: string, approveHash?: string | null, amountOutMin?: string }>}
 */
async function sellToken(params) {
  const {
    privateKey,
    tick,
    amount,
    sellsman,
    slippage = 200,
    rpcUrl = DEFAULT_BNB_RPC,
    apiUrl,
    apiKey
  } = params

  if (!tick) throw new Error('tick is required')

  const requestConfig = { apiUrl, apiKey }
  const tokenInfo = await fetchTokenInfo(tick, requestConfig)
  const { token, version, listed, isImport } = tokenInfo

  if (!token || !ethers.isAddress(token)) throw new Error('invalid token address from API')
  if (!Number.isInteger(version) || version <= 0) throw new Error('invalid version from API')
  if (amount == null || amount === '') {
    throwWalletError('INVALID_TOKEN_AMOUNT', 'amount is required')
  }

  const amountBn = BigInt(amount)
  if (amountBn <= 0n) {
    throwWalletError('INVALID_TOKEN_AMOUNT', 'amount must be greater than 0')
  }
  const slippageBps = normalizeSlippage(slippage)
  const sellsmanAddr = normalizeSellsman(sellsman)

  const wallet = await resolveWriteSigner(privateKey, rpcUrl)
  const provider = wallet.provider
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
          amountBn, amountOutMin, [token, WETH],
          wallet.address, deadline, sellsmanAddr, UNISWAP_V2_ROUTER
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
        amountBn, amountOutMin, [token, WETH],
        wallet.address, deadline, sellsmanAddr, ipshare
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

    const expectedReceive = await getUnlistedSellAmount(token, version, amountBn, provider)
    if (expectedReceive <= 0n) {
      throwWalletError('QUOTE_FAILED', 'computed expected receive ETH is 0')
    }

    if (Number(version) === 8) {
      const signatureData = await fetchAgentTradeSignature(token, wallet.address, requestConfig)
      if (!signatureData || !signatureData.signature || !signatureData.deadline) {
        throwWalletError('INVALID_SIGNATURE_FOR_V8_UNLISTED', 'missing agent trade signature payload')
      }
      const contract = new ethers.Contract(token, TOKEN8_SELL_ABI, wallet)
      const tx = await contract.sellToken(
        amountBn, expectedReceive, sellsmanAddr, slippageBps,
        signatureData.signature, BigInt(signatureData.deadline)
      )
      const receipt = await tx.wait()
      return {
        hash: receipt.hash,
        route: 'unlisted-token8-sell',
        expectedReceive: expectedReceive.toString(),
        deadline: String(signatureData.deadline)
      }
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

export {
  buyToken,
  sellToken
}
