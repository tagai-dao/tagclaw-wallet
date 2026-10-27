# Nutbox pools

No TagAI account is needed. For **any existing token version or import**, start with public API resource `nutbox-by-token`, or use `nutbox-communities` and `nutbox-community` to browse pools. API results are discovery data; inspect each selected pool on chain before preparing. A token without a linked community/pool has nothing to stake in; do not create a replacement community automatically.

Discover a token's verified component LP pools and wallet positions:

```json
{"from":"0xCURRENT_BSC_WALLET","token":"0xTOKEN"}
```

```bash
node scripts/tagclaw.mjs mining-pools --input request.json
```

For current native index tokens, returns community, component asset/pair/pool, wallet LP balance, staked balance and pending rewards. Bindings are checked against token components, community and pool contracts. For legacy/imported tokens, `mining-pools` returns public Nutbox discovery data; use `pool-info` for each selected pool's chain snapshot. Do not present cached API data and live state as one snapshot.

For a pool, use `{"from":"0xWALLET","pool":"0xPOOL"}` with `pool-info`. Add the following action and run `prepare-pool`:

| action | Extra fields | Applies to |
|---|---|---|
| `deposit` / `withdraw` | `amount` (raw LP/token units or ERC1155 item count) | Known ERC20/locking/ERC1155 pools |
| `claim` | none | Community reward claim for a standard pool |
| `redeem` | none | Claimable ERC20 locking exit |
| `harvest` | none | Legacy Social Curation |
| `signed-claim` | `orderId`, `amount`, `deadline`, `signature` | Legacy Social Curation claim payload |

```bash
node scripts/tagclaw.mjs prepare-pool --input pool.json --out plan.json
```

Current ERC20 factory addresses are read from trusted Pump configuration; known legacy factories remain supported. The helper verifies committee authorization and active state. Operation fees are included where required. ERC20 deposits use exact approval steps; confirm each and reprepare. ERC1155 approval grants the operator access to **all collection IDs** and requires explicit review.

Locking withdrawal queues an exit; redeem separately when unlocked. Social pools have no user deposit path. Unknown/inactive pool behavior and owner/admin reconfiguration need separate verification.

Historical `signed-claim` requires an already-issued valid protocol payload. Do not invoke social registration or invent a claim signature to obtain one. Query failures and missing eligibility must be reported explicitly.

The generic executable adapter covers the verified ERC20 staking/locking, ERC1155 staking and historical Social Curation factories above. New NFT-mining, basket-child and broker factories may appear in discovery APIs; their distinct ABIs are not inferred from names and the helper rejects them for writes. Describe the available discovery data and this execution boundary rather than claiming the standard `deposit` path supports every factory. Pool creation, owner/admin reconfiguration and new-factory write adapters are outside this first-phase helper.
