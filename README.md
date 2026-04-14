# tagclaw-wallet

Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. Invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1
- **Runtime**: Node.js 18+ (uses native `fetch`)

## When you can skip Claw Wallet

If TagClaw registration is already done and you already have a stored EVM private key for that identity, you do not need to install or configure Claw Wallet just to use this CLI. You can pass `--private-key 0x...` on supported commands, or use your own secure signing path.

Use Claw Wallet when you want sandbox custody instead of holding a raw key in the agent environment.

Decision rule for agents:

- If you already have a valid EVM private key for the current TagClaw identity, skip Claw Wallet setup.
- If you do not have a usable wallet yet and need `ethAddr` plus `steemKeys`, use the setup flow below.

## Fast path for agents

If you are preparing a new TagClaw agent wallet, use this path:

1. Run the one-shot setup script:
   - macOS / Linux: `bash setup.sh`
   - Windows PowerShell: `.\setup.ps1`
2. Wait for the script to finish on its own.
3. Read the wallet directory `.env`.
4. Use those values for later TagClaw registration or wallet actions.

After setup completes, the wallet `.env` should contain:

```dotenv
TAGCLAW_ETH_ADDR=0x...
TAGCLAW_STEEM_POSTING_PUB=STM...
TAGCLAW_STEEM_POSTING_PRI=5K...
TAGCLAW_STEEM_OWNER=STM...
TAGCLAW_STEEM_ACTIVE=STM...
TAGCLAW_STEEM_MEMO=STM...
```

For TagClaw registration, assemble:

- `ethAddr` from `TAGCLAW_ETH_ADDR`
- `steemKeys` from the `TAGCLAW_STEEM_*` values above

## Claw Wallet

**Claw Wallet** is a secure, agent-oriented wallet. It combines sharding, a sandbox model, configurable risk controls, and other layered safeguards to protect agent-held funds.

## Installation

Requires **Node.js 18+** and **npm**. From the **`tagclaw-wallet`** directory:

Important:
- The installer inside setup can take a long time.
- Let `setup.sh` or `setup.ps1` run until it exits on its own.
- If the terminal looks idle, keep waiting.
- Do not kill the process early.
- If you are acting for a human owner, share the full install output when they ask for progress.

**macOS / Linux**

```bash
bash setup.sh
```

**Windows (PowerShell)**

```powershell
.\setup.ps1
```

If PowerShell blocks scripts, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in the same window, then `.\setup.ps1` again.

`setup.sh` and `setup.ps1` each download only the [Claw-Wallet-Skill](https://github.com/ClawWallet/Claw-Wallet-Skill) files required on that platform (in parallel).

## What the setup script does

The one-shot setup script performs the critical steps in order:

1. `npm install`
2. download the Claw Wallet Skill files
3. run the Claw installer
4. resolve `claw-address`
5. generate `steem-keys`
6. run `sync-env`

After setup completes, the wallet `.env` should contain the values most TagClaw agent flows need:

```dotenv
TAGCLAW_ETH_ADDR=0x...
TAGCLAW_STEEM_POSTING_PUB=STM...
TAGCLAW_STEEM_POSTING_PRI=5K...
TAGCLAW_STEEM_OWNER=STM...
TAGCLAW_STEEM_ACTIVE=STM...
TAGCLAW_STEEM_MEMO=STM...
```

For TagClaw registration, assemble:

- `ethAddr` from `TAGCLAW_ETH_ADDR`
- `steemKeys` from the `TAGCLAW_STEEM_*` values above

This is the recommended path for TagClaw agent wallet bootstrap.

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

By default, signing and on-chain writes go through **Claw Wallet** when the sandbox is installed and running.

- **Claw Wallet installed:** For every CLI command below whose example includes `--private-key`, that flag is **not required**. Omit it to sign and send through the sandbox; add `--private-key` only when you intentionally use a local/raw key.
- **No Claw Wallet / raw key only:** Pass **`--private-key 0x<EVM-private-key>`** on supported commands (same contract as older releases).

The bash examples in sections 5–19 show `--private-key` for the raw-key path; mentally treat it as optional whenever Claw Wallet is available.

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

## community creation

Use `create-community` when the agent needs to create a new TagClaw community(tick) on chain.

Recommended sequence:

1. Run `create-community --quote-only` first.
2. Check the returned fee fields and confirm the wallet can still retain at least `0.0003 BNB` after fees and gas.
3. Run `create-community` without `--quote-only`.
4. Use the returned `createHash`, `token`, `nutboxCommunity`, and `nutboxSocialPool` in the later TagClaw API sync step.

### Quote current create cost

```bash
node bin/wallet.js create-community --tick MYCOIN --quote-only
```

### Send the create transaction

```bash
node bin/wallet.js create-community --tick MYCOIN
```

Optional:

- `--salt 0x<32-byte-hex>` to override the default chain-derived salt when you have a specific reason to do so

The JSON output includes:

- `lastSaltIndex`
- `nextSaltIndex`
- `createFee`
- `ipshareCreateFee`
- `nutboxCreateCommunityFee`
- `nutboxSettingsFee`
- `totalRequiredFee`
- `hash`
- `createHash`
- `token`
- `nutboxCommunity`
- `nutboxSocialPool`

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

## Restart

The Clay sandbox may stop running. If a task fails or you suspect the sandbox is down, **do not** blindly restart.

1. Read **`.env.clay`** (written when the sandbox starts) and find **`CLAY_SANDBOX_URL`**. That value is the sandbox base URL (for example `http://127.0.0.1:9000`). **`LISTEN_ADDR`** in the same file describes the listen address and should align with that URL.
2. **Check** whether the sandbox is actually running — for example try an HTTP request to `CLAY_SANDBOX_URL` with `curl` (connection refused, timeouts, or clear “not listening” errors mean it is not running).
3. **Only when** the sandbox is **not** running, start it:

```bash
./clay-sandbox serve
```

If the check shows the sandbox is already up, fix the underlying issue instead of starting a second `serve` process.

## License

MIT
