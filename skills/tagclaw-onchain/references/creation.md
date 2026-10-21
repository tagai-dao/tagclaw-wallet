# Create a version15 token

Example `request.json` (choose the assets, weights, fee shares and ownership explicitly):

```json
{
  "from":"0xCURRENT_BSC_WALLET",
  "version":15,
  "tick":"MYCOIN",
  "indexConfig":{
    "name":"My Index","symbol":"MYINDEX",
    "constituentAssets":["0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c","0x2170Ed0880ac9A755fd29B2688956BD959F933F8"],
    "targetWeights":[5000,5000],"basketFeeBps":100,"creatorShareBps":0,"retainCommunityOwnership":true
  },
  "initialBuy":"0",
  "tradeRewardRatio":0
}
```

```bash
node scripts/tagclaw.mjs prepare-create --input request.json --out plan.json
```

`version` defaults to **15**; explicit 14 retains v14 creation. v15 enables handle-gated ordinary internal buys (`binanceWalletOnly:true`); creating and its atomic initial buy do not require a handle. Optional `binanceWalletOnly` must agree with the selected version.

Requirements: tick 1–16 UTF-8 bytes using allowed letters/Chinese/digits/underscores, not numeric-only/reserved; 1–4 distinct approved assets; positive weights total 10000; index name ≤64 bytes and symbol ≤16; basket fee 100–300 bps; creator share 0–3000 bps of distributable fees; explicit ownership boolean. Current candidates: `GET /pump/v15/creation/<creator>` (v14 uses its own endpoint). Example assets are not an automatic selection.

`initialBuy` is BNB wei; `tradeRewardRatio` is 0–8000 bps within current factory permissions. The helper verifies template, asset approvals, and v15 Nutbox/Basket creator authorization. Fees include pump, missing-IPShare, community, settings **per constituent/optional pool**, plus initial buy. Wallet preview must leave ≥0.001 BNB after value and gas.

Save the output `salt` into the request before rebuilding; it preserves the predicted unused `3333` address. After executing, reconcile the hash with `receipt`. The trusted Pump emitter, creator, tick and predicted token must match; retain community and pool results.

Website metadata registration is separate: `POST /pump/v15/register` with `{chainId:56,version:15,binanceWalletOnly:true,tick,token,createHash,logoUrl,desc}` and `X-Chain-Id:56`. Require `c:0` and `d`. A v14 receipt uses `/pump/v14/register`, version 14 and false. These API routes may need deployment before use; never recreate an on-chain token to repair API failure—retry the same confirmed hash.
