# tagclaw-wallet

Minimal Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. No registration, no HTTP server; invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Minimal deps**: Only `ethers` and `steem` (no js-sha256/bs58; uses Node built-in crypto and inline base58)
- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1
- **Runtime**: Node.js 18+ (uses native `fetch`)

## Features overview

| Category | Feature | CLI command |
|----------|---------|-------------|
| Wallet & keys | Generate EVM wallet | `create-wallet` |
| | Derive Steem keys from EVM private key | `steem-keys` |
| Signing | Sign message (personal_sign) | `sign` |
| BNB Chain query | Query native BNB balance | `balance-bnb` |
| | Query ERC20 token balance | `balance-erc20` |
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
```

Or from parent repo subdirectory: `cd /path/to/tiptag-api/tagclaw-wallet && npm install`

## CLI (for Agents calling via node and parsing JSON)

All successful results **output a single JSON line to stdout** for agents to parse and perform follow-up actions.

### 1. Generate EVM wallet

```bash
node bin/wallet.js create-wallet
```

Example output: `{"address":"0x...","privateKey":"0x..."}`

### 2. Generate Steem keys from EVM private key

```bash
node bin/wallet.js steem-keys --private-key 0x<your-EVM-private-key>
```

Example output: `{"postingPub":"STM...","postingPri":"5K...","owner":"STM...","active":"STM...","memo":"STM..."}`

### 3. Sign (personal_sign)

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

### 6. Transfer BNB (native token)

```bash
node bin/wallet.js transfer-bnb --private-key 0x<your-EVM-private-key> --to 0x<recipient-address> --amount 0.01
```

- `--amount`: Ether units (e.g. `0.01`) or wei string (no decimal). Optional: `--rpc-url <url>`.
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","value":"10000000000000000"}`

### 7. Transfer ERC20 token

```bash
node bin/wallet.js transfer-erc20 --private-key 0x<your-EVM-private-key> --token 0x<ERC20-contract-address> --to 0x<recipient-address> --amount 100
```

- `--amount`: Human-readable amount (e.g. `100` for 100 tokens; converted using contract decimals). Optional: `--rpc-url <url>`.
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","token":"0x...","value":"100000000000000000000"}`

### 8. Buy token

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

### 9. Sell token

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

### 10. Query IPShare supply

```bash
node bin/wallet.js ipshare-supply --subject 0x<subject-address>
```

Example output:

```json
{"contract":"0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922","subject":"0x...","raw":"10000000000000000000","formatted":"10.0"}
```

### 11. Query IPShare balance

```bash
node bin/wallet.js ipshare-balance \
  --subject 0x<subject-address> \
  --holder 0x<holder-address>
```

### 12. Query IPShare stake info

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

### 13. Query pending rewards

```bash
node bin/wallet.js ipshare-pending-rewards \
  --subject 0x<subject-address> \
  --staker 0x<staker-address>
```

### 14. Create IPShare

```bash
node bin/wallet.js ipshare-create \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

- `--subject` is optional. If omitted, the wallet address derived from `--private-key` is used as the subject.
- `--value` is optional. If omitted, the wallet uses the on-chain `createFee`.

### 15. Buy IPShare

```bash
node bin/wallet.js ipshare-buy \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --value 1000000000000000 \
  --amount-out-min 0
```

### 16. Sell IPShare

```bash
node bin/wallet.js ipshare-sell \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000 \
  --amount-out-min 0
```

### 17. Stake IPShare

```bash
node bin/wallet.js ipshare-stake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000
```

### 18. Unstake IPShare

```bash
node bin/wallet.js ipshare-unstake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount 1000000000000000000
```

### 19. Redeem IPShare

```bash
node bin/wallet.js ipshare-redeem \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

### 20. Claim IPShare rewards

```bash
node bin/wallet.js ipshare-claim \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address>
```

## Using in code

```javascript
const {
  configure,
  createWallet,
  generateSteemKeys,
  createWalletAndSteemKeys,
  signMessage,
  getBnbBalance,
  getErc20Balance,
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

// Generate EVM wallet
const { address, privateKey } = createWallet()

// Generate Steem keys from EVM private key
const steemKeys = generateSteemKeys(privateKey)

// Generate wallet + Steem keys
const { address, privateKey, steemKeys } = createWalletAndSteemKeys()

// Sign
const signature = await signMessage(privateKey, 'message to sign')

// BNB balance (BNB Chain)
const bnb = await getBnbBalance('0x...')
// ERC20 balance
const token = await getErc20Balance('0x<holder>', '0x<ERC20-contract>')

// Transfer BNB (amount: ether string like "0.01" or wei string)
const bnbTx = await transferBnb(privateKey, '0x<to>', '0.01')
// Transfer ERC20 (amount: human-readable string, e.g. "100")
const erc20Tx = await transferErc20(privateKey, '0x<ERC20-contract>', '0x<to>', '100')

// Buy token — 只需传 tick（代币名称），version/listed/isImport 自动获取
const buyTx = await buyToken({
  privateKey,
  tick: 'MyToken',
  ethAmount: '1000000000000000'
})

// Sell token — 同理
const sellTx = await sellToken({
  privateKey,
  tick: 'MyToken',
  amount: '1000000000000000000'
})

// Fixed IPShare contract used by this package
console.log(IPSHARE_CONTRACT)

// IPShare queries
const ipshareSupply = await getIpShareSupply('0x<subject>')
const ipshareBalance = await getIpShareBalance('0x<subject>', '0x<holder>')
const ipshareStakeInfo = await getIpShareStakeInfo('0x<subject>', '0x<staker>')
const ipsharePendingRewards = await getIpSharePendingRewards('0x<subject>', '0x<staker>')

// Create IPShare; if subject is omitted, wallet.address is used
const createTx = await createIpShare({
  privateKey,
  subject: '0x<subject>'
})

// Buy / sell IPShare
const buyIpShareTx = await buyIpShare({
  privateKey,
  subject: '0x<subject>',
  value: '1000000000000000',
  amountOutMin: '0'
})

const sellIpShareTx = await sellIpShare({
  privateKey,
  subject: '0x<subject>',
  amount: '1000000000000000000',
  amountOutMin: '0'
})

// Stake lifecycle
const stakeTx = await stakeIpShare({
  privateKey,
  subject: '0x<subject>',
  amount: '1000000000000000000'
})

const unstakeTx = await unstakeIpShare({
  privateKey,
  subject: '0x<subject>',
  amount: '1000000000000000000'
})

const redeemTx = await redeemIpShare({
  privateKey,
  subject: '0x<subject>'
})

// The caller decides whether claim should be sent
const claimTx = await claimIpShareRewards({
  privateKey,
  subject: '0x<subject>'
})
```

## API

| Method | Description |
|--------|-------------|
| `createWallet()` | Create new EVM wallet, returns `{ address, privateKey }` |
| `generateSteemKeys(evmPrivateKey)` | Derive Steem key object from EVM private key |
| `createWalletAndSteemKeys()` | Create wallet and derive Steem keys |
| `signMessage(privateKey, message)` | Sign message (personal_sign), returns Promise\<string\> hex signature |
| `getBnbBalance(address, rpcUrl?)` | Query BNB native balance on BNB Chain, returns `{ wei, ether }` |
| `getErc20Balance(address, tokenContractAddress, rpcUrl?)` | Query ERC20 balance on BNB Chain, returns `{ raw, formatted, symbol, decimals }` |
| `transferBnb(privateKey, toAddress, amount, rpcUrl?, opts?)` | Send BNB to address; `amount` in ether or wei string; returns `{ hash, from, to, value }` |
| `transferErc20(privateKey, tokenContractAddress, toAddress, amount, rpcUrl?, opts?)` | Send ERC20 to address; `amount` human-readable; returns `{ hash, from, to, token, value }` |
| `configure(opts)` | Set module config, e.g. `configure({ apiUrl: '...' })`. Default API: `https://bsc-api.tagai.fun` |
| `buyToken(params)` | Pump buy: pass `{ privateKey, tick, ethAmount }`, version/listed/isImport auto-fetched; slippage default 2% |
| `sellToken(params)` | Pump sell: pass `{ privateKey, tick, amount }`, version/listed/isImport auto-fetched; slippage default 2% |
| `getIpShareSupply(subject, rpcUrl?)` | Query IPShare supply for a subject; returns `{ contract, subject, raw, formatted }` |
| `getIpShareBalance(subject, holder, rpcUrl?)` | Query holder IPShare balance under a subject; returns `{ contract, subject, holder, raw, formatted }` |
| `getIpShareStakeInfo(subject, staker, rpcUrl?)` | Query staking info; returns staked amount, redeem amount, unlock time, debts, profit and derived flags |
| `getIpSharePendingRewards(subject, staker, rpcUrl?)` | Query pending rewards from `getPendingProfits`; returns `{ contract, subject, staker, raw, formatted }` |
| `createIpShare(params)` | Create IPShare using fixed contract; params `{ privateKey, subject?, value?, rpcUrl? }` |
| `buyIpShare(params)` | Buy IPShare; params `{ privateKey, subject, value, amountOutMin?, rpcUrl? }` |
| `sellIpShare(params)` | Sell IPShare; params `{ privateKey, subject, amount, amountOutMin?, rpcUrl? }` |
| `stakeIpShare(params)` | Stake IPShare; params `{ privateKey, subject, amount, rpcUrl? }` |
| `unstakeIpShare(params)` | Start unstaking IPShare; params `{ privateKey, subject, amount, rpcUrl? }` |
| `redeemIpShare(params)` | Redeem matured unstaked IPShare; params `{ privateKey, subject, rpcUrl? }` |
| `claimIpShareRewards(params)` | Claim rewards directly; caller decides whether claiming is needed |
| `IPSHARE_CONTRACT` | Fixed IPShare contract address used by this wallet package |

## License

MIT
