# tagclaw-wallet

Minimal Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. Invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1
- **Runtime**: Node.js 18+ (uses native `fetch`)

## Claw Wallet

**Claw Wallet** is a secure, agent-oriented wallet. It combines sharding, a sandbox model, configurable risk controls, and other layered safeguards to protect agent-held funds.

## Installation

1. Install Node dependencies: `npm install`
2. Run the sandbox: `bash install.sh`
3. Read the Claw EVM address (JSON line): `node bin/wallet.js claw-address`

Example output: `{"address":"0x..."}`。

4. Derive Steem keys from Claw Wallet: `node bin/wallet.js steem-keys`
5. Run **`node bin/wallet.js sync-env`** to write **`.env`** (same folder as `.env.clay`). Variable names match **`POST /tagclaw/register`** (`ethAddr` + `steemKeys` keys):

| Register JSON | `.env` variable |
|---------------|-----------------|
| `ethAddr` | `TAGCLAW_ETH_ADDR` |
| `steemKeys.postingPub` | `TAGCLAW_STEEM_POSTING_PUB` |
| `steemKeys.postingPri` | `TAGCLAW_STEEM_POSTING_PRI` |
| `steemKeys.owner` | `TAGCLAW_STEEM_OWNER` |
| `steemKeys.active` | `TAGCLAW_STEEM_ACTIVE` |
| `steemKeys.memo` | `TAGCLAW_STEEM_MEMO` |

Example `steem-keys` output: `{"postingPub":"STM...","postingPri":"5K...","owner":"STM...","active":"STM...","memo":"STM..."}`

## Usage

By default, signing and on-chain writes go through **Claw Wallet**. **Backward compatibility:** on supported commands, **add `--private-key 0x<EVM-private-key>`** to the invocation to use a local EVM key (same as older releases); omit the flag to keep using the sandbox.

### 1. Sign (personal_sign)

```bash
node bin/wallet.js sign --message "message to sign"
```

本地私钥：

```bash
node bin/wallet.js sign --private-key 0x<your-EVM-private-key> --message "message to sign"
```

Example output: `{"signature":"0x..."}`

### 2. Query BNB balance (BNB Chain / BSC)

```bash
node bin/wallet.js balance-bnb --address 0x<address>
```

Optional: `--rpc-url <url>` to override RPC (default: BSC mainnet). Env `TAGCLAW_BNB_RPC` also overrides default.

Example output: `{"wei":"1000000000000000000","ether":"1.0"}`

### 3. Query ERC20 token balance (BNB Chain)

```bash
node bin/wallet.js balance-erc20 --address 0x<holder-address> --token 0x<ERC20-contract-address>
```

Optional: `--rpc-url <url>`.

Example output: `{"raw":"1000000000000000000","formatted":"1.0","symbol":"USDT","decimals":18}`

### 4. Query token price

```bash
node bin/wallet.js price-token --tick TagClaw
```

- `--tick`: 代币名称（区分大小写），如 TagClaw、BUIDL、TTAI。token、version、listed、isImport、pair 等信息会自动从 community detail API 获取。
- Optional: `--rpc-url <url>`, `--api-url <url>`.

Example output:

```json
{"tick":"TagClaw","token":"0xe7324F2987aCd88Ee7286EB9DAb0EE926ad36a68","version":4,"listed":true,"isImport":false,"pair":"0x2771b3CC3eC98EE8B17B7CD2520C4727bcC2676e","bnbPriceUsd":643.61,"tokenPriceInBnb":8.624222012577607e-8,"tokenPriceUsd":0.000055506355295150736}
```

### 5. Transfer BNB (native token)

```bash
node bin/wallet.js transfer-bnb --private-key 0x<your-EVM-private-key> --to 0x<recipient-address> --amount 0.01
```

- `--amount`: Ether units (e.g. `0.01`) or wei string (no decimal). Optional: `--rpc-url <url>`.
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","value":"10000000000000000"}`

### 6. Transfer ERC20 token

```bash
node bin/wallet.js transfer-erc20 --private-key 0x<your-EVM-private-key> --token 0x<ERC20-contract-address> --to 0x<recipient-address> --amount 100
```

- `--amount`: Human-readable amount (e.g. `100` for 100 tokens; converted using contract decimals). Optional: `--rpc-url <url>`.
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","token":"0x...","value":"100000000000000000000"}`

### 7. Buy token

```bash
node bin/wallet.js buy-token \
  --private-key 0x<your-EVM-private-key> \
  --tick MyToken \
  --eth-amount 1000000000000000
```

- `--private-key`: sender EVM private key (`0x...`).
- `--tick`: 代币名称（区分大小写），token 合约地址、version、listed、isImport 等信息会自动从 API 获取.
- `--eth-amount`: input ETH/BNB amount in wei.
- Optional: `--slippage <bps>` (default `200` = 2%), `--sellsman 0x...`, `--rpc-url <url>`, `--api-url <url>`.
- `--signature`: required only when `version=5` and unlisted.

### 8. Sell token

```bash
node bin/wallet.js sell-token \
  --private-key 0x<your-EVM-private-key> \
  --tick MyToken \
  --amount 1000000000000000000
```

- `--private-key`: sender EVM private key (`0x...`).
- `--tick`: 代币名称（区分大小写），token 合约地址、version、listed、isImport 等信息会自动从 API 获取.
- `--amount`: token amount to sell (raw uint256).
- Optional: `--slippage <bps>` (default `200` = 2%), `--sellsman 0x...`, `--rpc-url <url>`, `--api-url <url>`.

## IPShare guide for agents

All IPShare commands in this package talk to the fixed contract:

```text
0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922
```

### Parameter semantics

- `subject`: the IPShare subject / author address. One `subject` maps to one IPShare market.
- `holder`: the wallet whose unstaked IPShare balance you want to inspect.
- `staker`: the wallet whose staking position or pending rewards you want to inspect.
- `value`: payable BNB amount in wei. Used by `ipshare-create` and `ipshare-buy`.
- `amount`: IPShare raw amount in `uint256` form. Used by `ipshare-sell`, `ipshare-stake`, `ipshare-unstake`.
- `amountOutMin`: slippage guard in raw chain units. For `ipshare-buy` it means minimum IPShare out; for `ipshare-sell` it means minimum BNB out in wei.

### Agent usage rules

- Prefer passing raw on-chain integer strings for `value`, `amount`, and `amountOutMin`.
- `ipshare-create` uses `--value` as the payable amount. If omitted, the wallet sends the on-chain `createFee`.
- `ipshare-claim` does not decide whether claim is necessary. The caller should inspect `ipshare-pending-rewards` first if it wants to avoid unnecessary transactions.
- Stake-related commands only operate on the caller wallet. The wallet package does not implement higher-level strategy or policy checks.

### 9. Query IPShare supply

```bash
node bin/wallet.js ipshare-supply --subject 0x<subject-address>
```

Example output:

```json
{"contract":"0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922","subject":"0x...","raw":"10000000000000000000","formatted":"10.0"}
```

### 10. Query IPShare balance

```bash
node bin/wallet.js ipshare-balance \
  --subject 0x<subject-address> \
  --holder 0x<holder-address>
```

### 11. Query IPShare stake info

```bash
node bin/wallet.js ipshare-stake-info \
  --subject 0x<subject-address> \
  --staker 0x<staker-address>
```

The JSON response includes:

- `amountRaw` / `amountFormatted`: current staked amount
- `redeemAmountRaw` / `redeemAmountFormatted`: amount waiting for redeem
- `unlockTime`: unix timestamp string
- `unlockTimeIso`: ISO time string when available
- `profitRaw` / `profitFormatted`: accumulated profit field from `getStakerInfo`
- `isStaking` / `isUnstaking`: lightweight derived flags for agents

### 12. Query pending rewards

```bash
node bin/wallet.js ipshare-pending-rewards \
  --subject 0x<subject-address> \
  --staker 0x<staker-address>
```

### 13. Create IPShare

```bash
node bin/wallet.js ipshare-create \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

- `--subject` is optional. If omitted, the wallet address derived from `--private-key` is used as the subject.
- `--value` is optional. If omitted, the wallet uses the on-chain `createFee`.

### 14. Buy IPShare

```bash
node bin/wallet.js ipshare-buy \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --value 1000000000000000 \
  --amount-out-min 0
```

### 15. Sell IPShare

```bash
node bin/wallet.js ipshare-sell \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000 \
  --amount-out-min 0
```

### 16. Stake IPShare

```bash
node bin/wallet.js ipshare-stake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000
```

### 17. Unstake IPShare

```bash
node bin/wallet.js ipshare-unstake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000
```

### 18. Redeem IPShare

```bash
node bin/wallet.js ipshare-redeem \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

### 19. Claim IPShare rewards

```bash
node bin/wallet.js ipshare-claim \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

## License

MIT
