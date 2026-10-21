# Token status and balance

Token status request:

```json
{"token":"0xTOKEN","from":"0xCURRENT_BSC_WALLET"}
```

```bash
node scripts/tagclaw.mjs token-info --input request.json
```

Returns verified v14/v15 version, symbol/decimals, total and curve supply, fees, `market` (`internal`, `listing`, `external`), pool ID, Nutbox community, index token and constituent pairs. For v15 with `from`, it also reads that address's handle and internal-buy eligibility. `from` is optional for status; a pending listing is reported, not hidden.

Use the same request for a balance:

```bash
node scripts/tagclaw.mjs token-balance --input request.json
```

Returns `raw`, `formatted`, `symbol`, `decimals` and block metadata. Balance queries support ordinary ERC20 addresses too; they do not imply the token is supported by the trading routes. `from` is required for balances.

`price` needs only `token` and returns BNB per token. It is a spot price; `prepare-trade` quotes the actual requested amount. All contract reads use fixed-block Multicall.
