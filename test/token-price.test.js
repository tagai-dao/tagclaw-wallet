const test = require('node:test')
const assert = require('node:assert/strict')
const { ethers } = require('ethers')

const wallet = require('../index')

const originalFetch = global.fetch
const OriginalJsonRpcProvider = ethers.JsonRpcProvider
const OriginalContract = ethers.Contract

function createResponse(body, { ok = true, status = 200 } = {}) {
  const textBody = JSON.stringify(body)
  return {
    ok,
    status,
    async json() {
      return body
    },
    async text() {
      return textBody
    }
  }
}

function createFetchQueue(responses) {
  return async function mockFetch() {
    if (responses.length === 0) {
      throw new Error('unexpected fetch call')
    }
    return responses.shift()
  }
}

function restoreRuntime() {
  global.fetch = originalFetch
  Object.defineProperty(ethers, 'JsonRpcProvider', {
    value: OriginalJsonRpcProvider,
    configurable: true,
    writable: true
  })
  Object.defineProperty(ethers, 'Contract', {
    value: OriginalContract,
    configurable: true,
    writable: true
  })
}

test.afterEach(() => {
  restoreRuntime()
})

test('exports getTokenPrice', () => {
  assert.equal(typeof wallet.getTokenPrice, 'function')
})

test('getTokenPrice returns import token prices from pair reserves and TagAI BNB price', async () => {
  const token = '0x1111111111111111111111111111111111111111'
  const pair = '0x2222222222222222222222222222222222222222'

  global.fetch = createFetchQueue([
    createResponse({
      token,
      version: 2,
      listedDayNumber: 1,
      isImport: true,
      pair
    }),
    createResponse('640.5')
  ])

  Object.defineProperty(ethers, 'JsonRpcProvider', {
    value: class FakeProvider {
      constructor(rpcUrl) {
        this.rpcUrl = rpcUrl
      }
    },
    configurable: true,
    writable: true
  })

  Object.defineProperty(ethers, 'Contract', {
    value: class FakeContract {
      constructor(address) {
        this.address = String(address).toLowerCase()
      }

      async getReserves() {
        if (this.address !== pair.toLowerCase()) {
          throw new Error(`unexpected getReserves contract: ${this.address}`)
        }
        return [2n * 10n ** 18n, 10n ** 18n, 0]
      }

      async token0() {
        if (this.address !== pair.toLowerCase()) {
          throw new Error(`unexpected token0 contract: ${this.address}`)
        }
        return token
      }
    },
    configurable: true,
    writable: true
  })

  const result = await wallet.getTokenPrice({ tick: 'TEST' })

  assert.equal(result.tick, 'TEST')
  assert.equal(result.token, token)
  assert.equal(result.version, 2)
  assert.equal(result.listed, true)
  assert.equal(result.isImport, true)
  assert.equal(result.pair, pair)
  assert.equal(result.bnbPriceUsd, 640.5)
  assert.equal(result.tokenPriceInBnb, 0.5)
  assert.equal(result.tokenPriceUsd, 320.25)
})

test('getTokenPrice returns bonding curve price for unlisted token', async () => {
  const token = '0x3333333333333333333333333333333333333333'
  const pumpV2 = '0x3DC52C69C3C8be568372E16d50E9F3FEc796610c'.toLowerCase()

  global.fetch = createFetchQueue([
    createResponse({
      token,
      version: 2,
      listedDayNumber: 0,
      isImport: false,
      pair: null
    }),
    createResponse(600)
  ])

  Object.defineProperty(ethers, 'JsonRpcProvider', {
    value: class FakeProvider {
      constructor(rpcUrl) {
        this.rpcUrl = rpcUrl
      }
    },
    configurable: true,
    writable: true
  })

  Object.defineProperty(ethers, 'Contract', {
    value: class FakeContract {
      constructor(address) {
        this.address = String(address).toLowerCase()
      }

      async bondingCurveSupply() {
        if (this.address !== token.toLowerCase()) {
          throw new Error(`unexpected bondingCurveSupply contract: ${this.address}`)
        }
        return 1000n * 10n ** 18n
      }

      async getPrice(supply, amount) {
        assert.equal(this.address, pumpV2)
        assert.equal(supply, 1000n * 10n ** 18n)
        assert.equal(amount, 10n ** 18n)
        return 25n * 10n ** 15n
      }
    },
    configurable: true,
    writable: true
  })

  const result = await wallet.getTokenPrice({ tick: 'CURVE' })

  assert.equal(result.tick, 'CURVE')
  assert.equal(result.token, token)
  assert.equal(result.listed, false)
  assert.equal(result.isImport, false)
  assert.equal(result.pair, null)
  assert.equal(result.bnbPriceUsd, 600)
  assert.equal(result.tokenPriceInBnb, 0.025)
  assert.equal(result.tokenPriceUsd, 15)
})

// 集成测试：真实 API + 链上数据，需网络
function assertValidPriceResult(result, tick) {
  assert.equal(result.tick, tick)
  assert.ok(ethers.isAddress(result.token), `token should be valid address: ${result.token}`)
  assert.ok(Number.isInteger(result.version) && result.version >= 1)
  assert.equal(typeof result.listed, 'boolean')
  assert.equal(typeof result.isImport, 'boolean')
  assert.ok(
    result.pair === null || ethers.isAddress(result.pair),
    `pair should be null or address: ${result.pair}`
  )
  assert.ok(
    typeof result.bnbPriceUsd === 'number' && result.bnbPriceUsd > 0,
    `bnbPriceUsd should be positive: ${result.bnbPriceUsd}`
  )
  assert.ok(
    typeof result.tokenPriceInBnb === 'number' && result.tokenPriceInBnb >= 0,
    `tokenPriceInBnb should be non-negative: ${result.tokenPriceInBnb}`
  )
  assert.ok(
    typeof result.tokenPriceUsd === 'number' && result.tokenPriceUsd >= 0,
    `tokenPriceUsd should be non-negative: ${result.tokenPriceUsd}`
  )
  assert.ok(
    Math.abs(result.tokenPriceUsd - result.tokenPriceInBnb * result.bnbPriceUsd) < 1e-6,
    'tokenPriceUsd should equal tokenPriceInBnb * bnbPriceUsd'
  )
}

test('getTokenPrice fetches real price for TagClaw', async () => {
  const result = await wallet.getTokenPrice({ tick: 'TagClaw' })
  assertValidPriceResult(result, 'TagClaw')
})

test('getTokenPrice fetches real price for BUIDL', async () => {
  const result = await wallet.getTokenPrice({ tick: 'BUIDL' })
  assertValidPriceResult(result, 'BUIDL')
})

test('getTokenPrice fetches real price for TTAI', async () => {
  const result = await wallet.getTokenPrice({ tick: 'TTAI' })
  assertValidPriceResult(result, 'TTAI')
})
