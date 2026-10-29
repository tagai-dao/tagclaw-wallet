import { execFile } from 'node:child_process'

export const REQUIRED_BAW_VERSION = '1.12.0'
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0+$/i.test(value)
const install = `npm install -g @binance/agentic-wallet@${REQUIRED_BAW_VERSION}`
const settingsAction = 'Open Binance App → Agentic Wallet management → Settings, review the setting, then rerun wallet-check.'
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

// The caller passes only the fixed read commands below. Never expose raw CLI
// output, stderr or credentials in a preflight result.
export function runBaw(args) {
  return new Promise((resolve, reject) => {
    execFile('baw', args, { encoding: 'utf8', timeout: 20000, maxBuffer: 1048576, windowsHide: true }, (error, stdout) => {
      if (error?.code === 'ENOENT') return reject(Object.assign(new Error('BAW_NOT_INSTALLED'), { code: 'ENOENT' }))
      try {
        const body = JSON.parse(stdout)
        if (error && body.success !== false) throw error
        resolve(body)
      } catch { reject(new Error('BAW_COMMAND_FAILED')) }
    })
  })
}

export async function walletCheck(input = {}, { run = runBaw, now = () => Date.now() / 1000 } = {}) {
  const operation = input.operation ?? 'trade'
  if (!['trade', 'create', 'ipshare', 'nutbox', 'index'].includes(operation)
    || Object.keys(input).some(key => !['operation', 'from'].includes(key))
    || input.from != null && !address(input.from)) throw new Error('INVALID_WALLET_CHECK_INPUT')
  const issues = [], warnings = [], checks = {}
  const issue = (code, action) => issues.push({ code, action })
  async function read(name, args) {
    try {
      const result = await run([...args, '--json'])
      if (result?.success === true && result.data && typeof result.data === 'object') return result.data
      issue(`${name}_UNAVAILABLE`, 'Retry the installed wallet skill check; unavailable data is not a disabled setting.')
    } catch (error) {
      if (error.code === 'ENOENT') issue('BAW_NOT_INSTALLED', `Install the official Binance Agentic Wallet skill and CLI: ${install}`)
      else issue(`${name}_UNAVAILABLE`, 'Check the installed Binance wallet CLI and connection, then retry.')
    }
    return null
  }
  function report() {
    const policyReviewRequired = checks.tokenPolicy?.tradeAllTokens !== true
    return { kind: 'binance-wallet-preflight', chainId: 56, operation, readOnly: true,
      status: issues.length ? 'BLOCKED' : policyReviewRequired ? 'POLICY_REVIEW' : 'READY_FOR_PREVIEW',
      ready: !issues.length && !policyReviewRequired, canPreview: !issues.length,
      policyReviewRequired, checks, issues, warnings,
      publicQueriesAvailable: true, requiresWalletPreview: true, requiresUserAuthorization: true }
  }
  const cli = await read('CLI', ['cli-check', '--required-version', REQUIRED_BAW_VERSION])
  if (!cli) return report()
  checks.cli = { installed: true, requiredVersion: REQUIRED_BAW_VERSION,
    ...(typeof cli.currentCliVersion === 'string' && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(cli.currentCliVersion) ? { version: cli.currentCliVersion } : {}),
    compatible: cli.needUpdateCli === false }
  if (cli.needUpdateCli !== false) { issue('BAW_UPDATE_REQUIRED', install); return report() }
  const connection = await read('CONNECTION', ['wallet', 'status'])
  if (!connection) return report()
  const status = ['CONNECTED', 'UNCONNECTED', 'CREATING'].includes(connection.status) ? connection.status : 'UNKNOWN'
  checks.connection = { status }
  if (status !== 'CONNECTED') {
    issue('WALLET_NOT_CONNECTED', status === 'CREATING' ? 'Wait for wallet creation, then recheck wallet status.'
      : 'Configure Agentic Wallet in Binance App; follow baw auth signin → auth verify, then confirm CONNECTED with wallet status.')
    return report()
  }
  const accounts = await read('ADDRESS', ['wallet', 'address'])
  const account = Array.isArray(accounts?.addresses) && accounts.addresses.find(row => row && String(row.binanceChainId) === '56' && address(row.address))
  if (!account) issue('BSC_ADDRESS_UNAVAILABLE', 'Read the connected BSC address; never guess a transaction sender.')
  else {
    checks.bscAccount = { address: account.address, matchesRequestedSender: !input.from || input.from.toLowerCase() === account.address.toLowerCase() }
    if (!checks.bscAccount.matchesRequestedSender) issue('SENDER_MISMATCH', 'Resolve the wallet/account with the owner, then rebuild; do not silently change the requested sender.')
  }
  const settings = await read('SETTINGS', ['wallet', 'settings'])
  if (settings) {
    const expires = typeof settings.sessionExpireTime === 'string' ? Date.parse(settings.sessionExpireTime) / 1000 : NaN
    checks.session = { expiresAt: Number.isFinite(expires) ? expires : null, active: expires > now() }
    if (!(expires > now())) issue('SESSION_EXPIRED_OR_UNKNOWN', 'Reconnect through the official Binance wallet flow and recheck status/settings.')
    const dev = settings.devMode || {}, limit = number(dev.dailyLimit), used = number(settings.developerModeQuotaUsed)
    const remaining = limit != null && used != null ? Math.max(0, limit - used) : null
    checks.developerMode = { enabled: dev.enabled === true, expiresAt: number(dev.expiresAt),
      balanceExceeded: typeof dev.balanceExceeded === 'boolean' ? dev.balanceExceeded : null,
      dailyLimitUsd: limit, usedUsd: used, remainingUsd: remaining }
    if (dev.enabled !== true) issue('DEVELOPER_MODE_DISABLED', settingsAction)
    else if (!(number(dev.expiresAt) > now())) issue('DEVELOPER_MODE_EXPIRED_OR_UNKNOWN', settingsAction)
    if (dev.balanceExceeded === true) issue('DEVELOPER_BALANCE_CAP_EXCEEDED', settingsAction)
    if (remaining == null || remaining <= 0) issue('DEVELOPER_QUOTA_UNAVAILABLE', 'Check Developer Mode quota in Binance App. Limits are USD, not BNB/wei; preview validates the actual transaction value.')
    checks.tokenPolicy = { tradeAllTokens: typeof settings.tradeAllTokens === 'boolean' ? settings.tradeAllTokens : null }
    if (settings.tradeAllTokens !== true) warnings.push({ code: 'TOKEN_POLICY_REVIEW', action:
      'Token scope is restricted or unknown. The owner can retain allowed-token scope (wallet preview must permit the intended token) or explicitly enable Trade all tokens in App Settings. Never broaden permissions automatically; restricted scope does not reject every token.' })
    checks.riskPolicy = { abnormalTxnHandling: ['AutoReject', 'NeedConfirmation'].includes(settings.abnormalTxnHandling) ? settings.abnormalTxnHandling : 'UNKNOWN' }
  }
  const lock = await read('TX_LOCK', ['wallet', 'tx-lock', '--binanceChainId', '56'])
  checks.txLock = { status: ['LOCKED', 'UNLOCKED'].includes(lock?.status) ? lock.status : 'UNKNOWN' }
  if (lock && lock.status !== 'UNLOCKED') issue('WALLET_LOCKED_OR_UNKNOWN', 'Reconcile the existing transaction or Binance App confirmation before starting another transaction.')
  if (operation === 'trade') {
    const id = await read('AGENT_ID', ['wallet', 'agent-id'])
    checks.agentId = { claimed: typeof id?.claimed === 'boolean' ? id.claimed : null }
    if (id?.claimed === false) issue('AGENT_ID_REQUIRED', 'Claim an Agent ID in Binance App → Web3 wallet → Agent ID, wait for confirmation, then recheck once.')
    else if (id && id.claimed !== true) issue('AGENT_ID_UNKNOWN', 'Retry the official Agent ID check; a service error is not an unclaimed handle.')
  }
  return report()
}
