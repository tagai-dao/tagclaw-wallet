# Internal and external token trading

Use a verified token address. If starting from a tick, discover it with public `GET https://bsc-api.tagai.fun/community/detail?tick=<URL-encoded-tick>`; on-chain Pump registration determines v14/v15 and listing state.

```json
{"from":"0xCURRENT_BSC_WALLET","token":"0xTOKEN","side":"buy","amount":"1000000000000000","slippageBps":200}
```

```bash
node scripts/tagclaw.mjs prepare-trade --input request.json --out plan.json
```

- `buy`: amount is BNB wei. `sell`: amount is raw token units (18 decimals for these community tokens).
- `slippageBps`: 0–5000, default 200; zero still enforces minimum output. Optional `sellsman` is the referral address.
- Internal market: current dynamic buy fees and remaining curve supply determine the quote. v15 ordinary buyers need a nonempty handle in `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`; the helper checks the actual `from`. Sells do not need this handle. A `.ai` display name or Binance CLI login alone is not proof of the on-chain handle.
- Listing pending: wait and prepare again.
- External market: verified native-BNB/token PCS V4 PoolKey and CLQuoter quote; no extra fixed 2% deduction. The wallet receives a protected Universal Router transaction.
- External sells may first return reset/ERC20/Permit2 authorization. Execute only that next step, wait for status 1, then rerun the same request. Final swap quote and deadline are rebuilt.

`quote.expectedOut` and `minimumOut` are raw token units for buys, BNB wei for sells. Keep BNB for gas. No v8 agent-signature API is used. Imported tokens, versions before 14 and non-native/multi-hop routes require their own adapters; do not silently substitute a generic wallet swap.
