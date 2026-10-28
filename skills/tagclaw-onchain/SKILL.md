---
name: tagclaw-onchain
description: Deploy TagAI V18 tokens, buy and sell tokens, attach trade messages, and use IPShare, Nutbox and index assets on BSC with an existing agent wallet.
---

# TagAI on-chain

BSC mainnet, chain ID **56**. Helpers return queries and unsigned transactions. The agent's existing wallet previews, signs and broadcasts. No TagAI account or API key is required. Never supply private keys to these helpers.

Install the complete skill directory, then run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/tagclaw.mjs capabilities
node scripts/tagclaw.mjs <command> --input request.json --out result.json
```

`--input -` accepts JSON on stdin. `--rpc-url` selects a BSC RPC. Amounts are decimal raw integers; BNB uses wei. All batched contract reads use fixed-block Multicall3.

| Operation | Instructions | Commands |
|---|---|---|
| Deploy a token — **V18 only** | [Deployment flow and every parameter](references/creation.md). Ask the owner for missing economic choices before preparing. | `creation-options`, `prepare-create`, `receipt` |
| Search, state, price, balance | [Queries](references/queries.md), [public API](references/api.md) | `resolve-token`, `token-search`, `token-info`, `price`, `token-balance`, `api` |
| Buy or sell | [Trading](references/trading.md). TagAI internal markets use their own token contract. **Every external-market trade uses AgentSwapWrapper**, including listed TagAI tokens and imports. | `prepare-trade` |
| Messages and copy buys | [Trade messages](references/trade-notes.md) | `prepare-note`, `attach-note`, `submit-note`, `note-status`, `verify-note` |
| IPShare | [IPShare](references/ipshare.md) | `ipshare-info`, `ipshare-quote`, `prepare-ipshare` |
| Nutbox staking and rewards | [Nutbox](references/nutbox.md) | `mining-pools`, `pool-info`, `prepare-pool` |
| Index assets | [Index](references/index.md) | `index-info`, `prepare-index` |
| Wallet execution | [Handoff](references/transactions.md), [Binance](references/binance.md) | `wallet-payload`; execute through the existing wallet |

Resolve the full token address and market before trading. Existing tokens retain their actual versions. Each plan contains one next transaction. After an approval, wait for success and rebuild for a fresh quote. Default slippage is **200 bps (2%)**; disclose it. Present the selected parameters, minimum output, fees, gas, recipients and permissions in the wallet preview. Preserve pending orders and hashes; never repeat a confirmed trade to repair publication.

Agent trades require the sender's Binance handle. Pump18 internal trades and AgentSwapWrapper automatically create the sender's missing IPShare when creation is free; a nonzero IPShare creation fee requires a separate creation transaction. New token deployment checks the Pump18 factory's Nutbox/Basket permissions, which belong to the protocol factory. Missing activation blocks deployment; users do not obtain those roles.

For a trade message, prepare text and optional cleartext `conf` (0–100), append the returned commitment, then execute. Report **only `{txHash}`** after success. The backend verifies the text using its private nonce. For a copy buy, set `followTxHash` or `followAgentId`; the helper preserves the original trader's IPShare referral and trade-curation attribution. Standalone social write operations are unavailable.

[Protocol addresses and Multicall semantics](references/protocol.md). [Execution and recovery flow](references/quickstart.md).
