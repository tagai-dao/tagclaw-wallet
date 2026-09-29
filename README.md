# tagclaw-wallet

Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. Invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1
- **Runtime**: Node.js 18+ (uses native `fetch`)

## Wallet creation and compatibility

New accounts use a locally generated EVM private key, saved in this wallet directory's `.env`. Setup no longer downloads or runs the Claw Wallet installer.

Existing Claw Wallet accounts remain supported: their address lookup, signing, transactions, binding, and signature-based Steem derivation continue through the sandbox. Setup detects an existing `.env.clay`, `identity.json`, or Claw connection environment and reuses it. An unavailable or incomplete sandbox configuration produces an error instead of creating a replacement identity.

## Installation

Requires **Node.js 18+** and **npm**. From the **`tagclaw-wallet`** directory:

```bash
# macOS / Linux
bash setup.sh
```

```powershell
# Windows PowerShell
.\setup.ps1
```

Both scripts run `npm install` followed by `node bin/wallet.js init-wallet`. You can also run those commands manually. `create-wallet` is an alias for `init-wallet`: both persist a new local wallet or reuse the existing wallet. Re-running setup keeps the same address and keys. An existing address or Steem identity without its signing credentials blocks creation; restore its credentials first.

New local wallets save:

```dotenv
TAGCLAW_WALLET_BACKEND=local
TAGCLAW_PRIVATE_KEY=0x...
TAGCLAW_ETH_ADDR=0x...
TAGCLAW_STEEM_POSTING_PUB=STM...
TAGCLAW_STEEM_POSTING_PRI=5K...
TAGCLAW_STEEM_OWNER=STM...
TAGCLAW_STEEM_ACTIVE=STM...
TAGCLAW_STEEM_MEMO=STM...
```

The file is written atomically with mode `0600` on POSIX systems. On Windows, protect the wallet directory with your user account's filesystem permissions. Keep `.env` backed up securely; it contains the unencrypted EVM and Steem posting private keys. Setup and `create-wallet` print only address/backend/file metadata, never private keys.

For TagClaw registration, use `TAGCLAW_ETH_ADDR` as `ethAddr` and the `TAGCLAW_STEEM_*` fields as `steemKeys`. Local wallets retain the original private-key-based Steem derivation. Claw wallets retain the signature-based derivation; changing between them is not an account migration.

## Wallet commands

```bash
node bin/wallet.js create-wallet  # create and save, or reuse an existing wallet
node bin/wallet.js address        # current local or Claw EVM address
node bin/wallet.js sync-env       # synchronize the configured wallet's address and Steem keys
node bin/wallet.js steem-keys      # explicitly outputs Steem keys, including posting private key
```

To import an existing local wallet, supply `TAGCLAW_PRIVATE_KEY` in `.env` or the environment, then run `sync-env`. `--private-key` is also supported by `sync-env` and `init-wallet`. Synchronization preserves unrelated `.env` entries and refuses to overwrite an existing wallet's address, backend, or different Steem keys. Use a separate directory for another identity.

The JavaScript `createWallet()` API returns `{ address, privateKey }` in memory, as in older releases. `await initWallet()` persists/reuses the wallet; `await getWalletAddress()` resolves its address.

## Existing Claw Wallet accounts

Keep `.env.clay`, `identity.json`, and the existing sandbox files. With no local key configured, old installations automatically use Claw. Successful synchronization records `TAGCLAW_WALLET_BACKEND=claw` and does not save an EVM private key. `claw-address` and `bind-wallet` remain Claw-specific commands.

## Bind wallet to Claw UI

This step is optional. Only do it if the owner wants to bind the wallet in the Claw web UI.

1. Agent: find the wallet UID in `identity.json`.
2. Owner: open [clawwallet.cc](https://www.clawwallet.cc/), choose `I am Human`, and sign in.
3. Owner: click `bind agent wallet`, paste the UID, and click `Find Wallet`.
4. Owner: copy the generated message hex string and send it to the agent.
5. Agent: run:

```bash
node bin/wallet.js bind-wallet --message-hex <your-message-hex-string>
```

6. Owner: finish the remaining bind steps in the web UI.

---

## Usage

Signing and on-chain writes select credentials in this order:

1. An explicit `--private-key` (or JavaScript `privateKey` argument).
2. The backend in `TAGCLAW_WALLET_BACKEND`, if set (`local` or `claw`).
3. `TAGCLAW_PRIVATE_KEY` from the environment or wallet `.env`.
4. An existing Claw Wallet configuration.

All write commands use this same selection, including transfers, token trades, IPShare, and Nutbox. A malformed local key fails without falling back to Claw. For configured wallets, omit `--private-key` from the examples below. `TAGCLAW_WALLET_BACKEND=claw` keeps Claw selected when both configurations are present; an explicit private-key argument still overrides it for that operation.

### 1. Sign (personal_sign)

```bash
node bin/wallet.js sign --message "message to sign"
```

If stored EVM private key:

```bash
node bin/wallet.js sign --private-key 0x<your-EVM-private-key> --message "message to sign"
```

Example output: `{"signature":"0x..."}`

### 2. Query BNB balance (BNB Chain / BSC)

```bash
node bin/wallet.js balance-bnb --address 0x<address>
```

### 3. Query ERC20 token balance (BNB Chain)

```bash
node bin/wallet.js balance-erc20 --address 0x<holder-address> --token 0x<ERC20-contract-address>
```

### 4. Query token price

```bash
node bin/wallet.js price-token --tick TagClaw
```

- `--tick`: Token symbol（case-sensitive），e.g. TagClaw、BUIDL、TTAI.

Example output:

```json
{"tick":"TagClaw","token":"0xe7324F2987aCd88Ee7286EB9DAb0EE926ad36a68","version":4,"listed":true,"isImport":false,"pair":"0x2771b3CC3eC98EE8B17B7CD2520C4727bcC2676e","bnbPriceUsd":643.61,"tokenPriceInBnb":8.624222012577607e-8,"tokenPriceUsd":0.000055506355295150736}
```

### 5. Transfer BNB (native token)

```bash
node bin/wallet.js transfer-bnb --private-key 0x<your-EVM-private-key> --to 0x<recipient-address> --amount 0.01
```

- `--amount`: Ether units (e.g. `0.01`) or wei string (no decimal).
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","value":"10000000000000000"}`

### 6. Transfer ERC20 token

```bash
node bin/wallet.js transfer-erc20 --private-key 0x<your-EVM-private-key> --token 0x<ERC20-contract-address> --to 0x<recipient-address> --amount 100
```

- `--amount`: Human-readable amount (e.g. `100` for 100 tokens; converted using contract decimals).
- Example output: `{"hash":"0x...","from":"0x...","to":"0x...","token":"0x...","value":"100000000000000000000"}`

### 7. Buy token

```bash
node bin/wallet.js buy-token \
  --private-key 0x<your-EVM-private-key> \
  --tick MyToken \
  --eth-amount 1000000000000000
```

For **version 8** tokens, include the API key (required):

```bash
node bin/wallet.js buy-token \
  --private-key 0x<your-EVM-private-key> \
  --tick MyToken \
  --eth-amount 1000000000000000 \
  --tagclaw-api-key <your-api-key>
```

- `--private-key`: sender EVM private key (`0x...`).
- `--tick`: 代币名称（区分大小写），token 合约地址、version、listed、isImport 等信息会自动从 API 获取.
- `--eth-amount`: input ETH/BNB amount in wei.
- Optional: `--slippage <bps>` (default `200` = 2%), `--sellsman 0x...`, `--rpc-url <url>`, `--api-url <url>`.
- `--signature`: required only when `version=5` and unlisted.
- **`--tagclaw-api-key <apiKey>`** (or export **`TAGCLAW_API_KEY`**): **required** when trading **version 8** tokens. Unlisted v8 buys call the TagClaw API for an agent trade signature (`Authorization: Bearer`); without a valid key the request fails and the swap cannot complete. Prefer the CLI flag or env var like other agent-facing commands.

### 8. Sell token

```bash
node bin/wallet.js sell-token \
  --private-key 0x<your-EVM-private-key> \
  --tick MyToken \
  --amount 1000000000000000000
```

For **version 8** tokens, include the API key (required):

```bash
node bin/wallet.js sell-token \
  --private-key 0x<your-EVM-private-key> \
  --tick MyToken \
  --amount 1000000000000000000 \
  --tagclaw-api-key <your-api-key>
```

- `--private-key`: sender EVM private key (`0x...`).
- `--tick`: 代币名称（区分大小写），token 合约地址、version、listed、isImport 等信息会自动从 API 获取.
- `--amount`: token amount to sell (raw uint256).
- Optional: `--slippage <bps>` (default `200` = 2%), `--sellsman 0x...`, `--rpc-url <url>`, `--api-url <url>`.
- **`--tagclaw-api-key <apiKey>`** (or **`TAGCLAW_API_KEY`**): **required** for **version 8** tokens — same agent trade signature flow as buy; missing key means the sell cannot be submitted.

## BSC v14 main flow

The wallet supports Pump14 community creation, curve trading, and listed native-BNB/token trading through PancakeSwap Infinity V4. New communities default to **version 14**. Existing local-key and ClawWallet signers use the same commands. The existing v1–v8 paths remain; v9–v13 trading is not implemented and fails explicitly rather than guessing a route.

For v14, `price-token`, `buy-token`, and `sell-token` read the token's chain state instead of trusting the API's cached listing status. During `listingPending`, wait for listing to finish. Curve buys use the current on-chain buy fees and remaining curve supply; listed trades use CLQuoter and Universal Router. A price is a spot price, not a guaranteed execution quote.

```bash
node bin/wallet.js price-token --tick MYCOIN
node bin/wallet.js buy-token --tick MYCOIN --eth-amount 1000000000000000 --slippage 200 --quote-only
node bin/wallet.js sell-token --tick MYCOIN --amount 1000000000000000000 --slippage 200 --quote-only
```

Remove `--quote-only` to submit a trade. v14 trade quotes do not send transactions or approvals; they still use the configured wallet and RPC. `--quote-only` on legacy trades fails explicitly. v14 accepts `--slippage 0..5000` bps (default 200); zero retains a minimum-output check. Unlike unlisted v8, v14 does not request an agent trade signature. Listed sells approve the exact input amount to Permit2 and the Universal Router if needed, then obtain a fresh quote before swapping. The result includes `approveHashes`, `expectedAmount`/`expectedReceive`, and `amountOutMin`. Approval transactions consume BNB gas.

## Community creation (v14 default)

Create an index configuration JSON file, for example `index.json`. Choose the assets, weights, fee shares, and ownership policy for the intended community; these are creation parameters, not inferred defaults. This example uses BSC BTCB and ETH; the wallet checks current on-chain constituent approval before proceeding.

```json
{
  "name": "My Community Index",
  "symbol": "MYINDEX",
  "constituentAssets": [
    "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8"
  ],
  "targetWeights": [5000, 5000],
  "basketFeeBps": 100,
  "creatorShareBps": 0,
  "retainCommunityOwnership": true
}
```

Requirements: 1–4 distinct approved nonzero assets, positive weights totaling 10000, name up to 64 UTF-8 bytes, symbol up to 16 bytes, basket fee 100–300 bps, creator share 0–3000 bps of the distributable fee share, and an explicit ownership boolean. `true` retains community ownership; `false` renounces it. The selected assets can be discovered through `GET /pump/v14/creation/<creator-address>` on the current BSC API; on-chain approval remains authoritative.

```bash
# Preview fees and simulate gas without broadcasting.
node bin/wallet.js create-community --tick MYCOIN --index-config index.json --quote-only

# Use the salt from the quote to retain the same predicted token address.
node bin/wallet.js create-community --tick MYCOIN --index-config index.json --salt 0x<salt-from-quote>
```

Optional parameters:

- `--version 14` (default); `--version 8` retains the legacy creation flow without index configuration.
- `--initial-buy <wei>` adds an initial BNB purchase to creation (default 0).
- `--trade-reward-ratio <bps>` creates the optional trade mining pool (default 0, range 0–8000, also constrained by current factory approval and maximum).
- `--salt 0x<32-byte-hex>` reuses a quote's salt. Otherwise the wallet searches locally for an unused CREATE2 address ending in `3333` using the deployed v14 template.

The quote includes `version`, `salt`, `predictedToken`, `indexConfig`, `optionalPools`, fees, `settingsCount`, `transactionValue`, `estimatedGasReserve`, `minimumRequiredBalance`, and `canCreate`. Settings fees are charged for **each constituent pool plus each optional pool**. Total value includes the initial buy. The wallet reserves gas plus at least **0.001 BNB** remaining. If gas simulation fails, a quote returns `canCreate: false` with `simulationError`; execution fails before broadcasting. Keep the same configuration and optional parameters when executing the quote; fees and balance are rechecked.

Successful creation returns `createHash`, `token`, `nutboxCommunity`, `stakingPools`, and `optionalPoolAddresses`. v14 does **not** return a fixed `nutboxSocialPool`, `lastSaltIndex`, or `nextSaltIndex`.

The wallet creates on-chain only. Register metadata separately through the current BSC API's `POST /pump/v14/register`, with `chainId: 56`, `version: 14`, `createHash`, `tick`, `token`, `logoUrl`, and optional description/social fields. The API verifies the receipt. Require a successful `c: 0` response with `d`; on temporary registration failure, persist and retry the **same hash**, never recreate the token. The older `POST /tagclaw/community/create` flow remains for v8. If the deployed API has no v14 registration endpoint, preserve the confirmed on-chain result for later registration.

Legacy creation:

```bash
node bin/wallet.js create-community --version 8 --tick OLDCOIN --quote-only
```

## Nutbox guide for agents

Use TagClaw API first to locate the Nutbox community and pool list, then use these wallet commands to read chain state or execute pool operations.

### Read Nutbox factory mapping

```bash
node bin/wallet.js nutbox-factories
```

### Read Nutbox community

```bash
node bin/wallet.js nutbox-community --ctoken 0x<community-token-address>
node bin/wallet.js nutbox-community --community 0x<nutbox-community-address>
```

Optional:

- `--address 0x<user-address>` to also read user pending reward context
- `--tagclaw-api-key <apiKey>` is the preferred path for agents
- or export `TAGCLAW_API_KEY` before running the command

### Read Nutbox pool

```bash
node bin/wallet.js nutbox-pool --pool 0x<pool-address>
```

Optional:

- `--address 0x<user-address>` to read user staking or redeem context

### Read committee fees

```bash
node bin/wallet.js nutbox-committee-fees --committee 0x<committee-address>
```

### Admin commands

```bash
node bin/wallet.js nutbox-add-erc20-staking-pool --community 0x<community> --name "Stake TOKEN" --stake-token 0x<erc20> --ratios 7000,3000
node bin/wallet.js nutbox-add-erc20-locking-pool --community 0x<community> --name "Lock TOKEN" --stake-token 0x<erc20> --lock-duration 2592000 --ratios 7000,3000
node bin/wallet.js nutbox-add-erc1155-pool --community 0x<community> --name "Stake NFT" --stake-token 0x<erc1155> --token-id 1 --ratios 7000,3000
node bin/wallet.js nutbox-set-pool-ratios --community 0x<community> --ratios 7000,3000
```

### Standard pool reward and staking commands

```bash
node bin/wallet.js nutbox-claim-rewards --community 0x<community> --pools 0x<pool1>,0x<pool2>
node bin/wallet.js nutbox-deposit-erc20-staking --pool 0x<pool> --amount 1000000000000000000
node bin/wallet.js nutbox-withdraw-erc20-staking --pool 0x<pool> --amount 1000000000000000000
node bin/wallet.js nutbox-deposit-erc20-locking --pool 0x<pool> --amount 1000000000000000000
node bin/wallet.js nutbox-withdraw-erc20-locking --pool 0x<pool> --amount 1000000000000000000
node bin/wallet.js nutbox-redeem-erc20-locking --pool 0x<pool>
node bin/wallet.js nutbox-deposit-erc1155 --pool 0x<pool> --amount 1
node bin/wallet.js nutbox-withdraw-erc1155 --pool 0x<pool> --amount 1
```

### Social Curation commands

```bash
node bin/wallet.js nutbox-harvest-social-pool --pool 0x<pool>
node bin/wallet.js nutbox-claim-social-pool --pool 0x<pool> --order-id 1 --amount 1000000000000000000 --deadline 1700000000 --signature 0x<sig>
```

Use `nutbox-claim-social-pool` only when you already have a valid claim signature payload.

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

- `staker`: staker address
- `amount`: current staked amount
- `redeemAmount`: amount waiting for redeem
- `unlockTime`: unix timestamp string
- `debts`: debts amount
- `profit`: accumulated profit field from `getStakerInfo`

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
  --value <1000000000000000> \
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
  --amount <1000000000000000000>
```

### 17. Unstake IPShare

```bash
node bin/wallet.js ipshare-unstake \
  --private-key 0x<your-EVM-private-key> \
  --subject 0x<subject-address> \
  --amount <1000000000000000000>
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

## Restart (Claw Wallet only)

Local wallets do not require a sandbox. The Clay sandbox may stop running. If a task fails or you suspect the sandbox is down, **do not** blindly restart.

1. Read **`.env.clay`** (written when the sandbox starts) and find **`CLAY_SANDBOX_URL`**. That value is the sandbox base URL (for example `http://127.0.0.1:9000`). **`LISTEN_ADDR`** in the same file describes the listen address and should align with that URL.
2. **Check** whether the sandbox is actually running — for example try an HTTP request to `CLAY_SANDBOX_URL` with `curl` (connection refused, timeouts, or clear “not listening” errors mean it is not running).
3. **Only when** the sandbox is **not** running, start it:

```bash
./clay-sandbox serve
```

If the check shows the sandbox is already up, fix the underlying issue instead of starting a second `serve` process.

## License

MIT
