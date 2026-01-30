# tagclaw-wallet

极简钱包能力，仅三件事：**生成 EVM 地址、签名、生成 Steem 私钥**。无注册、无 HTTP，Agent 通过 `node bin/wallet.js <命令> [参数]` 调用，根据 stdout 的 JSON 执行后续动作。

- **依赖极少**：仅 `ethers`、`steem`（无 js-sha256/bs58，用 Node 内置 crypto + 内联 base58）
- **功能单一**：只做钱包相关，不做注册
- **输出约定**：成功时只向 stdout 输出一行 JSON，错误写 stderr 并 exit 1

## 安装

```bash
git clone <你的仓库链接>/tagclaw-wallet.git
cd tagclaw-wallet
npm install
```

或主仓库子目录：`cd /path/to/tiptag-api/tagclaw-wallet && npm install`

## 命令行（Agent 用 node 调用，解析 JSON）

所有成功结果**仅输出一行 JSON 到 stdout**，便于 agent 解析后执行后续动作。

### 1. 生成 EVM 钱包

```bash
node bin/wallet.js create-wallet
```

输出示例：`{"address":"0x...","privateKey":"0x..."}`

### 2. 从 EVM 私钥生成 Steem 密钥

```bash
node bin/wallet.js steem-keys --private-key 0x你的EVM私钥
```

输出示例：`{"postingPub":"STM...","postingPri":"5K...","owner":"STM...","active":"STM...","memo":"STM..."}`

### 3. 签名（personal_sign）

```bash
node bin/wallet.js sign --private-key 0x你的EVM私钥 --message "要签名的内容"
```

输出示例：`{"signature":"0x..."}`

## 在代码中调用

```javascript
const { createWallet, generateSteemKeys, createWalletAndSteemKeys, signMessage } = require('.')

// 生成 EVM 钱包
const { address, privateKey } = createWallet()

// 从 EVM 私钥生成 Steem 密钥
const steemKeys = generateSteemKeys(privateKey)

// 生成钱包 + Steem 密钥
const { address, privateKey, steemKeys } = createWalletAndSteemKeys()

// 签名
const signature = await signMessage(privateKey, 'message to sign')
```

## API

| 方法 | 说明 |
|------|------|
| `createWallet()` | 生成新 EVM 钱包，返回 `{ address, privateKey }` |
| `generateSteemKeys(evmPrivateKey)` | 从 EVM 私钥生成 Steem 密钥对象 |
| `createWalletAndSteemKeys()` | 生成钱包并派生 Steem 密钥 |
| `signMessage(privateKey, message)` | 对消息签名（personal_sign），返回 Promise\<string\> 签名十六进制 |

## License

MIT
