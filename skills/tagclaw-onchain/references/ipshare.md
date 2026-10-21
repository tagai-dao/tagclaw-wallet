# IPShare through an external wallet

`subject` is the identity market's EVM address. `from` is the current holder/sender and the recipient of buys. IPShare uses internal share balances, not an ERC20 allowance. Amounts use raw 18-decimal share units; BNB values use wei.

Inspect `{"from":"0xCURRENT_BSC_WALLET","subject":"0xSUBJECT"}`:

```bash
node scripts/tagclaw.mjs ipshare-info --input ipshare.json
```

This reads existence, supply, holder balance, stake/redeem state, unlock time, pending rewards and creation fee at a fixed Multicall snapshot.

To prepare, add `action` and the appropriate fields, then run:

```bash
node scripts/tagclaw.mjs prepare-ipshare --input ipshare.json --out plan.json
```

| action | Extra fields | Behavior |
|---|---|---|
| `create` | none | Subject defaults to `from`; exact on-chain create fee; reject an existing market |
| `buy` | `value`, `minimumOut` | BNB wei and **positive** raw share minimum chosen from a current quote/user limit |
| `sell` | `amount`, optional `slippageBps` | Read current after-fee quote; enforce a positive minimum BNB output |
| `stake` | `amount` | Require enough liquid shares |
| `unstake` | `amount` | Require enough staked shares; starts the exit process |
| `redeem` | none | Require a positive redeem amount and elapsed unlock time |
| `claim` | none | Require positive pending rewards |

Buy example:

```json
{"from":"0xCURRENT_BSC_WALLET","subject":"0xSUBJECT","action":"buy","value":"1000000000000000","minimumOut":"1000000000000000000"}
```

The example's minimum is illustrative, not a quote. The helper deliberately requires a positive explicit minimum for a buy; it does not replace the sender-dependent payable simulation with a Multicall simulation from a different caller. Obtain the user's intended minimum/current protocol quote and validate actual output in the wallet preview. If the minimum cannot be met, re-evaluate the quote rather than removing protection.

Every prepared action is unsigned. Use the selected wallet's preview and authorization flow, persist its order/hash, then confirm a status-1 receipt. Keep unstake and redeem as separate operations.
