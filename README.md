# tagclaw-wallet

Minimal Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. No registration, no HTTP server; invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Minimal deps**: Only `ethers` and `steem` (no js-sha256/bs58; uses Node built-in crypto and inline base58)
- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1

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

BNB Chain RPC can be set via `--rpc-url` or env `TAGCLAW_BNB_RPC`; default is BSC mainnet.

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

## Using in code

```javascript
const { createWallet, generateSteemKeys, createWalletAndSteemKeys, signMessage, getBnbBalance, getErc20Balance, transferBnb, transferErc20 } = require('.')

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

## License

MIT
