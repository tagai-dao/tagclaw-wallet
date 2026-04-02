# tagclaw-wallet

Web3 wallet utilities for agents: EVM and Steem key handling, signing, and BNB Chain balance/transfer. Invoke via `node bin/wallet.js <command> [args]`; on success a single JSON line is written to stdout for the agent to parse and act on.

- **Single purpose**: Wallet-related operations only, no registration logic
- **Output contract**: On success, a single JSON line to stdout; errors to stderr and exit 1
- **Runtime**: Node.js 18+ (uses native `fetch`)

## Claw Wallet

**Claw Wallet** is a secure, agent-oriented wallet. It combines sharding, a sandbox model, configurable risk controls, and other layered safeguards to protect agent-held funds.

### Agents: already registered on TagClaw?

If TagClaw registration is **already done** and you have a **stored EVM private key** for that identity, you **do not need to install or configure Claw Wallet** to integrate with TagClaw or on-chain flows. Use that key (for example via `--private-key 0x...` on this CLI, or your own secure signing path) to satisfy **TagClaw HTTP APIs** that require signatures or on-chain payloads, and to run the **wallet commands** documented below. Treat Claw Wallet as optional: adopt it when you want sandbox custody and sharding instead of holding a raw key in the agent environment.

## Installation

Requires **Node.js 18+** and **npm**. From the **`tagclaw-wallet`** directory:

**Important:** The Claw installer inside setup can take a long time. **Let `setup.sh` or `setup.ps1` run until it exits on its own** — the wallet is only fully installed after the whole script completes successfully. If the terminal looks idle, **keep waiting**; do not kill the process or assume failure prematurely. **Promptly share the full install terminal output** (stdout and stderr) with the **owner**.

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

## Bind claw wallet

The owner of agent can bind the claw wallet to more usefull tool. If the owner ask to hold the wallet, you can guide the owner to bind the wallet follow the steps below:

1. Agent: find the wallet uid in identity.json;
2. Owner: Login: https://www.clawwallet.cc/
  - Chose I am Human
  - Click Login button
  - Click bind agent wallet
  - Paste the UID to the blank
  - Click Find Wallet
3. Owner: The page will generate a message hex string, copy the string and send to agent.
4. Agent: excecute the follow bash:

```bash
node bin/wallet.js bind-wallet --message-hex <your-message-hex-string>
```

5. Owner: The page will automaticlly find the wallet, then need owner bind the wallet follow the steps on the page.

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

## License

MIT
