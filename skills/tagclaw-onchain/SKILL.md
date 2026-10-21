---
name: tagclaw-onchain
description: Use an existing BSC wallet, including Binance Agentic Wallet, to create version15 tokens, trade internal/external markets, query token status and balances, and operate Nutbox pools and associated index tokens.
---

# TagClaw On-chain

Use the current wallet on **BSC (56)**. This skill reads chain state and prepares unsigned transactions; the existing wallet previews, signs and broadcasts. No TagClaw social account or Steem keys are needed.

Install dependencies in this skill directory: `npm ci --ignore-scripts --no-audit --no-fund` (Node.js 18+).

Run: `node scripts/tagclaw.mjs <command> --input request.json`. Add `--out plan.json` to save a transaction plan; `--rpc-url URL` selects a BSC RPC. Use decimal strings for raw amounts; BNB is wei, token amounts follow their decimals.

| Function | Commands | Parameters and examples |
|---|---|---|
| Create a token (v15 default) | `prepare-create` | [Creation](references/creation.md) |
| Internal/external token trades | `price`, `prepare-trade` | [Trading](references/trading.md) |
| Token status | `token-info` | [Queries](references/queries.md) |
| Token balance | `token-balance` | [Queries](references/queries.md) |
| Nutbox pools and rewards | `mining-pools`, `pool-info`, `prepare-pool` | [Nutbox](references/nutbox.md) |
| Index tokens and rewards | `index-info`, `prepare-index` | [Index](references/index.md) |

Each plan contains **one next transaction**. Use its `from`, `to`, `value` and `data` with the current wallet. For Binance, follow [wallet execution](references/binance.md). After an approval confirms, rerun the original request for the next step and a fresh quote. Preserve order IDs and hashes; broadcast or App-pending is not chain success. Rebuild stale plans before preview, but resolve an accepted pending order before resubmitting.

v15 ordinary internal-market buys require a nonempty HandleRegistry handle; creation's initial buy and sells are exempt. Creation defaults to v15; v14 remains selectable, and trading detects the actual version. Batch reads must use fixed-block **Multicall3**, including dependent phases and retries; never fall back to individual RPC calls. Wallet preview must validate gas, minimum output and authority changes. [Addresses and constraints](references/protocol.md).
