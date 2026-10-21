# Associated index tokens

`token` is the community token, not the index address. The helper resolves and verifies its Basket V4 index on chain.

```json
{"from":"0xCURRENT_BSC_WALLET","token":"0xCOMMUNITY_TOKEN"}
```

```bash
node scripts/tagclaw.mjs index-info --input request.json
```

Returns index address/readiness, underlying assets and weights/reserves, effective supply, wallet index balance, buyback reward and claimable fees. An index may not exist before listing; `ready:false` reports that state.

For actions add fields below and run `prepare-index`:

| action | Extra fields | Result |
|---|---|---|
| `buy` / `sell` | `amount`, optional `slippageBps` (1–500, default 100) | Buy with **USDT raw units**, sell raw index shares |
| `claim-index` | none | Claim the community token's pending buyback/index reward |
| `claim-fees` | none | Claim index-holder fees to this wallet |
| `claim-creator-fees` / `claim-launcher-fees` / `claim-frontend-fees` | none | Claim to the matching on-chain payout recipient |
| `redeem` | `amount`, `nativeFeeCap` (BNB wei), optional `legMask` boolean array | Burn shares for selected underlying assets; unused native fee refunded |

```bash
node scripts/tagclaw.mjs prepare-index --input request.json --out plan.json
```

Buy/sell uses the verified Basket router, not a community-token curve. Exact ERC20 approval may be returned first; confirm and rerun. Execution quotes use CLQuoter with protected aggregate and per-leg minima at one Multicall snapshot; no NAV fallback. First-ever index buy additionally requires positive raw per-asset `legMins` from current quotes/user limits. Existing-index buy limits derive from reserves and minimum shares. Do not invent first-mint limits.

Redeem computes native fee from current selected-asset quotes; `nativeFeeCap` must cover it and is the maximum value sent. Wallet preview checks current execution and gas. LP mining is separate: use `mining-pools` then `prepare-pool`. Index creation is part of the community lifecycle; this entrypoint does not perform arbitrary standalone-basket creation, owner rebalancing or permission changes.
