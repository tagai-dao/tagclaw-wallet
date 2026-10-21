# Nutbox pools

Discover a token's verified component LP pools and wallet positions:

```json
{"from":"0xCURRENT_BSC_WALLET","token":"0xTOKEN"}
```

```bash
node scripts/tagclaw.mjs mining-pools --input request.json
```

Returns community, component asset/pair/pool, wallet LP balance, staked balance and pending rewards. Bindings are checked against token components, community and pool contracts; no API account is needed.

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
