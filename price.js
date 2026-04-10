/**
 * 代币价格查询：bonding curve、DEX pair、CL pool、BNB/USD
 */
const { ethers } = require('ethers')
const {
  UNISWAP_ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
  CL_POOL_MANAGER_ABI,
  TOKEN_SUPPLY_ABI,
  PUMP_QUOTE_ABI
} = require('./abi')
const {
  DEFAULT_BNB_RPC,
  WETH,
  UNISWAP_V2_FACTORY,
  UNISWAP_V2_ROUTER,
  PCS_CL_POOL_MANAGER,
  PUMP_CONTRACTS,
  ZERO_ADDRESS,
  TOKEN_PRICE_UNIT,
  Q192
} = require('./constants')
const { _config, resolveRequestConfig, fetchTokenInfo } = require('./config')
const {
  throwWalletError,
  getReadableError,
  isBytes32Hex,
  toTokenUnitNumber,
  parseNumericApiValue
} = require('./helpers')

// ─── DEX 报价 ─────────────────────────────────────────

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

// ─── Bonding Curve 报价 ───────────────────────────────

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

// ─── 价格查询（链上）──────────────────────────────────

async function getBnbPriceUsd(apiUrl = _config.apiUrl) {
  const url = `${apiUrl}/tiptag/getETHPrice`

  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      throwWalletError('BNB_PRICE_FETCH_FAILED', `HTTP ${resp.status} for ${url}`)
    }

    const text = await resp.text()
    if (!text) {
      throwWalletError('BNB_PRICE_FETCH_FAILED', 'empty response body')
    }

    let raw = text
    try {
      raw = JSON.parse(text)
    } catch {
      // Keep raw text when the endpoint returns a plain number string.
    }

    return parseNumericApiValue(raw, 'BNB_PRICE_FETCH_FAILED')
  } catch (e) {
    const detail = getReadableError(e)
    if (detail.startsWith('BNB_PRICE_FETCH_FAILED:')) {
      throw e
    }
    throwWalletError('BNB_PRICE_FETCH_FAILED', detail)
  }
}

async function getPairPriceInBnb(token, pair, provider) {
  const pairContract = new ethers.Contract(pair, PAIR_ABI, provider)
  const [reserves, token0] = await Promise.all([
    pairContract.getReserves(),
    pairContract.token0()
  ])
  const [reserve0, reserve1] = reserves
  const reserve0Value = toTokenUnitNumber(reserve0)
  const reserve1Value = toTokenUnitNumber(reserve1)

  if (reserve0Value <= 0 || reserve1Value <= 0) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `invalid reserves for pair=${pair}`)
  }

  return String(token0).toLowerCase() === String(token).toLowerCase()
    ? reserve1Value / reserve0Value
    : reserve0Value / reserve1Value
}

async function resolvePairAddress(token, pair, provider) {
  if (pair && ethers.isAddress(pair)) {
    return pair
  }

  const factory = new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, provider)
  const resolvedPair = await factory.getPair(token, WETH)
  if (!resolvedPair || resolvedPair === ZERO_ADDRESS) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `no pair found for token=${token}`)
  }

  return resolvedPair
}

async function getV7PoolPriceInBnb(poolId, provider) {
  const manager = new ethers.Contract(PCS_CL_POOL_MANAGER, CL_POOL_MANAGER_ABI, provider)
  const [sqrtPriceX96] = await manager.getSlot0(poolId)
  if (sqrtPriceX96 === 0n) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `pool=${poolId} returned zero price`)
  }

  // 与前端口径保持一致：sqrtPriceX96^2 / 2^192 即 1 个 token 的 BNB 价格。
  const scaledPrice = sqrtPriceX96 * sqrtPriceX96 * TOKEN_PRICE_UNIT / Q192
  const price = toTokenUnitNumber(scaledPrice)
  if (price <= 0) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `pool=${poolId} returned invalid price`)
  }
  return price
}

async function getBondingCurvePriceInBnb(token, version, provider) {
  const pumpAddress = PUMP_CONTRACTS[Number(version)]
  if (!pumpAddress) {
    throwWalletError('INVALID_VERSION', `unsupported version=${version}`)
  }

  const tokenContract = new ethers.Contract(token, TOKEN_SUPPLY_ABI, provider)
  const pumpContract = new ethers.Contract(pumpAddress, PUMP_QUOTE_ABI, provider)
  const supply = await tokenContract.bondingCurveSupply()
  const rawPrice = await pumpContract.getPrice(supply, TOKEN_PRICE_UNIT)
  const price = toTokenUnitNumber(rawPrice)

  if (price <= 0) {
    throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `curve price is zero for token=${token}`)
  }

  return price
}

async function getTokenPriceInBnb(tokenInfo, rpcUrl = DEFAULT_BNB_RPC) {
  const { token, version, listed, isImport, pair } = tokenInfo || {}
  if (!token || !ethers.isAddress(token)) {
    throwWalletError('INVALID_TOKEN_INFO', 'token must be a valid address')
  }
  if (!Number.isInteger(version) || version <= 0) {
    throwWalletError('INVALID_TOKEN_INFO', `invalid version=${version}`)
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)

  try {
    if (!listed) {
      return await getBondingCurvePriceInBnb(token, version, provider)
    }

    if (Number(version) === 7 && pair && isBytes32Hex(pair)) {
      return await getV7PoolPriceInBnb(pair, provider)
    }

    if (isImport) {
      if (!pair || !ethers.isAddress(pair)) {
        throwWalletError('TOKEN_PRICE_QUOTE_FAILED', `import token requires pair address, token=${token}`)
      }
      return await getPairPriceInBnb(token, pair, provider)
    }

    const resolvedPair = await resolvePairAddress(token, pair, provider)
    return await getPairPriceInBnb(token, resolvedPair, provider)
  } catch (e) {
    const detail = getReadableError(e)
    if (
      detail.startsWith('INVALID_TOKEN_INFO:') ||
      detail.startsWith('INVALID_VERSION:') ||
      detail.startsWith('TOKEN_PRICE_QUOTE_FAILED:')
    ) {
      throw e
    }
    throwWalletError('TOKEN_PRICE_QUERY_FAILED', detail)
  }
}

// ─── 对外暴露的聚合查询 ──────────────────────────────

/**
 * Query token price by tick.
 * @param {Object} params
 * @param {string} params.tick - token symbol used by community detail API
 * @param {string} [params.rpcUrl] - RPC URL, defaults to DEFAULT_BNB_RPC
 * @returns {Promise<{
 *   tick: string, token: string, version: number, listed: boolean,
 *   isImport: boolean, pair: string | null, bnbPriceUsd: number,
 *   tokenPriceInBnb: number, tokenPriceUsd: number
 * }>}
 */
async function getTokenPrice(params) {
  const { tick, rpcUrl = DEFAULT_BNB_RPC, apiUrl, apiKey } = params || {}
  if (!tick || typeof tick !== 'string') {
    throwWalletError('INVALID_TICK', 'tick is required')
  }

  const normalizedTick = tick.trim()
  if (!normalizedTick) {
    throwWalletError('INVALID_TICK', 'tick is required')
  }

  const requestConfig = { apiUrl, apiKey }
  const tokenInfo = await fetchTokenInfo(normalizedTick, requestConfig)
  const { token, version, listed, isImport, pair } = tokenInfo

  if (!token || !ethers.isAddress(token)) {
    throwWalletError('INVALID_TOKEN_INFO', 'invalid token address from API')
  }
  if (!Number.isInteger(version) || version <= 0) {
    throwWalletError('INVALID_TOKEN_INFO', 'invalid version from API')
  }

  const [bnbPriceUsd, tokenPriceInBnb] = await Promise.all([
    getBnbPriceUsd(resolveRequestConfig(requestConfig).apiUrl),
    getTokenPriceInBnb(tokenInfo, rpcUrl)
  ])

  return {
    tick: normalizedTick,
    token,
    version,
    listed,
    isImport,
    pair,
    bnbPriceUsd,
    tokenPriceInBnb,
    tokenPriceUsd: tokenPriceInBnb * bnbPriceUsd
  }
}

module.exports = {
  getBuyAmountUseEth,
  getSellAmountUseToken,
  getUnlistedBuyAmount,
  getUnlistedSellAmount,
  getTokenPrice
}
