# Token discovery, prices and market state

Queries do not require a connected wallet or TagAI account. Use the current wallet address only for balances and personal positions; never prompt for login just to search tokens.

## Tick and address resolution

Search with `{"query":"TAG"}`:

```bash
node scripts/tagclaw.mjs token-search --input search.json
```

Search returns candidates, not an automatic selection. Show tick, name, full contract address, version and import status. For an exact identity, use `{"tick":"EXACT_TICK"}` or `{"token":"0xFULL_ADDRESS"}`:

```bash
node scripts/tagclaw.mjs resolve-token --input token.json
```

Resolution validates the returned address, chain and exact tick/address match. Address lookup first tries its on-chain ERC20 symbol through fixed-block Multicall, then checks exact addresses in search results. If needed it scans the public catalog in bounded pages. `TOKEN_RESOLUTION_INCOMPLETE` supplies a continuation `page` and `catalogId`; continue from those or request its exact tick. Do not report “not found” from an incomplete scan, match an address prefix, or equate duplicate symbols.

Token commands accept `tick` instead of `token`. For known supported native index-token contract addresses, chain queries work without the API. Legacy/import routes resolve maintained API metadata and verify chain state; a cached API `listed` flag is not execution state.

## State, balances and prices

```json
{"token":"0xTOKEN","from":"0xOPTIONAL_CURRENT_BSC_WALLET"}
```

| Command | Meaning |
|---|---|
| `token-info` | Actual protocol version, symbol/decimals, supply and `market`; supported index tokens include `listingPending`, pool ID and index/component information |
| `token-balance` | `raw` and `formatted` balance; requires `from`, supports ordinary ERC20 addresses too |
| `price` | BNB per token, block metadata and `quoteType`; `from` not needed |

```bash
node scripts/tagclaw.mjs token-info --input token.json
node scripts/tagclaw.mjs price --input token.json
node scripts/tagclaw.mjs token-balance --input token.json
```

Interpret `market` as `internal` (bonding curve), `listing` (transition pending), or `external` (listed). Imported tokens have no TagAI bonding curve and are external. For handle-gated curve buys, supplying `from` also checks that address's handle. A handle failure does not block sell or public query operations.

Prices have different meanings:

- Supported native index tokens and legacy native V4: `quoteType:spot-not-execution`; spot BNB/token, not guaranteed proceeds.
- Legacy curves, V2 and imported markets: `effective-buy-price-including-fees-not-spot`; estimated BNB/token for a reference BNB input (default `referenceAmount:"1000000000000000"`, 0.001 BNB). Report that amount and that fees/price impact are included; do not call it a spot price.
- `prepare-trade` quotes the requested actual amount and minimum output. Use that for trading, not a spot or reference price.

For USD conversion, query API resource `bnb-usd` and multiply using decimal arithmetic. Report the API timestamp/quality separately from the fixed chain block. Pending listing is reported or returns `TOKEN_LISTING_PENDING`; wait and quote again rather than switching to a guessed pool.

Read [the API reference](api.md) for catalogs, price conversion, IPShare and Nutbox discovery.
