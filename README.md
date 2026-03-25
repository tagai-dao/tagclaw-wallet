# tagclaw-wallet

Minimal Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. Invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1
- **Runtime**: Node.js 18+ (uses native `fetch`)

## Claw Wallet

链上签名与默认 Steem 派生依赖 [BitsLabSec claw_wallet_sdk](https://github.com/BitsLabSec/claw_wallet_sdk) 与本目录下的本地 **clay-sandbox**。

1. 在 **本包根目录**（与 `install.sh` 同级，即各 Agent 工作区内的 `tagclaw-wallet`）执行：
   ```bash
   bash install.sh
   ```
   会下载/启动沙箱，并生成 **`.env.clay`**（含 `CLAY_SANDBOX_URL`、`CLAY_AGENT_TOKEN` 或 `AGENT_TOKEN`；`CLAY_UID` 可在同目录 `identity.json` 中）。
2. 安装 Node 依赖：`npm install`
3. 读取 Claw 上的 EVM 地址（JSON 一行）：
   ```bash
   node bin/wallet.js claw-address
   ```
   可选：`--chain bsc` 或 `--chain ethereum`。
4. 用 Claw 对规范消息 `personal_sign` 后派生 Steem 密钥（**无需**传 EVM 私钥）：
   ```bash
   node bin/wallet.js steem-keys
   ```
   明文固定为 `JSON.stringify({ project: "tagai", method: "generate-social-account" }, null, 4)`（与代码中 `RegisterSteemMessage` 一致）。
5. 将 **`TAGCLAW_EVM_ADDRESS`** 与各 **Steem** 字段写入与本目录 **`.env.clay` 同级** 的 **`.env`**：
   ```bash
   node bin/wallet.js sync-env
   ```

未传 `--private-key` 的写链命令（`transfer-bnb`、`buy-token`、`ipshare-*` 等）均走 **Claw**。若需与旧版一致，可显式传入 `--private-key 0x...`。

**Legacy Steem**：`node bin/wallet.js steem-keys --private-key 0x...` 仍使用「EVM 私钥 → brain」旧算法，与 Claw 默认派生 **不是** 同一套 Steem 密钥。

## Features overview

| Category | Feature | CLI command |
|----------|---------|-------------|
| Claw | Print sandbox EVM address | `claw-address` |
| | Sync address + Steem keys to `.env` | `sync-env` |
| Wallet & keys | EVM 地址来自 Claw（无本地 privateKey） | `install.sh` → `claw-address` / `sync-env` |
| | Steem keys（默认 Claw；可选 `--private-key` 仅 legacy） | `steem-keys` |
| | 本地随机钱包（**不推荐**，与 Claw 流程无关） | `create-wallet` |
| Signing | Sign message (personal_sign) | `sign` |
| BNB Chain query | Query native BNB balance | `balance-bnb` |
| | Query ERC20 token balance | `balance-erc20` |
| | Query token price (BNB/USD, token/BNB, token/USD) | `price-token` |
| BNB Chain transfer | Send BNB (native) | `transfer-bnb` |
| | Send ERC20 token | `transfer-erc20` |
| Pump trade | Buy token via pump/swap routes | `buy-token` |
| | Sell token via pump/swap routes | `sell-token` |
| IPShare query | Query IPShare supply | `ipshare-supply` |
| | Query IPShare balance | `ipshare-balance` |
| | Query IPShare stake info | `ipshare-stake-info` |
| | Query IPShare pending rewards | `ipshare-pending-rewards` |
| IPShare write | Create IPShare | `ipshare-create` |
| | Buy IPShare | `ipshare-buy` |
| | Sell IPShare | `ipshare-sell` |
| | Stake IPShare | `ipshare-stake` |
| | Unstake IPShare | `ipshare-unstake` |
| | Redeem IPShare | `ipshare-redeem` |
| | Claim IPShare rewards | `ipshare-claim` |

BNB Chain RPC can be set via `--rpc-url` or env `TAGCLAW_BNB_RPC`; default is BSC mainnet.

IPShare uses a fixed contract address in this wallet package: `0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922`.

## Installation

```bash
git clone <your-repo-url>/tagclaw-wallet.git
cd tagclaw-wallet
npm install
bash install.sh
```

`install.sh` 会拉取/启动 **clay-sandbox** 并生成本目录 **`.env.clay`**；链上操作与默认 Steem 派生都依赖这一步，**不需要**再跑 `create-wallet` 生成私钥。

Or from parent repo subdirectory: `cd /path/to/.../tagclaw-wallet && npm install && bash install.sh`

## CLI (for Agents calling via node and parsing JSON)

All successful results **output a single JSON line to stdout** for agents to parse and perform follow-up actions.

### 1. 安装沙箱并获取 EVM 地址（Claw，无 privateKey）

第一步在本包根目录执行（与上方 **Installation** 一致）：

```bash
bash install.sh
npm install
```

读取沙箱中的 EVM 地址（JSON 一行）：

```bash
node bin/wallet.js claw-address
```

Example output: `{"address":"0x..."}`（可选 `--chain bsc` / `--chain ethereum`）。

一键把地址 + Steem 材料写入同级 **`.env`**：

```bash
node bin/wallet.js sync-env
```

**不再**把 `create-wallet` 作为常规流程；仅调试或迁移旧脚本时才需要本地随机私钥（见文末 API 表中的 legacy 说明）。

### 2. Steem keys（默认 Claw，无需私钥）

需已 `bash install.sh` 且沙箱可用。

```bash
node bin/wallet.js steem-keys
```

Legacy（与 Claw 派生结果不同）：

```bash
node bin/wallet.js steem-keys --private-key 0x<your-EVM-private-key>
```

Example output: `{"postingPub":"STM...","postingPri":"5K...","owner":"STM...","active":"STM...","memo":"STM..."}`

### 3. Sign (personal_sign)

默认 Claw：

```bash
node bin/wallet.js sign --message "message to sign"
```

本地私钥：

```bash
node bin/wallet.js sign --private-key 0x<your-EVM-private-key> --message "message to sign"
```

Example output: `{"signature":"0x..."}`

### 4. Query BNB balance (BNB Chain / BSC)

```bash
node bin/wallet.js balance-bnb --address 0x<address>
```

Optional: `--rpc-url <url>` to override RPC (default: BSC mainnet). Env `TAGCLAW_BNB_RPC` also overrides default.

Example output: `{"wei":"1000000000000000000","ether":"1.0"}`

### 5. Query ERC20 token balance (BNB Chain)

```bash
node bin/wallet.js balance-erc20 --address 0x<holder-address> --token 0x<ERC20-contract-address>
```

Optional: `--rpc-url <url>`.

Example output: `{"raw":"1000000000000000000","formatted":"1.0","symbol":"USDT","decimals":18}`

### 6. Query token price

```bash
node bin/wallet.js price-token --tick TagClaw
```

- `--tick`: 代币名称（区分大小写），如 TagClaw、BUIDL、TTAI。token、version、listed、isImport、pair 等信息会自动从 community detail API 获取。
- Optional: `--rpc-url <url>`, `--api-url <url>`.

Example output:

```json
{"tick":"TagClaw","token":"0xe7324F2987aCd88Ee7286EB9DAb0EE926ad36a68","version":4,"listed":true,"isImport":false,"pair":"0x2771b3CC3eC98EE8B17B7CD2520C4727bcC2676e","bnbPriceUsd":643.61,"tokenPriceInBnb":8.624222012577607e-8,"tokenPriceUsd":0.000055506355295150736}
```

### 7. Transfer BNB (native token)

```bash
node bin/wallet.js transfer-bnb --private-key 0x<your-EVM-private-key> --to 0x<recipient-address> --amount 0.01
```

- `--amount`: Ether units (e.g. `0.01`) or wei string (no decimal). Optional: `--rpc-url <url>`.
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","value":"10000000000000000"}`

### 8. Transfer ERC20 token

```bash
node bin/wallet.js transfer-erc20 --private-key 0x<your-EVM-private-key> --token 0x<ERC20-contract-address> --to 0x<recipient-address> --amount 100
```

- `--amount`: Human-readable amount (e.g. `100` for 100 tokens; converted using contract decimals). Optional: `--rpc-url <url>`.
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","token":"0x...","value":"100000000000000000000"}`

### 9. Buy token

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

### 10. Sell token

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

### 11. Query IPShare supply

```bash
node bin/wallet.js ipshare-supply --subject 0x<subject-address>
```

Example output:

```json
{"contract":"0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922","subject":"0x...","raw":"10000000000000000000","formatted":"10.0"}
```

### 12. Query IPShare balance

```bash
node bin/wallet.js ipshare-balance \
  --subject 0x<subject-address> \
  --holder 0x<holder-address>
```

### 13. Query IPShare stake info

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

### 14. Query pending rewards

```bash
node bin/wallet.js ipshare-pending-rewards \
  --subject 0x<subject-address> \
  --staker 0x<staker-address>
```

### 15. Create IPShare

```bash
node bin/wallet.js ipshare-create \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

- `--subject` is optional. If omitted, the wallet address derived from `--private-key` is used as the subject.
- `--value` is optional. If omitted, the wallet uses the on-chain `createFee`.

### 16. Buy IPShare

```bash
node bin/wallet.js ipshare-buy \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --value 1000000000000000 \
  --amount-out-min 0
```

### 17. Sell IPShare

```bash
node bin/wallet.js ipshare-sell \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000 \
  --amount-out-min 0
```

### 18. Stake IPShare

```bash
node bin/wallet.js ipshare-stake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000
```

### 19. Unstake IPShare

```bash
node bin/wallet.js ipshare-unstake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000
```

### 20. Redeem IPShare

```bash
node bin/wallet.js ipshare-redeem \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

### 21. Claim IPShare rewards

```bash
node bin/wallet.js ipshare-claim \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

## Using in code

```javascript
const {
  configure,
  getClawWalletAddress,
  syncTagclawWalletEnv,
  createWallet,
  generateSteemKeys,
  createWalletAndSteemKeys,
  signMessage,
  getBnbBalance,
  getErc20Balance,
  getTokenPrice,
  transferBnb,
  transferErc20,
  buyToken,
  sellToken,
  getIpShareSupply,
  getIpShareBalance,
  getIpShareStakeInfo,
  getIpSharePendingRewards,
  createIpShare,
  buyIpShare,
  sellIpShare,
  stakeIpShare,
  unstakeIpShare,
  redeemIpShare,
  claimIpShareRewards,
  IPSHARE_CONTRACT
} = require('.')

// 可选：自定义 API 地址（默认 https://bsc-api.tagai.fun）
configure({ apiUrl: 'https://your-api.example.com' })

// --- 推荐：先在本目录 bash install.sh，再使用 Claw（不传 privateKey）---
const { address, steemKeys, envPath } = await syncTagclawWalletEnv() // 派生 Steem 并写入 .env
// 若只需地址：await getClawWalletAddress()

// Sign / 转账 / 交易：省略 privateKey 即走 Claw
const signature = await signMessage('', 'message to sign')
const bnbTx = await transferBnb(undefined, '0x<to>', '0.01')
const buyTx = await buyToken({
  tick: 'MyToken',
  ethAmount: '1000000000000000'
})
const sellTx = await sellToken({
  tick: 'MyToken',
  amount: '1000000000000000000'
})

// Legacy（本地随机钱包 + 私钥派生 Steem，与 Claw 默认 Steem 不同）
// const { address, privateKey } = createWallet()
// const steemKeys = generateSteemKeys(privateKey)

// BNB balance (BNB Chain)
const bnb = await getBnbBalance('0x...')
// ERC20 balance
const token = await getErc20Balance('0x<holder>', '0x<ERC20-contract>')

// Token price (BNB/USD, token/BNB, token/USD)
const price = await getTokenPrice({ tick: 'TagClaw' })
// => { tick, token, version, listed, isImport, pair, bnbPriceUsd, tokenPriceInBnb, tokenPriceUsd }

// Transfer ERC20（Claw：不传第一参）
const erc20Tx = await transferErc20(undefined, '0x<ERC20-contract>', '0x<to>', '100')

// Fixed IPShare contract used by this package
console.log(IPSHARE_CONTRACT)

// IPShare queries
const ipshareSupply = await getIpShareSupply('0x<subject>')
const ipshareBalance = await getIpShareBalance('0x<subject>', '0x<holder>')
const ipshareStakeInfo = await getIpShareStakeInfo('0x<subject>', '0x<staker>')
const ipsharePendingRewards = await getIpSharePendingRewards('0x<subject>', '0x<staker>')

// Create IPShare; if subject is omitted, Claw wallet address is used（不传 privateKey）
const createTx = await createIpShare({
  subject: '0x<subject>'
})

// Buy / sell IPShare
const buyIpShareTx = await buyIpShare({
  subject: '0x<subject>',
  value: '1000000000000000',
  amountOutMin: '0'
})

const sellIpShareTx = await sellIpShare({
  subject: '0x<subject>',
  amount: '1000000000000000000',
  amountOutMin: '0'
})

// Stake lifecycle
const stakeTx = await stakeIpShare({
  subject: '0x<subject>',
  amount: '1000000000000000000'
})

const unstakeTx = await unstakeIpShare({
  subject: '0x<subject>',
  amount: '1000000000000000000'
})

const redeemTx = await redeemIpShare({
  subject: '0x<subject>'
})

// The caller decides whether claim should be sent
const claimTx = await claimIpShareRewards({
  subject: '0x<subject>'
})
```

## API

| Method | Description |
|--------|-------------|
| `RegisterSteemMessage` | Constant string used with Claw `personal_sign` for Steem derivation |
| `getClawWalletAddress(chain?)` | Sandbox EVM address (`bsc` preferred, else `ethereum`) |
| `generateSteemKeysFromClaw(opts?)` | Steem keys via Claw sign + KDF (`opts.rpcUrl` optional) |
| `syncTagclawWalletEnv(opts?)` | `{ address, steemKeys, envPath }` after merging into `.env` |
| `mergeTagclawWalletEnv({ address, steemKeys })` | Upsert TagClaw keys in package `.env` |
| `createWallet()` | **Legacy**：本地随机钱包 `{ address, privateKey }`，非 Claw 流程 |
| `generateSteemKeys(evmPrivateKey)` | **Legacy**：本地私钥派生 Steem |
| `createWalletAndSteemKeys()` | **Legacy**：本地随机钱包 + Steem |
| `signMessage(privateKey, message)` | `privateKey` optional; omit/empty → Claw `personal_sign` |
| `getBnbBalance(address, rpcUrl?)` | Query BNB native balance on BNB Chain, returns `{ wei, ether }` |
| `getErc20Balance(address, tokenContractAddress, rpcUrl?)` | Query ERC20 balance on BNB Chain, returns `{ raw, formatted, symbol, decimals }` |
| `getTokenPrice(params)` | Query token price by tick; params `{ tick, rpcUrl? }`; returns `{ tick, token, version, listed, isImport, pair, bnbPriceUsd, tokenPriceInBnb, tokenPriceUsd }` |
| `transferBnb(privateKey?, toAddress, amount, rpcUrl?, opts?)` | `privateKey` optional → Claw signer |
| `transferErc20(privateKey?, ...)` | Same |
| `configure(opts)` | Set module config, e.g. `configure({ apiUrl: '...' })`. Default API: `https://bsc-api.tagai.fun` |
| `buyToken(params)` | `privateKey` optional; `{ privateKey?, tick, ethAmount, ... }` |
| `sellToken(params)` | `privateKey` optional; `{ privateKey?, tick, amount, ... }` |
| `getIpShareSupply(subject, rpcUrl?)` | Query IPShare supply for a subject; returns `{ contract, subject, raw, formatted }` |
| `getIpShareBalance(subject, holder, rpcUrl?)` | Query holder IPShare balance under a subject; returns `{ contract, subject, holder, raw, formatted }` |
| `getIpShareStakeInfo(subject, staker, rpcUrl?)` | Query staking info; returns staked amount, redeem amount, unlock time, debts, profit and derived flags |
| `getIpSharePendingRewards(subject, staker, rpcUrl?)` | Query pending rewards from `getPendingProfits`; returns `{ contract, subject, staker, raw, formatted }` |
| `createIpShare(params)` | `privateKey` optional; `{ privateKey?, subject?, value?, rpcUrl? }` |
| `buyIpShare(params)` | `privateKey` optional |
| `sellIpShare(params)` | `privateKey` optional |
| `stakeIpShare(params)` | `privateKey` optional |
| `unstakeIpShare(params)` | `privateKey` optional |
| `redeemIpShare(params)` | `privateKey` optional |
| `claimIpShareRewards(params)` | `privateKey` optional |
| `IPSHARE_CONTRACT` | Fixed IPShare contract address used by this wallet package |

## License

MIT
