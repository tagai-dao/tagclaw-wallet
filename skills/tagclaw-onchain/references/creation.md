# Create a Pump14 community

Creation uses the current external wallet as creator. It does not create a TagClaw social account or require Steem keys. Require an explicit tick and index choices; do not infer asset weights, creator share or community ownership from the community name.

Example request file `create.json` (replace `from` with the selected BSC address):

```json
{
  "from": "0xCURRENT_BSC_WALLET",
  "tick": "MYCOIN",
  "indexConfig": {
    "name": "My Community Index",
    "symbol": "MYINDEX",
    "constituentAssets": [
      "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      "0x2170Ed0880ac9A755fd29B2688956BD959F933F8"
    ],
    "targetWeights": [5000, 5000],
    "basketFeeBps": 100,
    "creatorShareBps": 0,
    "retainCommunityOwnership": true
  },
  "initialBuy": "0",
  "tradeRewardRatio": 0
}
```

These asset addresses are examples, not an investment selection or a promise of current approval. Discover current candidates from `GET https://bsc-api.tagai.fun/pump/v14/creation/<creator-address>`; the helper checks each constituent's on-chain approval at its snapshot.

Validation: 1–4 distinct nonzero assets, positive integer weights totaling 10000; name 1–64 UTF-8 bytes and symbol 1–16 bytes; basket fee 100–300 bps; creator share 0–3000 bps **of distributable fee share**; explicit boolean ownership choice. Tick follows registration constraints (1–16 allowed letters, Chinese characters, digits or underscores, not numeric-only or reserved).

```bash
node scripts/tagclaw.mjs prepare-create --input create.json --out plan.json
```

`initialBuy` adds BNB wei to creation (default zero). `tradeRewardRatio` selects the optional registered trade mining pool, 0–8000 bps subject to the current factory maximum and committee approval. It defaults to zero. Settings fees apply **per constituent pool plus per optional pool**. The exact transaction value is pump fee + missing-IPShare creation fee + community fee + all settings fees + initial buy.

The helper checks that value plus 0.001 BNB is available, but gas is not included in that read-only balance check. Wallet preview must estimate gas and ensure at least 0.001 BNB remains after **both** value and gas.

The helper searches locally for an unused CREATE2 token address ending in `3333`; output includes `salt` and `predictedToken`. Save the returned salt into the original request before rebuilding, to retain the predicted address. The current template is verified on chain. Do not reuse v8's last-salt-index mechanism.

Execute the single prepared transaction using the existing wallet. Persist its order/hash before waiting. After the status-1 receipt, `receipt` verifies creation calldata, creator, predicted address, tick and Pump14 event emitter, then returns `token`, `createHash`, `nutboxCommunity`, `stakingPools` and `optionalPools`. There is no fixed v14 `nutboxSocialPool`.

## Metadata registration

On-chain creation and website registration are separate. After successful creation, register metadata with the same confirmed hash:

```text
POST https://bsc-api.tagai.fun/pump/v14/register
Content-Type: application/json
X-Chain-Id: 56

{"chainId":56,"version":14,"tick":"MYCOIN","token":"0xCREATED_TOKEN","createHash":"0xCONFIRMED_HASH","logoUrl":"https://YOUR_LOGO","desc":"Community description"}
```

The current v14 endpoint verifies the creation receipt; it does not use the v8 agent-registration flow or Steem material. Require `c: 0` and populated `d`. On API failure persist the creation result and retry registration with **the same hash**. Never create another on-chain token to repair missing website metadata. Image upload and social-account operations are separate tasks and require their own applicable instructions.
