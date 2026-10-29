# Transaction structures for the agent's wallet

**TagClaw-For-AgentWallet does not provide a wallet.** The helper reads protocol state and constructs unsigned calls. The caller supplies a public BSC sender address and uses its own wallet integration to preview, obtain authorization, sign and broadcast. No wallet session, API key, private key or seed phrase belongs in a helper input or a TagAI API request.

## Prepare and export

Run the relevant `prepare-*` command, such as `prepare-create`, `prepare-trade`, `prepare-ipshare` or `prepare-pool`, using a public `from` address. A wallet login is unnecessary for these read-only preparation steps. Obtain the address from the agent's already-selected wallet or the user; never guess one or initialize a TagClaw wallet.

```bash
node scripts/tagclaw.mjs prepare-trade --input trade.json --out plan.json
node scripts/tagclaw.mjs wallet-payload --input plan.json --out wallet-payload.json
```

The second command runs **offline**. It validates chain, sender/target addresses, amount, calldata aliases, expiry and one-next-transaction semantics, then converts units for wallet interfaces. It does not call a wallet, simulate, sign or send. Full protocol validation belongs to preparation, and actual sender simulation/authorization belongs to the external wallet.

## Plan format (schemaVersion 1)

| Field | Contract |
|---|---|
| `schemaVersion` | `1`; previous unversioned plans are accepted for conversion when otherwise valid |
| `kind` | `unsigned-transaction-plan` |
| `chainId` | Numeric `56` |
| `blockNumber`, `blockHash`, `blockTimestamp`, `multicall` | Source snapshot; batched contract reads share this fixed block |
| `action` | Protocol operation or approval/reset step |
| `expiresAt` | Unix seconds; plans expire within 300 seconds of the source block |
| `quote`, `fees`, `gasCheck`, `authorityChange` | Operation-specific review information; read the full plan |
| `rebuildAfterConfirmation` | If true, this is a prerequisite step; reprepare the original intent after its successful receipt |
| `transactions` | Exactly one next transaction, preserving dependency order |

Each entry in `transactions` contains:

```text
chainId:   56
from:      full public BSC sender address
to:        full verified token, router, IPShare, pool or approval-target address
value:     unsigned decimal string in wei (including "0")
data:      ABI-encoded calldata, 0x-prefixed complete bytes
inputData: alias of data for Binance CLI integration
method:    encoded contract method, for review
```

For a buy, `value` may include BNB input or protocol fees. For ERC20 trades/approvals it may be zero. Never derive `value` from an asset symbol or replace it with a human-readable BNB amount. `to` is the contract receiving this specific call; for an approval it is the token contract, while the authorized spender is encoded in `data`.

## Wallet handoff format

`wallet-payload` returns `kind:external-wallet-handoff`, `schemaVersion:1`, `status:UNSIGNED` and `walletIncluded:false`, with:

- `transaction`: normalized `chainId`, `from`, `to`, decimal-wei `value` and `data`.
- `snapshot`, `expiresAt`, `action`, `review`, `rebuildAfterConfirmation`: context for review and continuation. Keep the original full plan with this export.
- `requiresWalletPreview:true` and `requiresUserAuthorization:true`: conversion is not an executed or authorized transaction.
- `walletRequests.binance`: operation `contract-call preview` and exact CLI parameters `binanceChainId`, `from`, `to`, `value` (decimal wei) and `inputData`.
- `walletRequests.eip1193`: `requiredChainId:"0x38"` plus `request:{method:"eth_sendTransaction",params:[{from,to,value,data}]}`. Here `value` is a hexadecimal JSON-RPC quantity (`"0x0"` for zero), not the decimal helper field.

The EIP-1193 object is a **request template**; handing it to `provider.request` is the consequential signing/submission step. The helper never does that. Before submission, the wallet integration must verify its selected chain is `0x38`, its selected account equals `transaction.from`, and the exact calldata/value matches the reviewed intent. Use that wallet's simulation and authorization flow; there is no universal EIP-1193 preview method to invent.

For Binance execution, run the read-only `wallet-check` and resolve setup/permission issues first. Pass only the exported preview parameters through the [official wallet flow](binance.md), appending `--json`. Inspect the resulting parsed operation, risks and authority changes. Execute only with the **actual successful preview's requestId** after authorization. The helper deliberately returns no fabricated execute requestId or signature.

For another compatible wallet, use the normalized transaction fields with that wallet's supported interface. Preserve units and sender semantics, and handle chain/account changes as invalidating the old review. Gas and nonce selection belong to the wallet; the converter rejects extra transaction fields instead of silently discarding a user-specified gas or nonce option. Handle explicit advanced options through the selected wallet's own supported flow.

## Approvals, pending states and results

An approval plan exports only the approval, never a hidden subsequent swap. After a status-1 receipt, reprepare the original request and review the next transaction. Do not send an array of old quotes as a wallet batch.

Preserve any wallet order ID and accepted hash before retrying. An App-pending order or broadcast hash is not receipt success. Track the external wallet result, then pass `{"hash":"0xACTUAL_HASH"}` to helper `receipt`. On interruption, resume that hash/order rather than signing the template again. Failed/expired wallet previews do not authorize another submission. See [the conversation flow](quickstart.md) for recovery states.

Public queries remain usable even when no signing wallet is available. In that case return the prepared structure and clearly report **unsigned; awaiting an external wallet**, not a completed trade or deployment.

The generic request envelope follows [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193); support for a particular signing method is determined by the selected wallet.
