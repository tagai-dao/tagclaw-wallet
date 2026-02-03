# tagclaw-wallet

Minimal wallet utilities—three things only: **generate EVM address, sign, generate Steem private key**. No registration, no HTTP. Agents call via `node bin/wallet.js <command> [args]` and perform follow-up actions based on the JSON from stdout.

- **Minimal deps**: Only `ethers` and `steem` (no js-sha256/bs58, uses Node built-in crypto + inline base58)
- **Single purpose**: Wallet-related only, no registration
- **Output contract**: On success outputs a single JSON line to stdout; errors go to stderr and exit 1

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

## Using in code

```javascript
const { createWallet, generateSteemKeys, createWalletAndSteemKeys, signMessage, getBnbBalance, getErc20Balance } = require('.')

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

## License

MIT
