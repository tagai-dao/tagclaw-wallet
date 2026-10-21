# Nutbox participant operations

This helper supports known ERC20 staking, ERC20 locking, ERC1155 staking and legacy Social Curation factory ABIs. It checks factory, community membership (`poolActived`) and committee verification. It does not infer a pool type from its name and rejects unknown/new factories. A v14 community has multiple pools; do not invent a universal Social Curation pool.

Use an actual pool address from a verified community or its creation receipt. Public-chain participation does not require a TagClaw social account. Authenticated TagClaw discovery APIs, if used, retain their existing API-key requirements; do not register an account solely to use an already-known on-chain address.

Inspect `{"from":"0xCURRENT_BSC_WALLET","pool":"0xPOOL"}`:

```bash
node scripts/tagclaw.mjs pool-info --input pool.json
```

It returns factory/type, community/committee/owner, active state, staked balance, operation fee and pending rewards. To prepare an action, add `action` and any fields below:

```bash
node scripts/tagclaw.mjs prepare-pool --input pool.json --out plan.json
```

| action | Fields | Pool types |
|---|---|---|
| `deposit` | `amount` | ERC20 staking/locking or ERC1155 |
| `withdraw` | `amount` | ERC20 staking/locking or ERC1155 |
| `redeem` | none | ERC20 locking; positive claimable amount required |
| `claim` | none | Standard pools; prepares community `withdrawPoolsRewards([pool])` |
| `harvest` | none | Social Curation only |
| `signed-claim` | `orderId`, `amount`, `deadline`, `signature` | Social Curation only; an existing valid protocol claim payload is required |

ERC20 amounts use raw token units. ERC1155 amounts use item counts. For deposit, the helper reads stake asset and balance. If needed, it returns one authorization first:

- ERC20: reset a nonzero insufficient allowance to zero, then reprepare an exact amount allowance, confirm and reprepare the deposit.
- ERC1155: `setApprovalForAll(pool,true)` covers **all token IDs in the collection** for that operator, not only this pool's token ID. Present this authority change explicitly before authorization. If that scope is unacceptable, stop rather than silently granting it.

Deposit, withdrawal, standard claim and social operations include the current committee operation fee where required. Locking `withdraw` starts a redemption queue; it is not an immediate redeem. Inactive pools are not prepared automatically because historical exit semantics need separate verification. Social Curation has no user deposit/withdraw path; its protocol claim signature is distinct from wallet signing and cannot be invented by the agent.

Pool creation, reward-ratio changes and other owner/admin operations are outside this initial helper. Do not run local-wallet commands as a fallback for an external wallet or bypass a factory check.
