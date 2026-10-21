# Pump14 token trading

Use a token **address**, not a name or symbol alone. If starting from a tick, use the public BSC API `GET https://bsc-api.tagai.fun/community/detail?tick=<URL-encoded-tick>` to discover `token` and `version`, then verify with the helper. A cached `listed` or `pair` field does not choose the transaction route. The helper requires registration in the configured Pump14 contract and the expected deployed template.

## Spot price

Write `{"token":"0xTOKEN"}` to `price.json`:

```bash
node scripts/tagclaw.mjs price --input price.json
```

The result is a decimal **BNB per token** spot price, with block metadata. Curve price comes from Pump14; listed price is the inverse of native/token sqrt-price squared. A spot price does not include amount-dependent execution impact. For an actionable quote use `prepare-trade`.

## Prepare a buy or sell

Example `request.json`:

```json
{
  "from": "0xCURRENT_BSC_WALLET",
  "token": "0xPUMP14_TOKEN",
  "side": "buy",
  "amount": "1000000000000000",
  "slippageBps": 200
}
```

```bash
node scripts/tagclaw.mjs prepare-trade --input request.json --out plan.json
```

For `buy`, amount is BNB **wei**. For `sell`, change `side` to `sell`; amount is raw token units (these community tokens use 18 decimals). Optional `sellsman` is a nonzero referral address; omitting it uses the zero-address default. Default slippage is 200 bps; valid range 0–5000. Zero still enforces a minimum.

The helper checks current token balance for sells and native input balance for buys. Gas is checked by the wallet preview. `quote.expectedOut` and `quote.minimumOut` are raw token units on buy, BNB wei on sell.

## Route and authorization semantics

- Unlisted: current `getBuyFeeRatios` determines separately rounded buy fees; the last buy is capped by remaining 650-million-token curve supply. Curve sells use `getSellPriceAfterFee`. The helper constructs Token13-compatible v14 `buyToken`/`sellToken` calls with slippage protection. There is no v8 API-signature step.
- `listingPending`: stop and rebuild after listing finalizes.
- Listed: verify native BNB/token PoolKey, manager and pool ID; quote CLQuoter inside Multicall, then prepare Universal Router's exact-input CL swap. Do not subtract another fixed 2% fee from its quote.
- Listed sell: exact ERC20 allowance to Permit2 and Permit2 allowance to Universal Router are required. If one is missing, the helper returns only that next authorization. It never precomputes a swap to send blindly after approvals. Confirm, rerun, and review the new output until `action` is `v14-v4-sell`.

V4 encoded actions are `0x060c0f` (swap, settle input, take output), wrapped in Universal Router command `0x10`. Native buys carry BNB value; sells carry zero. Preserve `from`, referral data, minimum received and deadline.

Versions 1–13, imported assets, non-native pairs, multi-hop paths, basket asset trading and liquidity management are outside this helper's supported routes. Report an unsupported route rather than falling back to a generic Binance market swap, because that would change the requested protocol operation.
