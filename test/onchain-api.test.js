import test from 'node:test'
import assert from 'node:assert/strict'
import { PublicApi, resolveToken } from '../skills/tagclaw-onchain/scripts/lib/api.mjs'

const token = '0x2222222222222222222222222222222222222222'
const row = { token, tick: 'EXAMPLE', chainId: 56, version: '16', isImport: 0 }
const response = (body, status = 200) => ({ ok: status === 200, status, headers: new Headers(), json: async () => body })

test('public API uses fixed origin, explicit BSC chain, GET only and correct per-endpoint envelopes', async () => {
  const requests = []
  const api = new PublicApi(async (url, options) => {
    requests.push({ url, options })
    return response(url.pathname.startsWith('/pump/') ? { c: 0, d: { version: 16, assets: [] } } : false)
  })
  const available = await api.get('tick-available', { tick: 'A&B' })
  assert.equal(available.data, false)
  assert.equal(requests[0].url.searchParams.get('tick'), 'A&B')
  const config = await api.get('creation-options', { from: token })
  assert.equal(config.data.version, 16)
  assert.equal(requests[1].url.pathname, `/pump/v16/creation/${token}`)
  for (const request of requests) {
    assert.equal(request.url.origin, 'https://bsc-api.tagai.fun')
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.headers['X-Chain-Id'], '56')
    assert.equal(request.options.headers.Authorization, undefined)
    assert.equal(request.options.redirect, 'error')
  }
  await assert.rejects(api.get('https://evil.example/send'), /UNKNOWN_PUBLIC_RESOURCE/)
  await assert.rejects(api.get('index-detail', { token, version: 12 }), /INVALID_INDEX_VERSION/)
})

test('HTTP, application and malformed envelope failures do not become successful empty datasets', async () => {
  for (const [body, status] of [[{ c: 1, error: 'unavailable' }, 503], [{ success: false }, 200], [{ c: 0 }, 200]]) {
    const api = new PublicApi(async () => response(body, status))
    await assert.rejects(api.get('ipshare-list'), /API_FAILED|INCOMPLETE/)
  }
  const stale = new PublicApi(async () => ({ ...response([row]), headers: new Headers({ 'X-TagAI-Data-Quality': 'stale', 'X-TagAI-Updated-At': '2026-10-23T00:00:00Z' }) }))
  assert.equal((await stale.get('token-search', { query: 'EXAMPLE' })).quality, 'stale')
})

test('tick resolution checks exact identity and rejects wrong-chain and ambiguous candidates', async () => {
  const api = new PublicApi(async () => response(row))
  const result = await resolveToken({ tick: 'example' }, api)
  assert.equal(result.data.token, token)
  assert.equal(result.data.version, 16)
  assert.equal(result.data.isImport, false)
  await assert.rejects(resolveToken({ tick: 'OTHER' }, api), /MISMATCH/)
  await assert.rejects(resolveToken({ tick: 'EXAMPLE' }, new PublicApi(async () => response({ ...row, chainId: 4663 }))), /INCOMPLETE/)
  const ambiguous = new PublicApi(async url => response(url.pathname.endsWith('/detail') ? {} : [row, row]))
  await assert.rejects(resolveToken({ tick: 'EXAMPLE' }, ambiguous), /AMBIGUOUS/)
})

test('address resolution uses an explicit optional Multicall symbol and exact full-address matching', async () => {
  const reads = []
  const snapshot = { read: async calls => { reads.push(calls); return ['EXAMPLE'] } }
  const api = new PublicApi(async () => response([{ ...row, token: '0x3333333333333333333333333333333333333333' }, row]))
  const result = await resolveToken({ token }, api, snapshot)
  assert.equal(result.data.token, token)
  assert.equal(reads[0][0].target, token)
  assert.equal(reads[0][0].method, 'symbol')
  assert.equal(reads[0][0].optional, true)
})

test('catalog address search preserves continuation IDs and never reports a partial scan as not found', async () => {
  const queries = []
  const api = new PublicApi(async url => {
    queries.push(url)
    const page = Number(url.searchParams.get('pages'))
    return response({ rows: page === 2 ? [row] : [], catalogId: 'stable-catalog', hasMore: true })
  })
  await assert.rejects(resolveToken({ token, maxPages: 2 }, api), /INCOMPLETE: retry with page=2 catalogId=stable-catalog/)
  assert.equal(queries[1].searchParams.get('catalogId'), 'stable-catalog')
  const result = await resolveToken({ token, page: 2, catalogId: 'stable-catalog' }, api)
  assert.equal(result.data.tick, 'EXAMPLE')
  const empty = new PublicApi(async () => response({ rows: [], catalogId: 'done', hasMore: false }))
  await assert.rejects(resolveToken({ token }, empty), /^Error: TOKEN_NOT_FOUND$/)
})
