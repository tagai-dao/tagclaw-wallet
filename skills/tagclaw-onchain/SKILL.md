---
name: tagclaw-onchain
description: Prepare and inspect TagClaw BSC on-chain operations using an existing external wallet, including Binance Agentic Wallet. Use for Pump14 community-token quotes, buys, sells and creation, IPShare positions, and supported Nutbox staking and reward actions. Produces unsigned transactions for the current wallet; social posting and account registration use the separate TagClaw social skill.
---

# TagClaw On-chain

Use the agent's existing BSC wallet. This skill supplies protocol knowledge, read-only quotes and **unsigned** transaction plans. Its helper never initializes wallets, reads signing credentials, signs, approves, or broadcasts. A TagClaw account, API key and Steem keys are not required for these on-chain actions.

## Setup and entrypoints

Install this skill from `tagai-dao/tagclaw-wallet`, skill name `tagclaw-onchain`. From this skill's directory, run `npm ci --ignore-scripts --no-audit --no-fund` (Node.js 18+). Dependencies are confined to ethers; the helper does not depend on ClawWallet. Refresh the complete skill folder when upgrading, including scripts, reference files and package lock.

```bash
node scripts/tagclaw.mjs --help
node scripts/tagclaw.mjs deployments
node scripts/tagclaw.mjs prepare-trade --input request.json --out plan.json
```

`--input -` reads JSON from stdin. `--rpc-url <url>` or `TAGCLAW_BNB_RPC` selects a BSC RPC. BNB amounts use **wei**, token amounts use raw integers, amounts in JSON should be decimal strings, and slippage is integer basis points. Only BSC mainnet (`56`) is supported.

Read only the reference needed for the task:

| Task | Reference | Helper |
|---|---|---|
| Existing Binance wallet signing, preview and order tracking | [Binance execution](references/binance.md) | Wallet's `baw` CLI |
| v14 token price, curve/V4 buy or sell | [Token trading](references/trading.md) | `price`, `prepare-trade` |
| Create v14 community and reconcile receipt | [Creation](references/creation.md) | `prepare-create`, `receipt` |
| IPShare market, staking and rewards | [IPShare](references/ipshare.md) | `ipshare-info`, `prepare-ipshare` |
| Supported Nutbox pool participation | [Nutbox](references/nutbox.md) | `pool-info`, `prepare-pool` |
| Addresses, Multicall and supported versions | [Protocol constraints](references/protocol.md) | `deployments` |

## Execution contract

1. Get the selected wallet's **BSC** address. Use it as `from`; never select a different wallet because a command fails.
2. Save a request JSON and run the appropriate read-only helper. Inspect `action`, `quote`, fees, approval scope, recipient and calldata. The returned plan contains **one next transaction**, not a complete multi-transaction order.
3. Execute through the existing wallet's normal preview, user-authorization and signing flow. For Binance, follow [Binance execution](references/binance.md). There is no need to export a private key or use the signing commands from the main tagclaw-wallet CLI.
4. Persist the request, plan, wallet order/request identifiers, transaction hash and status. A broadcast is not a confirmation. Reconcile the same order/hash after a timeout; do not submit a duplicate.
5. After a successful receipt, if `rebuildAfterConfirmation` is `true`, rerun the original request. The helper reads a new snapshot and returns the next necessary authorization or a newly quoted trade.

`expiresAt` is Unix seconds, normally the source block timestamp plus 300 seconds. Rebuild expired or materially stale plans **before** wallet preview. If the wallet already accepted an order or is awaiting App confirmation, resolve that order first. Do not replace it with a new order just because a local plan aged out. Approval transactions can remain valid on chain after a plan's quote expires; re-read allowances and rebuild afterward.

## Protocol invariants

All batched contract reads use **on-chain Multicall3 aggregate3**. Dependent phases, chunks and split retries use the same block number. Every chunk verifies an on-chain block-number anchor; failures or missing required data reject the result. Do not replace this with Promise.all of eth_call, JSON-RPC batching, readContract loops, or individual-call fallbacks. Required deployment or caller-semantics incompatibility must be reported and resolved explicitly.

Use chain state for listed/pending/supply/fees, not cached API listing flags. Do not route older/imported tokens through the v14 helper. A failed pool-factory or deployment check is a boundary, not a reason to guess another ABI.

Keep user ownership and fee choices explicit. A prepared transaction still needs wallet simulation and adequate BNB for gas. Do not lower minimum output to zero or increase slippage to get a failed preview through. For arbitrary external wallets, pass `chainId`, `from`, `to`, `value` and `data` exactly; `inputData` is the same calldata under Binance's field name.
