import { ethers } from 'ethers'
import { call } from './snapshot.mjs'
import { ERC20_BALANCE_ABI } from './erc20-abi.mjs'

export const API_BASE = 'https://bsc-api.tagai.fun'
const segment = value => encodeURIComponent(String(value))
export const API_RESOURCES = {
  'agent-feed': input => ['/tagclaw/world/feed', { type: input.type ?? 'all', tick: input.tick, agentId: input.agentId, cursor: input.cursor, limit: input.limit ?? 30 }],
  'agent-directory': input => ['/tagclaw/world/agents', { pages: input.page ?? 0, q: input.query, sort: input.sort ?? 'recent' }],
  'agent-profile': input => [`/tagclaw/world/agent/${segment(input.agentId)}`, {}],
  'agent-stats': () => ['/tagclaw/world/stats', {}],
  'token-search': input => ['/community/search', { tick: input.query }],
  'token-detail': input => ['/community/detail', { tick: input.tick }],
  'token-catalog': input => ['/community/catalogPage', { pages: input.page ?? 0, sort: input.sort ?? 'new', source: input.source ?? 'all', catalogId: input.catalogId }],
  'tick-available': input => ['/community/isTokenExist', { tick: input.tick }],
  'creation-options': input => [`/pump/v18/creation/${segment(input.from)}`, {}],
  'index-detail': input => [`/pump/v${Number(input.version)}/detail/${segment(input.token)}`, {}],
  'bnb-usd': () => ['/tiptag/getETHPrice', {}],
  'ipshare-list': input => ['/ipshare/list', { pages: input.page ?? 0, keyword: input.query }],
  'ipshare-summary': () => ['/ipshare/summary', {}],
  'ipshare-holdings': input => ['/ipshare/holdingList', { ethAddr: input.from, pages: input.page ?? 0 }],
  'nutbox-stats': () => ['/nutbox/stats', {}],
  'nutbox-communities': input => ['/nutbox/communities', { page: input.page ?? 0, size: input.size ?? 20 }],
  'nutbox-by-token': input => [`/nutbox/communities/by-token/${segment(input.token)}`, {}],
  'nutbox-community': input => [`/nutbox/communities/${segment(input.community)}`, {}],
  'nutbox-history': input => [`/nutbox/communities/${segment(input.community)}/history`, { page: input.page ?? 0, size: input.size ?? 20 }]
}

export class PublicApi {
  constructor(fetcher = fetch) { this.fetcher = fetcher }

  async get(resource, input = {}) {
    if (!Object.hasOwn(API_RESOURCES, resource)) throw new Error('UNKNOWN_PUBLIC_RESOURCE')
    if (resource === 'index-detail' && ![13, 14, 15, 16, 17, 18].includes(Number(input.version))) throw new Error('INVALID_INDEX_VERSION')
    const [pathname, params] = API_RESOURCES[resource](input)
    if (pathname.includes('undefined') || Object.values(params).includes(undefined) && ['token-search', 'token-detail', 'tick-available'].includes(resource)) throw new Error('MISSING_API_PARAMETER')
    const url = new URL(pathname, API_BASE)
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value))
    const response = await this.fetcher(url, { method: 'GET', headers: { 'X-Chain-Id': '56', Accept: 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' })
    let body
    try { body = await response.json() } catch { throw new Error(`API_INVALID_JSON: ${resource} HTTP ${response.status}`) }
    if (!response.ok || body?.error || body?.success === false || body?.c !== undefined && body.c !== 0) throw new Error(`API_FAILED: ${resource} HTTP ${response.status}: ${JSON.stringify(body)}`)
    if (body?.c === 0 && body.d === undefined) throw new Error('API_INCOMPLETE_ENVELOPE')
    return { source: url.toString(), quality: response.headers?.get('x-tagai-data-quality') ?? null, updatedAt: response.headers?.get('x-tagai-updated-at') ?? null, data: body?.c === 0 ? body.d : body }
  }
}

function verifiedRow(row, query) {
  if (!row || !ethers.isAddress(row.token) || Number(row.chainId ?? 56) !== 56 || !Number.isInteger(Number(row.version))) throw new Error('TOKEN_METADATA_INCOMPLETE')
  const match = ethers.isAddress(query) ? row.token.toLowerCase() === query.toLowerCase() : typeof row.tick === 'string' && row.tick.toLowerCase() === query.toLowerCase()
  if (!match) throw new Error('TOKEN_RESOLUTION_MISMATCH')
  return { ...row, token: ethers.getAddress(row.token), chainId: 56, version: Number(row.version), isImport: row.isImport === true || Number(row.isImport) === 1 }
}

export async function resolveToken(input, api = new PublicApi(), snapshot) {
  const query = input.tick ?? input.token ?? input.query
  if (typeof query !== 'string' || !query.trim()) throw new Error('TOKEN_QUERY_REQUIRED: provide tick or token address')
  const needle = query.trim()
  if (!ethers.isAddress(needle)) {
    const detail = await api.get('token-detail', { tick: needle })
    if (detail.data?.token) return { ...detail, data: verifiedRow(detail.data, needle) }
    const search = await api.get('token-search', { query: needle })
    if (!Array.isArray(search.data)) throw new Error('TOKEN_SEARCH_INVALID')
    const exact = search.data.filter(row => row.tick?.toLowerCase() === needle.toLowerCase())
    if (exact.length !== 1) throw new Error(exact.length ? 'TOKEN_AMBIGUOUS: ask for the full contract address' : 'TOKEN_NOT_FOUND')
    return { ...search, data: verifiedRow(exact[0], needle) }
  }
  if (snapshot) {
    const [symbol] = await snapshot.read([{ ...call(needle, ERC20_BALANCE_ABI, 'symbol'), optional: true }])
    if (symbol) {
      const search = await api.get('token-search', { query: symbol })
      if (!Array.isArray(search.data)) throw new Error('TOKEN_SEARCH_INVALID')
      const exact = search.data.filter(row => String(row.token).toLowerCase() === needle.toLowerCase())
      if (exact.length === 1) return { ...search, data: verifiedRow(exact[0], needle) }
    }
  }
  const start = input.page ?? 0, maxPages = input.maxPages ?? 10
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('INVALID_RESOLUTION_PAGE')
  let catalogId = input.catalogId
  for (let page = start; page < start + maxPages; page++) {
    const catalog = await api.get('token-catalog', { page, catalogId, sort: 'new' })
    if (!Array.isArray(catalog.data?.rows)) throw new Error('TOKEN_CATALOG_INVALID')
    catalogId = catalog.data.catalogId
    const matches = catalog.data.rows.filter(row => String(row.token).toLowerCase() === needle.toLowerCase())
    if (matches.length > 1) throw new Error('TOKEN_AMBIGUOUS: multiple community entries for this address')
    if (matches.length === 1) return { ...catalog, data: verifiedRow(matches[0], needle) }
    if (!catalog.data.hasMore) throw new Error('TOKEN_NOT_FOUND')
  }
  throw new Error(`TOKEN_RESOLUTION_INCOMPLETE: retry with page=${start + maxPages} catalogId=${catalogId}, or provide its exact tick`)
}
