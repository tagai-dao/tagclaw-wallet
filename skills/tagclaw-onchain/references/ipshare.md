# IPShare queries and transactions

IPShare is a separate identity market at the maintained BSC IPShare contract, not a community ERC20. `subject` is the person's/agent's EVM address. Use public API resources `ipshare-list`, `ipshare-summary` and `ipshare-holdings` to discover subjects; `keyword` search accepts names, usernames or addresses. Resolve ambiguous names before preparing a trade. No TagAI registration is required.

## State and price quotes

Inspect `{"subject":"0xSUBJECT"}` with `ipshare-info`. Optional `from` selects the holder whose liquid/staked/redeemable shares and rewards to inspect; if omitted the subject is the holder. The fixed-block result includes existence, supply, liquid balance, staked amount, pending rewards, redeem amount, unlock time and create fee.

```bash
node scripts/tagclaw.mjs ipshare-info --input ipshare.json
```

To quote a buy, use BNB wei:

```json
{"subject":"0xSUBJECT","side":"buy","value":"1000000000000000","slippageBps":200}
```

To quote a sell, use raw 18-decimal share units:

```json
{"subject":"0xSUBJECT","side":"sell","amount":"1000000000000000000","slippageBps":200}
```

```bash
node scripts/tagclaw.mjs ipshare-quote --input quote.json
```

Buy quotes read the current supply and subject/protocol fee percentages and call the caller-independent pure share calculator through Multicall. Sell quotes read the after-fee BNB output. Show input, expected and minimum output, slippage and block. These are amount-specific quotes, not an ERC20 token price or an approval requirement.

## Prepare actions

Add `from` (the selected Binance BSC address), `subject`, `action` and the fields below:

| action | Fields / meaning |
|---|---|
| `create` | No amount; charges current create fee; reject an existing subject market |
| `buy` | `value` in BNB wei; optional `slippageBps` (default 200); optional positive `minimumOut` in raw shares to override the quoted minimum |
| `sell` | `amount` in raw shares; optional `slippageBps` (default 200); minimum is BNB wei |
| `stake` | `amount` of liquid shares |
| `unstake` | `amount` of staked shares; starts an exit, does not immediately redeem |
| `redeem` | Require positive redeem amount and elapsed unlock time |
| `claim` | Require positive pending rewards |

```bash
node scripts/tagclaw.mjs prepare-ipshare --input ipshare.json --out plan.json
```

Buy recipients are the current `from` address. Buy preparation obtains a current protected quote; an explicit minimum cannot exceed expected output or be zero. IPShare balances are internal contract accounting, so there is no ERC20/Permit2 approval step for these actions. Keep stake, unstake and later redeem distinct. Preview and authorize each transaction with [Binance execution](binance.md), then require a status-1 receipt.
