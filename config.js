/**
 * 模块级配置、环境变量管理、通用 API 请求工具
 */
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const EXTERNAL_TAGCLAW_API_KEY = process.env.TAGCLAW_API_KEY || ''

/** 与 install.sh / 沙箱写入的凭证同级：先 .env.clay 再 .env（后者可覆盖） */
const WALLET_ROOT = path.join(__dirname)
dotenv.config({ path: path.join(WALLET_ROOT, '.env.clay'), quiet: true })
dotenv.config({ path: path.join(WALLET_ROOT, '.env'), quiet: true })

// 模块级别配置，仅供同一 Node 进程内的程序化调用使用
const _config = {
  apiUrl: 'https://bsc-api.tagai.fun',
  apiKey: ''
}

function resolveRequestConfig(opts = {}) {
  return {
    apiUrl: opts.apiUrl || _config.apiUrl,
    apiKey: opts.apiKey || _config.apiKey || EXTERNAL_TAGCLAW_API_KEY
  }
}

/**
 * 设置模块级别配置，仅对当前 Node 进程有效
 * @param {{ apiUrl?: string, apiKey?: string }} opts
 */
function configure(opts = {}) {
  if (opts.apiUrl) _config.apiUrl = opts.apiUrl
  if (Object.prototype.hasOwnProperty.call(opts, 'apiKey')) {
    _config.apiKey = opts.apiKey || ''
  }
}

// ─── API 请求 ─────────────────────────────────────────

/**
 * 根据 tick（代币名称）从 community detail API 获取 token 合约地址及元信息
 * @param {string} tick - 代币名称（区分大小写）
 * @returns {Promise<{ token: string, version: number, listed: boolean, isImport: boolean, pair: string | null }>}
 */
async function fetchTokenInfo(tick, requestConfig = {}) {
  const { apiUrl } = resolveRequestConfig(requestConfig)
  const url = `${apiUrl}/community/detail?tick=${encodeURIComponent(tick)}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`fetchTokenInfo failed: HTTP ${resp.status} for tick="${tick}"`)
  }
  const data = await resp.json()
  if (!data || !data.token) {
    throw new Error(`fetchTokenInfo: no token found for tick="${tick}"`)
  }
  return {
    token: data.token,
    version: Number(data.version),
    listed: Number(data.listedDayNumber) > 0,
    isImport: !!data.isImport,
    pair: typeof data.pair === 'string' && data.pair ? data.pair : null
  }
}

async function requestJson(pathname, {
  method = 'GET',
  query,
  body,
  headers
} = {}, requestConfig = {}) {
  const { apiUrl, apiKey } = resolveRequestConfig(requestConfig)
  const url = new URL(`${apiUrl}${pathname}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const resp = await fetch(url, {
    method,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })

  const text = await resp.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!resp.ok) {
    const detail = typeof data === 'object' && data
      ? (data.error || data.message || JSON.stringify(data))
      : String(data || `HTTP ${resp.status}`)
    throw new Error(`${pathname} failed: ${detail}`)
  }

  return data
}

// ─── .env 文件管理 ────────────────────────────────────

function formatEnvLine(key, value) {
  const s = String(value)
  if (/[\s#'"]/.test(s)) return `${key}=${JSON.stringify(s)}`
  return `${key}=${s}`
}

/**
 * 将 EVM 地址与 Steem 材料合并写入 tagclaw-wallet/.env（保留其它已有行）
 * 键名与 POST /tagclaw/register 一致：ethAddr → TAGCLAW_ETH_ADDR；steemKeys.* → TAGCLAW_STEEM_*
 * @param {{ address: string, steemKeys: object }} data
 */
function mergeTagclawWalletEnv(data) {
  const { address, steemKeys } = data
  const envPath = path.join(WALLET_ROOT, '.env')
  const keysToSet = new Set([
    'TAGCLAW_ETH_ADDR',
    'TAGCLAW_STEEM_POSTING_PUB',
    'TAGCLAW_STEEM_POSTING_PRI',
    'TAGCLAW_STEEM_OWNER',
    'TAGCLAW_STEEM_ACTIVE',
    'TAGCLAW_STEEM_MEMO'
  ])
  const entries = {
    TAGCLAW_ETH_ADDR: address,
    TAGCLAW_STEEM_POSTING_PUB: steemKeys.postingPub,
    TAGCLAW_STEEM_POSTING_PRI: steemKeys.postingPri,
    TAGCLAW_STEEM_OWNER: steemKeys.owner,
    TAGCLAW_STEEM_ACTIVE: steemKeys.active,
    TAGCLAW_STEEM_MEMO: steemKeys.memo
  }
  const lines = []
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
      if (m && keysToSet.has(m[1])) continue
      lines.push(line)
    }
  }
  const tail = Object.entries(entries).map(([k, v]) => formatEnvLine(k, v))
  const body = [...lines, ...tail].join('\n').trimEnd()
  fs.writeFileSync(envPath, (body ? body + '\n' : tail.join('\n') + '\n'), 'utf8')
  return envPath
}

module.exports = {
  _config,
  WALLET_ROOT,
  configure,
  resolveRequestConfig,
  fetchTokenInfo,
  requestJson,
  mergeTagclawWalletEnv
}
