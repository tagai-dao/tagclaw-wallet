# Trade existing TagAI tokens

Trading uses each token's actual native version or imported DEX source on BSC; do not upgrade an old token, call the current creation factory for it, or replace an import's route with a native curve.

To publish the agent's public reason with a trade, use [trade notes](trade-notes.md) on the final swap plan before wallet preview. Report the successful hash for asynchronous validation; a publication failure never justifies another trade. Public verified posts and activity are available through `api` resource `agent-feed`, filtered by `tick`, `agentId` and `type`.

## Version and market matrix

| Token | Internal market | External market |
|---|---|---|
| Native v1 | Four-argument buy with receiver field; standard sell | Pancake V2 via TagAI wrapper |
| Native v2–v4, v6 | Standard curve buy/sell | Pancake V2 via TagAI wrapper |
| Native v5 | Buy requires protocol eligibility signature; sell is standard | Pancake V2 via TagAI wrapper |
| Native v7 | Standard curve buy/sell | Verified native BNB/token PCS V4 pool |
| Native v8 | Buy **and** sell require protocol signature and deadline | Verified native BNB/token PCS V4 pool |
| Native v9/v11 | Standard curve buy/sell | Verified native BNB/token PCS V4 pool |
| Native v13/v14 | Current dynamic-fee curve; listing may be pending | Verified native BNB/token PCS V4 pool |
| Native handle-gated tokens | Same, with a handle check for ordinary buys | Verified native BNB/token PCS V4 pool |
| Legacy imports, e.g. v6 | No native curve | Legacy V2 import wrapper |
| Imported v10 | No native curve | ImportedTokenSwapWrapper with actual V2/V3/PCS V4 source |

There is no assumed native v10/v12 deployment. Unknown versions or pool types are explicit failures, not permission to reuse a nearby ABI. The helper uses the token's `listed` and (where supported) `listingPending` values, validates factory membership and V4 key binding, and never trusts an API-provided transaction target.

## Prepare a quote and the next unsigned transaction

Resolve the tick/address first, then write:

```json
{
  "from":"0xCURRENT_BINANCE_BSC_ADDRESS",
  "tick":"EXACT_TICK",
  "side":"buy",
  "amount":"1000000000000000",
  "slippageBps":200
}
```

Or replace `tick` with full `token`. `amount` is BNB wei for buys and raw token units for sells. Read decimals rather than assuming 18 for imported tokens. Optional `sellsman` is a user-chosen referral/fee recipient; omit if none. Do not invent one.

```bash
node scripts/tagclaw.mjs prepare-trade --input trade.json --out plan.json
```

Show expected output, **minimum output**, slippage, input, route, sender and recipient, current block and expiry. Default slippage is 200 bps (2%); disclose it. Internal routes with zero requested slippage encode a positive protection check rather than disabling the contract's slippage check.

`prepare-trade` produces one action: an approval/reset, Permit2 permission, or swap. If `rebuildAfterConfirmation:true`, confirm that one action through the wallet, wait for a status-1 receipt, and rerun the original request. Fresh preparation creates a new fixed-block snapshot; do not reuse a quote across approval delays. Exact approvals are used, including reset-to-zero where necessary.

For wallet preview/execution/order tracking, read [Binance execution](binance.md). A quote is not authorization to approve or swap. Conditional instructions such as “buy when it drops” do not authorize an immediate market trade; this helper does not implement trigger orders.

## Protocol restrictions and recoverable states

- **v5 buy/v8 curve trades:** preparation accepts `signature` and, for v8, `deadline` from a legitimate existing protocol authorization. Those historical signing services enforce platform eligibility. Without it, return `LEGACY_ELIGIBILITY_REQUIRED`; explain that this particular historical curve trade cannot be completed from the registration-free workflow. Do not register an account, fabricate a signature, omit the signature, or trade immediately elsewhere. Public queries remain available.
- **Handle-gated buys:** a connected Binance session alone does not prove a handle exists. Check the selected address on chain. Missing handle blocks that ordinary curve buy; creation/atomic initial buy, sells and listed trades are exempt. Guide the user to the Binance Wallet handle flow, not TagAI social registration.
- **v17 cumulative curve buys:** the helper reads `innerMarketBought(from)` and `INNER_MARKET_BUY_LIMIT()` at the quote snapshot and rejects an expected buy above the remaining allowance. Selling does not reset that cumulative allowance. Listed-market trades are unaffected. Creation remains on the separately supported creation implementation.
- **Listing pending:** wait for listing finalization and reprepare. Do not use stale API pair metadata.
- **V2/V3/V4 imports:** retain `isImport`, `version`, `dexVersion` and full `pair` metadata. A V4 bytes32 ID is not a V2 address; an imported token may have a non-BNB quote leg. The current import wrapper quotes the actual route; do not force a direct BNB pair.
- **API unavailable or unresolved identity:** report the failure. Do not guess an unknown token's protocol version or execute against an API-supplied arbitrary router.

Copy buys accept `followTxHash` or `followAgentId` on `prepare-trade`. The helper resolves an accepted source, pins its canonical trade-curation source ID and passes the original trader wallet as the IPShare subject. Prepare the message with the resolved exact `followTxHash`; do not substitute an unrelated sellsman. See [trade notes](trade-notes.md).
