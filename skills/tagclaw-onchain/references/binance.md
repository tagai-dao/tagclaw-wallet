# Execute with an existing Binance Agentic Wallet

This reference uses the official `baw` CLI. Keep the installed Binance Agentic Wallet skill's current version and authorization requirements; read its `references/external-sign.md` when executing. This skill never logs in, enables permissions, or submits transactions on the user's behalf automatically.

This is an adapter for the **calling agent's external Binance wallet**, not a wallet included with TagClaw-For-AgentWallet. `wallet-payload --input plan.json` exports `walletRequests.binance.parameters` for this adapter. Another wallet can instead use the [normalized transaction or EIP-1193 request](transactions.md); it does not need `baw` just to prepare a plan.

## Check before an intended transaction

Pure queries, prices and unsigned-plan-only requests need none of these checks.
For an intended deployment, buy/sell, stake, claim or index operation, check early
and recheck immediately before preview:

```bash
node scripts/tagclaw.mjs wallet-check
```

Optional input selects the operation and checks the requested sender:

```json
{"operation":"trade","from":"0xPUBLIC_BSC_ADDRESS"}
```

`trade` is the default and includes Agent ID eligibility. Use `create`, `ipshare`,
`nutbox` or `index` for those operations; they do not add a token-trade handle gate.
The command runs only these official read commands, with `--json`:

```bash
baw cli-check --required-version 1.12.0 --json
baw wallet status --json
baw wallet address --json
baw wallet settings --json
baw wallet tx-lock --binanceChainId 56 --json
baw wallet agent-id --json   # token trades only
```

| Check | Required interpretation / fix |
|---|---|
| CLI missing or too old | Install/update the official skill and `@binance/agentic-wallet` CLI below; don't install a local TagClaw signing wallet. |
| Connection | Require `CONNECTED`; `UNCONNECTED` needs sign-in, `CREATING` needs wallet creation to finish. The CLI status is authoritative. |
| Sender | Select `data.addresses[]` entry with `binanceChainId:"56"`. Its full address must equal the intended `from`; resolve a mismatch with the owner and rebuild. |
| Session | `sessionExpireTime` must be in the future; reconnect if expired. |
| Developer Mode | Require `devMode.enabled:true` and future Unix-seconds `devMode.expiresAt` before external-call preview. |
| Developer limits | Inspect `devMode.balanceExceeded`, `devMode.dailyLimit` and **`developerModeQuotaUsed`**, not DeFi/general usage. Limits are USD, not BNB/wei; preview determines the actual spend. |
| Token permissions | Inspect `tradeAllTokens`. `true` permits arbitrary-token scope. `false` means restricted scope: tell the owner new/unlisted tokens may be disallowed, and let them retain the allowed-token scope or explicitly enable **Trade all tokens**. It does not mean every token is rejected. |
| Risk policy | Report `abnormalTxnHandling` (`AutoReject` / `NeedConfirmation`) when relevant; retain the owner's choice. Never switch rejection to confirmation automatically. |
| Pending lock | Require `UNLOCKED`. Reconcile the existing transaction/App confirmation when `LOCKED`; don't create a duplicate order. |
| Agent ID | For token trades require `wallet agent-id` to report `claimed:true`. A service error is unknown eligibility, not proof that no handle exists. The protocol still verifies the actual sender's on-chain handle. |

The helper prints only selected status fields, not raw wallet/session output.
`BLOCKED`/`canPreview:false` means fix the reported issue before wallet preview.
`POLICY_REVIEW` means token scope is restricted/unknown; resolve the owner's
policy before execution. If the owner retains a narrower policy, use only permitted tokens; a valid wallet
preview may establish whether the intended token is permitted; do not demand a
wallet-wide permission expansion. `READY_FOR_PREVIEW` is not authorization or a
promise that the transaction will pass simulation. Every trade still needs the
wallet's actual preview and authorization. These settings are separate from
ERC20/Permit2 allowances and Binance handle ownership.

## Guide missing setup

Install the official wallet skill and required CLI in the **agent's execution
environment**, with the owner's authorization:

```bash
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
npm install -g @binance/agentic-wallet@1.12.0
```

Read that installed skill for its current version requirements. If it requires a
newer CLI, follow it rather than downgrading an existing newer installation.

If there is no Agentic Wallet yet, the owner creates one in the Binance App.
For a disconnected existing wallet, follow the official sign-in flow:

```bash
baw auth signin --json
baw auth verify --qrCodeId <actual-returned-qrCodeId> --json
baw wallet status --json
```

Display the returned `pairingCode` and `urlForWeb` exactly as returned. The owner
opens that link and approves in the Binance App. Keep `auth verify` running until
it completes or times out; an expired QR needs a fresh sign-in. Recheck CLI status
instead of assuming the App's success screen means the agent is connected.
Never copy login/session tokens into TagClaw files or API requests.

Settings can only be changed by the owner in **Binance App → Agentic Wallet
management → Settings**. For Developer Mode, the owner enables it, reviews the
risk warning and approves the App signature prompt. Report the actual balance
cap/quota failure if refused; do not invent a fixed cap. For arbitrary token
trading, explain **Trade all tokens** and let the owner choose the required scope.
Re-run settings/preflight after configuration. For an unclaimed trading handle,
guide **Binance App → Web3 wallet → Agent ID** and recheck after confirmation.

Never enable permissions, loosen limits/risk controls, sign in or broadcast just
because a query was requested. Use TagAI's prepared contract call; a generic
Binance market swap does not replace the selected protocol operation.

## Preview the prepared transaction

A helper plan has exactly one entry in `transactions`. Map it to:

```text
baw contract-call preview
  --binanceChainId 56
  --from <plan.transactions[0].from>
  --to <plan.transactions[0].to>
  --value <plan.transactions[0].value>
  --inputData <plan.transactions[0].inputData>
  --json
```

Pass arguments as an array to a subprocess, rather than interpolating plan contents into shell code. Example, from the skill directory:

```javascript
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const plan = JSON.parse(fs.readFileSync('plan.json', 'utf8'))
if (plan.chainId !== 56 || plan.transactions.length !== 1 || Date.now() / 1000 >= plan.expiresAt) {
  throw new Error('Wrong chain, multiple actions, or stale plan: rebuild before preview')
}
const tx = plan.transactions[0]
// First verify tx.from equals the currently selected Binance BSC address.
const response = spawnSync('baw', [
  'contract-call', 'preview', '--binanceChainId', '56',
  '--from', tx.from, '--to', tx.to, '--value', tx.value,
  '--inputData', tx.inputData, '--json'
], { encoding: 'utf8' })
if (response.status !== 0) throw new Error(response.stderr || 'Wallet preview failed')
const preview = JSON.parse(response.stdout)
if (!preview.success || !preview.data?.requestId) throw new Error('Preview blocked or incomplete')
// Persist this result and show its simulation/risk/authority changes before asking to execute.
console.log(JSON.stringify(preview))
```

Show the operation, expected/minimum output or exact fee, recipients, `parsedTx`, `simulationResult`, `risks` and `authorityChanges` as applicable. Follow the official Binance skill's explicit-confirmation requirement before executing. `requireConfirmation=false` means the backend may broadcast directly; it does not itself authorize an agent to execute.

Combine these fields with the prepared intent into the [single transaction confirmation](quickstart.md). Do not ask to approve the same economic parameters both before preparation and again after preview. Separate dependent transactions still require their own reviewed previews and authorizations. Keep the user's wallet-wide security policy; a third-party tutorial's suggested “all tokens” or risk-handling setting is not a TagAI prerequisite to apply automatically.

Do not send custom gas-price parameters. Binance estimates gas during preview. Check simulation balance changes and retain enough gas; for creation retain at least 0.001 BNB after value **and** gas. A helper plan is not a claim that Binance risk controls will accept the contract.

## Execute, then reconcile

After authorization, use only the successful preview's actual `requestId`:

```text
baw contract-call execute --requestId <preview.data.requestId> --json
```

Persist `orderId`, `requestId`, request and plan before advancing:

- `BROADCASTED`: save `txHash`; poll the receipt until confirmed or reverted.
- `PENDING_CONFIRMATION`: save `orderId`; the user must confirm in the Binance App. No transaction hash may exist yet. Resolve the order using the installed Binance skill's order tracking commands; do not call execute again to create a second order.
- Rejected/expired preview: if no order or transaction was accepted, rebuild and preview again. Never invent a request ID.
- Network timeout: treat the result as uncertain. Query wallet order/history/lock status first. Do not immediately resubmit.

Use the installed wallet's documented tracking commands; for chain transactions these include `baw wallet tx-history --binanceChainId 56 --type pending --json`, `baw wallet tx-history --binanceChainId 56 --tx <txHash> --json`, and `baw wallet tx-lock --binanceChainId 56 --json`. Match the persisted order/hash and prepared sender/operation; do not substitute market-swap orders for contract-call orders or invent an order-status command. An App-pending order without a hash must be reconciled before another execute is attempted.

Once a hash is available, write `{"hash":"0x..."}` to `receipt.json` and run:

```bash
node scripts/tagclaw.mjs receipt --input receipt.json
```

`CONFIRMED` means receipt status 1; `REVERTED` means status 0. `PENDING_OR_UNKNOWN` means wait and investigate, not broadcast again. Quotes and V4 deadlines may expire during App confirmation; never report a reverted swap as a completed buy/sell.

If `rebuildAfterConfirmation` was true, only an authorization was prepared. After its status-1 receipt rerun the original prepare request; review and authorize the next step separately. This includes reset-to-zero approval, exact ERC20 approval and Permit2 approval.

Official references:

- [Official preflight](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/preflight.md)
- [Authentication](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/authentication.md)
- [Agent ID status](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/agent-id-claim-status.md)
- [External contract calls](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/external-sign.md)
- [Wallet addresses and pending-transaction locks](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md)
- [Security settings and expiry](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md)
