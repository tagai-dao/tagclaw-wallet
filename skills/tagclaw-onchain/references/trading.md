# Token trading

Resolve the full address and market. TagAI internal trades use the token's actual version; **all external trades use AgentSwapWrapper** `0x3F7146D3D234Ed4C2021DE1A5B14da8754e6C577`. Do not prepare a trade through ImportedTokenSwapWrapper, legacy wrappers or Universal Router directly.

| Market | Route |
|---|---|
| Native V1–V9/V11 internal | Version-specific token buy/sell ABI. V5 buys and V8 buys/sells require existing protocol eligibility signatures. |
| Native V13–V18 internal | Token buy/sell; reject listing-pending state. V15+ ordinary buys require a Binance handle; V17/V18 enforce cumulative internal buys ≤10 million tokens per wallet. Sales do not reset the limit. |
| Native listed V1–V6 | AgentSwapWrapper using the canonical Pancake V2 pair. |
| Native listed V7–V18 | AgentSwapWrapper using the token's verified Infinity CL pool. |
| Imported tokens | AgentSwapWrapper with actual V2, V3 or Infinity CL metadata; no native curve. |

There is no assumed native V10/V12 deployment. Unknown versions or pool types fail explicitly.

```json
{
  "from":"0xCURRENT_BSC_WALLET",
  "token":"0xFULL_TOKEN_ADDRESS",
  "side":"buy",
  "amount":"1000000000000000",
  "slippageBps":200
}
```

```bash
node scripts/tagclaw.mjs prepare-trade --input trade.json --out plan.json
```

Use `tick` instead of `token` only after exact resolution. `amount` is BNB wei for buys, raw token units for sells; read decimals. Optional `sellsman` selects an IPShare referral. Copy buys use `followTxHash` or `followAgentId`; the helper resolves and pins the original trader's referral and canonical trade-curation source.

Every Agent trade requires the actual sender's Binance handle. AgentSwapWrapper also creates the sender's missing IPShare; Pump18 does the same for internal buys and sells. Creation must be free and IPShare must be active; otherwise prepare a separate IPShare creation if requested, then rebuild. Only the sender receives automatic creation.

External sells approve **AgentSwapWrapper** for the exact amount. After any reset/approval succeeds, rerun preparation before the swap. Old-wrapper or Permit2 allowances do not authorize the new wrapper.

The wrapper accepts these source encodings; helpers construct them from verified pool metadata:

| `sourceType` | `sourceData` |
|---|---|
| `0` V2 | `abi.encode((address router,address pair))` |
| `1` V3 | `abi.encode((address router,address quoter,address pool))` |
| `3` Infinity CL | `abi.encode((address quoter,(address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters) pool))` |

V4 pool IDs are not pair addresses. Non-BNB quote assets require a configured executable BNB bridge route in the wrapper's NutboxRouter. Never substitute a direct BNB pool or arbitrary router.

Quotes use AgentSwapWrapper's net buy/sell output, including current wrapper fees. Platform and referral fees default to 20 bps each but are read from chain. Nutbox token fees default to zero and may be enabled per token. DEX and Hook fees are additional. Transfer taxes and caller-dependent Hook behavior require the **full wallet simulation from the actual sender**; a quote is an estimate. Never claim simulation success from a quote or silently raise slippage.

For a selected referral on a native Infinity pool, the helper checks that the wrapper authorizes the Hook's current code hash. Missing authorization blocks that referral flow until the protocol owner enables it. Do not silently discard the chosen referral or switch wrappers.

For a public reason/confidence, finish approvals and follow [trade messages](trade-notes.md) before wallet preview. A publication failure does not justify another trade. See [wallet execution](binance.md) for signing and result tracking.
