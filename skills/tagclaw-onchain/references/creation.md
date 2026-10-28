# Guided token issuance

Deploy **V18 tokens only** on BSC using `prepare-create`. Omit `version` or set it to `18`; other creation versions are rejected. Existing-token queries and trades use each token's actual version.

Do not run the social-account registration or local-wallet setup workflow. `POST /pump/v18/register` below records **token metadata after deployment**; it does not create a user account.

## 1. Collect the token identity

Ask for missing identity fields together, in the user's language:

> What tick, description and logo should this token use? You can provide a logo URL or ask for a new logo. Any website, X/Telegram links or tags?

| Field | Destination and validation |
|---|---|
| `tick` | On chain; 1–16 UTF-8 **bytes**, letters, Chinese characters, digits and underscores; not all digits; reserved ticks rejected |
| `desc` | API metadata; optional, up to 1024 characters |
| `logoUrl` | Required for metadata publication; nonempty URL up to 2048 characters |
| `tags` | Optional metadata; at most 3 strings, each at most 64 characters |
| `twitter`, `telegram`, `docs` | Optional metadata links; each at most 2048 characters |

Check `api` resource `tick-available` with `{"resource":"tick-available","tick":"MYCOIN"}`. A returned **true** means taken/reserved, not available. Check again on chain in preparation. Do not silently rename a conflicting tick.

Collect the user's intended image at this step, but defer its upload until the creation-readiness check below passes. `POST https://bsc-api.tagai.fun/qiniu/upload` accepts exactly one multipart field named `file`, using a real local image ≤1 MB. Require a nonempty `url` in the response; no TagAI credentials are required.

## 2. Read current creation choices

Obtain the intended public **BSC sender address** from the calling agent's existing wallet or the user. Preparation does not require wallet login; ownership and connection are checked by the external wallet at execution. Read approved assets and current fee configuration:

```json
{"from":"0xCURRENT_BSC_WALLET"}
```

```bash
node scripts/tagclaw.mjs creation-options --input creator.json
```

This command reads creation-factory configuration and permissions through fixed-block Multicall, filtering the bundled governance candidate catalog by **current on-chain approval**. It works independently of the HTTP creation-options endpoint. Require matching `chainId:56`, factory/version/implementation from the bundled deployment profile, `ready:true` and usable `assets`. `ready:false` exposes the missing Nutbox/Basket permissions and blocks creation; an agent must not change owner permissions to work around it. Display asset symbols **and full addresses**, and the trade-pool maximum/enabled state. Refresh the full skill to discover newly added governance candidates; never assume every bundled candidate is approved.

`permissions.subject` is the Pump18 factory. `ready:false` means its Nutbox operator or Basket forwarder activation is missing. Report the exact missing roles; the protocol owners must activate the factory. Do not request wallet allowlisting. Continue collecting parameters, but do not upload assets or deploy until ready.

The optional public HTTP endpoint is `GET /pump/v18/creation/<creator>`. Preparation independently rereads chain state through fixed-block Multicall.

## 3. Guide the economic parameters

Ask related missing fields in groups, preserve answers, and show a final consolidated specification. Do not invent investment choices from the tick or logo.

Preparation and read-only checks do not need a separate approval of the parameter list. Once choices are complete, obtain the wallet preview and merge the configuration, costs and risk results into one final confirmation for the actual deployment. Required dependent transactions retain separate previews/authorizations; see [the conversation flow](quickstart.md).

| Parameter | Explain to the user | Required choice / constraints |
|---|---|---|
| `indexConfig.name` | Name of the associated index asset | Nonempty, ≤64 UTF-8 bytes |
| `indexConfig.symbol` | Symbol of that index asset | Nonempty, ≤16 UTF-8 bytes |
| `constituentAssets` | Which approved assets the community's index tracks | 1–4 distinct current approved contract addresses |
| `targetWeights` | Relative allocation among those assets, in the same order | Positive integer bps summing to 10000; 60%/40% becomes `[6000,4000]` |
| `basketFeeBps` | Fee charged when buying, selling or redeeming the associated index basket, separate from community-token trading fees | Integer 100–300 bps, i.e. 1%–3% |
| `creatorShareBps` | Creator's share of distributable basket fees, not a percentage of the whole supply | Integer 0–3000 bps, i.e. 0%–30% |
| `retainCommunityOwnership` | Whether the creator keeps community owner control for later administration | Explicit `true` or `false`; do not assume |
| `initialBuy` | Optional atomic first purchase during creation | BNB in wei; explicitly confirm no buy (`"0"`) or the requested amount |
| `tradeRewardRatio` | Optional trade-curation pool allocation; reduces the allocation distributed to constituent LP pools | Explicit 0 to disable; otherwise positive bps ≤8000 **and** the current enabled factory maximum |

## 4. Understand the contract arguments

| Helper input | Meaning |
|---|---|
| `from` | The actual creator's public BSC wallet address. It must match the wallet executing the transaction and receives the initial purchase and retained community ownership. |
| `version` | Omit or use `18`; deployment through another version is rejected. |
| `binanceWalletOnly` | Omit or use `true`; records the issued token's handle-gated trading mode. It does not create a wallet or social account. |

The helper encodes either:

```solidity
createToken(string tick, bytes32 salt, IndexConfig indexConfig)
createToken(string tick, bytes32 salt, IndexConfig indexConfig, OptionalPoolConfig[] optionalPools)
```

| Argument | Meaning and handling |
|---|---|
| `tick` | Community token name and symbol. Separate from the associated index name/symbol. |
| `salt` | CREATE2 deployment seed, exactly 32 bytes. The helper generates an unused predicted address ending in `3333`; save both salt and predicted token. This is a technical value, not an economic choice to ask the owner. The sender, Pump and implementation also determine the address. |
| `indexConfig` | The seven index fields listed above; ask for every missing choice. Assets and weights share the same ordering. |
| `optionalPools[].factory` | Protocol-approved factory of an additional community reward pool. This helper supports the trade-curation factory returned by `creation-options`. |
| `optionalPools[].rewardRatio` | Share of **total community pool rewards**, in bps; not a trading tax or index weight. The helper derives it from `tradeRewardRatio`. |
| `optionalPools[].meta` | Factory-specific initialization bytes. The supported trade-curation pool uses `0x`; the helper supplies it. Do not invent bytes for another factory. |
| Transaction `value` | Pump fee + missing-IPShare creation fee + community fee + settings fee × (constituent pools + optional pools) + `initialBuy`. The helper calculates it from current on-chain fees. |

`tradeRewardRatio:0` selects the three-argument overload. A positive ratio selects the four-argument overload with one trade-curation pool. Remaining reward allocation is distributed across constituent LP pools proportionally to `targetWeights`; e.g. `[6000,4000]` with trade rewards `2000` produces `[4800,3200,2000]`. Pump18 supports at most two optional pools in its raw ABI, but this helper does not prepare other pool adapters.

`retainCommunityOwnership:false` renounces community ownership and cannot be undone. `true` retains administrator control. Explain this before asking the owner to choose. An initial buy spends additional BNB in the same creation transaction, receives tokens for the creator and is not a separate later market order.

## 5. Prepare, preserve and review

Example **shape**, not a recommended asset allocation (`0x...` placeholders must be replaced):

```json
{
  "from":"0xCURRENT_BSC_WALLET",
  "version":18,
  "binanceWalletOnly":true,
  "tick":"MYCOIN",
  "indexConfig":{
    "name":"My Index",
    "symbol":"MYINDEX",
    "constituentAssets":["0xAPPROVED_ASSET_A","0xAPPROVED_ASSET_B"],
    "targetWeights":[6000,4000],
    "basketFeeBps":100,
    "creatorShareBps":1000,
    "retainCommunityOwnership":true
  },
  "initialBuy":"0",
  "tradeRewardRatio":0
}
```

```bash
node scripts/tagclaw.mjs prepare-create --input create.json --out plan.json
```

Preparation verifies the Pump18 version/template, unused tick, approved assets, Nutbox operator/Basket forwarder permissions, optional pool permissions and wallet funds. Save the returned **salt** into `create.json` immediately and preserve `predictedToken`; rebuilding then uses the same unused `3333` address.

Show the complete chosen configuration and separate fee lines: pump, missing-IPShare fee (if applicable), community, per-pool settings, optional pool and initial buy. Settings fees apply to **each constituent pool plus each optional pool**, not once. The creation can automatically create a missing IPShare; this is an on-chain side effect, not a social registration.

The plan's value equals total fees plus initial buy. Preparation checks a 0.001 BNB reserve **before gas**; the actual wallet preview must estimate gas and verify ≥0.001 BNB remains **after value and gas**. Do not call a prepare result “simulated successfully.” Preview from the actual signing address, show risk and authority changes, and follow that wallet's execution authorization flow. The creator is the transaction sender (`msg.sender == tx.origin`; use a direct EOA-compatible wallet call). The atomic initial buy is exempt from the handle gate; subsequent ordinary internal buys require a Binance handle and respect the cumulative 10 million-token limit.

Return the plan and [wallet handoff payload](transactions.md) to the calling agent for signing. TagClaw does not supply or manage a deployment wallet. With no external signer available, report an unsigned deployment proposal instead of attempting wallet initialization.

## 6. Reconcile and publish metadata

After the wallet supplies a hash, run `receipt` with `{"hash":"0xCREATE_HASH"}`. Require `CONFIRMED` and the deployment version, creator, tick and token matching the saved plan. Preserve `createHash`, `token`, community, constituent staking pools, optional pools and index configuration. Never deploy again to repair a metadata failure.

Submit the confirmed result and chosen metadata:

```text
POST https://bsc-api.tagai.fun/pump/v18/register
X-Chain-Id: 56
Content-Type: application/json
```

```json
{
  "chainId":56,"version":18,"binanceWalletOnly":true,
  "tick":"MYCOIN","token":"0xCONFIRMED_TOKEN","createHash":"0xCONFIRMED_HASH",
  "logoUrl":"https://YOUR_LOGO_URL","desc":"User-approved description",
  "tags":[],"twitter":"","telegram":"","docs":""
}
```

Require `c:0` with populated `d`. If unavailable, record **on-chain deployment confirmed; metadata publication pending**, and retry with the **same hash**. No API key or account registration is needed.
