# Guided token issuance

Issue tokens on BSC using `prepare-create`. The helper selects the supported factory and implementation internally; omit the optional version input and do not ask the user to choose a protocol version. Existing-token queries and trades continue to use each token's actual deployment.

Do not run the social-account registration or local-wallet setup workflow. `POST /pump/v16/register` below records **token metadata after deployment**; it does not create a user account.

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

### Interpret protocol readiness correctly

`permissions.scope` is `protocol-contract`, and `permissions.subject` is the issuance factory, **not** the user wallet in `from`. The underlying checks are `NutboxRouter.operators(factory)` and `BasketRegistry.approvedCreatorForwarders(factory)`. `requiresUserWalletAllowlisting:false` is explicit: ordinary users do not obtain these roles. `readiness.code:PROTOCOL_ACTIVATION_PENDING` means platform-wide protocol activation is incomplete; the affected contract owners must activate the factory. The helper does not perform this administration.

Explain a failed readiness check in the user's language, for example:

> Token issuance is temporarily unavailable because the platform's issuance contract is awaiting protocol activation. This is not a wallet permission issue; you do not need to register or request wallet whitelisting. We can still query data and collect the token configuration, but cannot submit the deployment until the platform activates its contract.

Do not present internal deployment version numbers as a user prerequisite. Do not say “wait until your address receives Nutbox/Basket permissions.” Parameter collection may continue if useful, but defer uploads, approvals and deployment. Do not call a wallet balance “too low” or “tight” without the selected configuration's actual fees and an actual gas estimate; report missing estimates as unknown.

Public API resource `creation-options` additionally reads `GET /pump/v16/creation/<creator>` for server metadata. A failed API is reported as such, without fabricating a successful response. API data has its own source block; `prepare-create` rereads required chain configuration at a fresh fixed-block Multicall snapshot. Do not merge API and chain reads into a purported single snapshot.

## 3. Guide the economic parameters

Ask related missing fields in groups, preserve answers, and show a final consolidated specification. Do not invent investment choices from the tick or logo.

Preparation and read-only checks do not need a separate approval of the parameter list. Once choices are complete, obtain the wallet preview and merge the configuration, costs and risk results into one final confirmation for the actual deployment. Required dependent transactions retain separate previews/authorizations; see [the conversation flow](quickstart.md).

| Parameter | Explain to the user | Required choice / constraints |
|---|---|---|
| `indexConfig.name` | Name of the associated index asset | Nonempty, ≤64 UTF-8 bytes |
| `indexConfig.symbol` | Symbol of that index asset | Nonempty, ≤16 UTF-8 bytes |
| `constituentAssets` | Which approved assets the community's index tracks | 1–4 distinct current approved contract addresses |
| `targetWeights` | Relative allocation among those assets, in the same order | Positive integer bps summing to 10000; 60%/40% becomes `[6000,4000]` |
| `basketFeeBps` | Associated basket fee | Integer 100–300 bps, i.e. 1%–3% |
| `creatorShareBps` | Creator's share of distributable basket fees, not a percentage of the whole supply | Integer 0–3000 bps, i.e. 0%–30% |
| `retainCommunityOwnership` | Whether the creator keeps community owner control for later administration | Explicit `true` or `false`; do not assume |
| `initialBuy` | Optional atomic first purchase during creation | BNB in wei; explicitly confirm no buy (`"0"`) or the requested amount |
| `tradeRewardRatio` | Optional trade-curation pool allocation; reduces the allocation distributed to constituent LP pools | Explicit 0 to disable; otherwise positive bps ≤8000 **and** the current enabled factory maximum |

Example prompt:

> Which 1–4 approved assets and weights should we use? What index name/symbol, basket fee, creator fee share and ownership choice do you want? Should creation include an initial buy or a trade-mining allocation?

You may propose a configuration when asked for suggestions, but label it as a proposal and get the user's selection. Never turn example addresses, 50/50 weights, ownership retention, or a nonzero initial buy into an undisclosed default.

## 4. Prepare, preserve and review

Example **shape**, not a recommended asset allocation (`0x...` placeholders must be replaced):

```json
{
  "from":"0xCURRENT_BSC_WALLET",
  "version":16,
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

Preparation verifies the Pump16 version/template, unused tick, approved assets, Nutbox operator/Basket forwarder permissions, optional pool permissions and wallet funds. Save the returned **salt** into `create.json` immediately and preserve `predictedToken`; rebuilding then uses the same unused `3333` address.

Show the complete chosen configuration and separate fee lines: pump, missing-IPShare fee (if applicable), community, per-pool settings, optional pool and initial buy. Settings fees apply to **each constituent pool plus each optional pool**, not once. The creation can automatically create a missing IPShare; this is an on-chain side effect, not a social registration.

The plan's value equals total fees plus initial buy. Preparation checks a 0.001 BNB reserve **before gas**; the actual wallet preview must estimate gas and verify ≥0.001 BNB remains **after value and gas**. Do not call a prepare result “simulated successfully.” Preview from the actual signing address, show risk and authority changes, and follow that wallet's execution authorization flow. Initial creation buys do not require a handle; subsequent ordinary internal buys of the issued token do.

Return the plan and [wallet handoff payload](transactions.md) to the calling agent for signing. TagClaw does not supply or manage a deployment wallet. With no external signer available, report an unsigned deployment proposal instead of attempting wallet initialization.

## 5. Reconcile and publish metadata

After the wallet supplies a hash, run `receipt` with `{"hash":"0xCREATE_HASH"}`. Require `CONFIRMED` and the deployment version, creator, tick and token matching the saved plan. Preserve `createHash`, `token`, community, constituent staking pools, optional pools and index configuration. Never deploy again to repair a metadata failure.

Submit the confirmed result and chosen metadata:

```text
POST https://bsc-api.tagai.fun/pump/v16/register
X-Chain-Id: 56
Content-Type: application/json
```

```json
{
  "chainId":56,"version":16,"binanceWalletOnly":true,
  "tick":"MYCOIN","token":"0xCONFIRMED_TOKEN","createHash":"0xCONFIRMED_HASH",
  "logoUrl":"https://YOUR_LOGO_URL","desc":"User-approved description",
  "tags":[],"twitter":"","telegram":"","docs":""
}
```

Require `c:0` with populated `d`. If unavailable, record **on-chain deployment confirmed; metadata publication pending**, and retry with the **same hash**. No API key or account registration is needed.
