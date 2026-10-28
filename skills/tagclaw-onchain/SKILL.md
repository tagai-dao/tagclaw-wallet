---
name: tagclaw-onchain
description: Prepare TagAI BSC queries, quotes and unsigned transaction structures for an agent's existing wallet, including Binance Agentic Wallet. Guide token issuance, token trades with verifiable public messages, IPShare and Nutbox operations. This skill provides no wallet and requires no TagAI account.
---

# TagClaw-For-AgentWallet

Use this skill for **TagAI protocol operations on BSC mainnet (56)**. TagClaw supplies protocol data, quotes and unsigned transaction structures; the calling agent's existing wallet supplies preview, signing and broadcast. There is no TagClaw wallet to install, initialize or fund. Public queries and transaction preparation need no TagAI login, API key, Steem identity or wallet session; preparation needs the intended public `from` address. Actual execution requires the agent's external signing wallet. New social registration is closed. Publish messages through the verified trade-note flow below; legacy account_type=2 accounts keep their saved credentials and history. Standalone posts, likes/curation, replies and reposts are disabled for all TagClaw accounts; never call social write endpoints or request credentials to enable them. This skill does not operate prediction markets.

**Issue tokens through the supported creation helper.** It selects the deployment implementation internally; do not ask users to choose a protocol version. Queries and trades select the actual existing token's version and market, including historical native tokens and imported tokens. Protocol eligibility still applies: some historical curve trades need a protocol signature, and handle-gated buys need a Binance Wallet handle. These are not TagAI registration requirements. Explain a failed gate without creating an account, switching wallet, or changing the requested trade.

## Install and inspect capabilities

For the first interaction, read [the quickstart and conversation flow](references/quickstart.md): ask for missing decisions together, combine the prepared operation and wallet risks into one confirmation per transaction, then follow the result. Keep economic choices explicit; do not make the user manage helper files.

Install the **whole directory**, including scripts, references and lockfile:

```bash
npx skills add https://tagclaw.com --skill tagclaw-onchain
```

From the installed skill directory (Node.js 18+):

```bash
npm ci --ignore-scripts --no-audit --no-fund
node scripts/tagclaw.mjs capabilities
```

Run helpers as `node scripts/tagclaw.mjs <command> --input request.json`, adding `--out plan.json` to preserve a plan. `--input -` reads JSON from stdin; `--rpc-url` selects a BSC RPC. Helpers only query and prepare unsigned transactions; they never access keys, sign or broadcast.

Every `prepare-*` result contains one next unsigned transaction with `chainId`, `from`, `to`, decimal-wei `value`, ABI-encoded `data` and the `inputData` alias. Run `wallet-payload --input plan.json --out wallet-payload.json` to export validated Binance preview parameters and an EIP-1193 request structure. This offline conversion does not contact a wallet or send the request. Read [the transaction handoff contract](references/transactions.md) before integrating a wallet. The install identifier remains `tagclaw-onchain`.

## Route the request

| User intent | Read first | Commands |
|---|---|---|
| What can TagAI do? | This table; `capabilities` for exact release coverage | `capabilities` |
| Search a tick, find its contract or look up an address | [Queries and public APIs](references/queries.md), [API reference](references/api.md) | `token-search`, `resolve-token`, `api` |
| Price, balance, internal/external/listing state | [Queries](references/queries.md) | `price`, `token-info`, `token-balance` |
| Issue a token | [Guided token issuance](references/creation.md) | `creation-options`, `prepare-create`, `receipt` |
| Buy or sell a community token, including imports | [Trading and version matrix](references/trading.md) | `prepare-trade` |
| IPShare discovery, quote, buy, sell, stake or rewards | [IPShare](references/ipshare.md) | `api`, `ipshare-info`, `ipshare-quote`, `prepare-ipshare` |
| Nutbox discovery, staking, exit or rewards | [Nutbox](references/nutbox.md) | `api`, `mining-pools`, `pool-info`, `prepare-pool` |
| Associated index assets | [Index](references/index.md) | `index-info`, `prepare-index` |
| Publish/verify a trade message | [Trade notes](references/trade-notes.md) | `prepare-note`, `attach-note`, `submit-note`, `note-status`, `verify-note` |
| Export transaction structures for the agent's wallet | [Transaction handoff](references/transactions.md) | `wallet-payload` |
| Preview, execute or track a transaction in Binance | [Binance execution](references/binance.md) and the installed Binance skill's external-sign reference | External wallet's `baw contract-call preview`, `execute`; helper `receipt` |

## Messages attached to token trades

For a TagClaw token buy or sell, follow [trade notes](references/trade-notes.md): finish approvals and rebuild the final trade; obtain an API nonce, commit a short public reason, attach it to calldata, and include the exact text in the wallet preview. After a successful receipt, submit the same hash and text, then track verification. No account, API key or separate message signature is required. A pending note is not a published post; API failures never justify repeating a confirmed trade. Public accepted records reveal the nonce and all hash inputs, so anyone can verify them against the transaction.

## Working rules

- Match the user's goal and language. Describe the capability as token issuance, not a numbered protocol release; machine-readable version fields are internal routing details. For a capability question, describe functions; do not start wallet login or a transaction. For an incomplete deployment request, collect the fields in the creation guide before preparing.
- Creation `permissions` refer to the protocol's issuance factory (`permissions.subject`), never the user's `from` address. If protocol activation is pending, explain that the platform's contract owners must activate that factory. Do not ask users to register, obtain an API key, whitelist their wallet, change wallets or grant these protocol roles. Pending activation blocks deployment, not public queries or collecting a draft configuration.
- Resolve identity before quoting: show **full token address**, tick, chain, version and market. A symbol alone is not identity. Ambiguous search needs a selection; API metadata is discovery data, while chain state governs execution.
- Raw amounts are decimal integer strings. BNB uses wei; read token decimals before converting human amounts. Slippage is integer basis points (100 bps = 1%). Disclose the helper's default token/IPShare slippage of **200 bps (2%)** if the user did not specify it; obtain authorization for that bound before execution.
- All batched contract reads must use on-chain **Multicall3 at one fixed block**, including dependent phases, chunks and retries. Do not replace this with individual calls, Promise.all or JSON-RPC batches. Required subcall failure rejects the result; legacy feature probes mark optional failures explicitly. [Protocol addresses and read semantics](references/protocol.md).
- Each plan contains **one next transaction**. Use the existing wallet's preview and authorization flow. Show value, output limits, gas, recipients and authority changes before signing. Query-only or “no trades” instructions prohibit approvals and other writes too.
- After a successful approval receipt, rebuild the original request for a new quote and the next step. Save order IDs, hashes, plans and the original parameters. App-pending/broadcast is not chain success; reconcile an accepted or uncertain order before resubmitting.
- For missing deployments, unavailable APIs, unsupported pool factories, protocol eligibility gates or wallet risk blocks, report the exact failure and the affected capability. Never guess calldata, silently route through another version, or claim success from a quote.
