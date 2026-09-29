import { ethers } from 'ethers'
import { evm, assertBsc, confirmed } from './evm.js'
import { POOL_KEY_TYPE, PCS_MANAGER_ABI, PCS_QUOTER_ABI, PCS_ROUTER_ABI, PERMIT2_ABI } from './abi/v14.js'
import { TOKEN_ALLOWANCE_ABI } from './abi/index.js'
import { PCS_CL_POOL_MANAGER, PCS_CL_QUOTER, PCS_UNIVERSAL_ROUTER, PCS_PERMIT2, ZERO_ADDRESS, Q192 } from './constants.js'

const coder = ethers.AbiCoder.defaultAbiCoder()
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
const uint128Max = (1n << 128n) - 1n

export async function readNativePool(token, poolId, provider, blockTag) {
  if (!ethers.isHexString(poolId, 32) || poolId === ethers.ZeroHash) throw new Error('V4_POOL_UNAVAILABLE')
  const manager = evm.contract(PCS_CL_POOL_MANAGER, PCS_MANAGER_ABI, provider)
  const key = await manager.poolIdToPoolKey(poolId, { blockTag })
  if (!same(key.currency0, ZERO_ADDRESS) || !same(key.currency1, token) || !same(key.poolManager, PCS_CL_POOL_MANAGER)) {
    throw new Error('V4_INVALID_POOL: expected the BSC native-BNB/token pool')
  }
  const actualId = ethers.keccak256(coder.encode([POOL_KEY_TYPE], [key]))
  if (!same(actualId, poolId)) throw new Error('V4_INVALID_POOL: pool key does not match pool ID')
  return { key, manager }
}

export async function getV4NativePrice(token, poolId, provider, blockTag) {
  const { manager } = await readNativePool(token, poolId, provider, blockTag)
  const [sqrtPrice] = await manager.getSlot0(poolId, { blockTag })
  if (sqrtPrice <= 0n) throw new Error('V4_POOL_UNAVAILABLE: zero price')
  // currency0=BNB, currency1=token: sqrtPrice^2 is token/BNB, so invert it.
  return Number(Q192 * 10n ** 36n / (sqrtPrice * sqrtPrice)) / 1e36
}

export function buildV4Swap(key, isBuy, amount, minimum, hookData) {
  if (amount <= 0n || amount > uint128Max || minimum <= 0n || minimum > uint128Max) {
    throw new Error('V4_INVALID_AMOUNT: swap amounts must fit uint128 and minimum output must be positive')
  }
  const input = isBuy ? key.currency0 : key.currency1
  const output = isBuy ? key.currency1 : key.currency0
  const swap = coder.encode(
    [`(${POOL_KEY_TYPE} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`],
    [[key, isBuy, amount, minimum, hookData]]
  )
  // PCS Infinity CL_SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL.
  return coder.encode(['bytes', 'bytes[]'], ['0x060c0f', [
    swap, coder.encode(['address', 'uint128'], [input, amount]),
    coder.encode(['address', 'uint128'], [output, minimum])
  ]])
}

export async function tradeNativeV4({ token, poolId, signer, isBuy, amount, sellsman, slippage, quoteOnly = false }) {
  const provider = signer.provider
  await assertBsc(provider)
  if (amount <= 0n || amount > uint128Max) throw new Error('V4_INVALID_AMOUNT')
  const { key } = await readNativePool(token, poolId, provider)
  const owner = await signer.getAddress()
  const hookData = same(sellsman, ZERO_ADDRESS) ? '0x' : coder.encode(['address'], [sellsman])
  const quote = async () => {
    const quoter = evm.contract(PCS_CL_QUOTER, PCS_QUOTER_ABI, provider)
    const [expected] = await quoter.quoteExactInputSingle.staticCall([key, isBuy, amount, hookData], { from: owner })
    const minimum = expected * BigInt(10000 - slippage) / 10000n
    if (expected <= 0n || minimum <= 0n) throw new Error('V4_QUOTE_FAILED: output rounds to zero')
    return { expected, minimum }
  }
  let { expected, minimum } = await quote()
  const approvals = []
  if (!quoteOnly && !isBuy) {
    const tokenContract = evm.contract(token, TOKEN_ALLOWANCE_ABI, signer)
    const allowance = await tokenContract.allowance(owner, PCS_PERMIT2)
    if (allowance < amount) {
      if (allowance > 0n) approvals.push((await confirmed(await tokenContract.approve(PCS_PERMIT2, 0n))).hash)
      approvals.push((await confirmed(await tokenContract.approve(PCS_PERMIT2, amount))).hash)
    }
    const permit = evm.contract(PCS_PERMIT2, PERMIT2_ABI, signer)
    const [allowed, expiration] = await permit.allowance(owner, token, PCS_UNIVERSAL_ROUTER)
    const now = BigInt((await provider.getBlock('latest')).timestamp)
    if (allowed < amount || expiration <= now + 300n) {
      approvals.push((await confirmed(await permit.approve(token, PCS_UNIVERSAL_ROUTER, amount, now + 3600n))).hash)
    }
    // Approvals can take several blocks; never submit the pre-approval quote.
    ;({ expected, minimum } = await quote())
  }
  const deadline = BigInt((await provider.getBlock('latest')).timestamp) + 300n
  const result = {
    route: `listed-v14-pcs-v4-${isBuy ? 'buy' : 'sell'}`, version: 14,
    poolId, router: PCS_UNIVERSAL_ROUTER, amountIn: String(amount),
    [isBuy ? 'expectedAmount' : 'expectedReceive']: String(expected),
    amountOutMin: String(minimum), deadline: String(deadline), approveHashes: approvals
  }
  if (quoteOnly) return { ...result, quoteOnly: true }
  const payload = buildV4Swap(key, isBuy, amount, minimum, hookData)
  const router = evm.contract(PCS_UNIVERSAL_ROUTER, PCS_ROUTER_ABI, signer)
  const args = ['0x10', [payload], deadline, { value: isBuy ? amount : 0n }]
  await router.execute.staticCall(...args)
  const receipt = await confirmed(await router.execute(...args))
  return { ...result, hash: receipt.hash }
}
