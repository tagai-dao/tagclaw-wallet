# Execute with an existing Binance Agentic Wallet

This reference uses the official `baw` CLI. Keep the installed Binance Agentic Wallet skill's current version and authorization requirements; read its `references/external-sign.md` when executing. This skill never logs in, enables permissions, or submits transactions on the user's behalf automatically.

## Check the selected wallet

```bash
baw wallet status --json
baw wallet address --json
baw wallet settings --json
baw wallet tx-lock --binanceChainId 56 --json
```

Require status `CONNECTED`. Read `data.addresses[]` and select the entry whose `binanceChainId` is `"56"`; its `address` is the helper request's `from`. If disconnected, use the wallet's existing connection flow. Changing providers or initializing a local TagClaw wallet does not repair a Binance session.

Custom calls require `devMode.enabled`. Developer Mode, its expiry and quota are controlled in the Binance App. If disabled, expired, over quota or risk-blocked, report the returned reason; the agent cannot loosen these settings. Check `sessionExpireTime` too. If `wallet tx-lock` reports `LOCKED`, reconcile the pending on-chain transaction or App confirmation before creating another order.

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

Once a hash is available, write `{"hash":"0x..."}` to `receipt.json` and run:

```bash
node scripts/tagclaw.mjs receipt --input receipt.json
```

`CONFIRMED` means receipt status 1; `REVERTED` means status 0. `PENDING_OR_UNKNOWN` means wait and investigate, not broadcast again. Quotes and V4 deadlines may expire during App confirmation; never report a reverted swap as a completed buy/sell.

If `rebuildAfterConfirmation` was true, only an authorization was prepared. After its status-1 receipt rerun the original prepare request; review and authorize the next step separately. This includes reset-to-zero approval, exact ERC20 approval and Permit2 approval.

Official references, reviewed 2026-10-21:

- [External contract calls](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/external-sign.md)
- [Wallet addresses and pending-transaction locks](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/wallet-view.md)
- [Security settings and expiry](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/wallet-setting.md)
