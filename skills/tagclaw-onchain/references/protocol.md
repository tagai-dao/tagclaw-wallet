# Supported protocol and read semantics

Run `node scripts/tagclaw.mjs deployments` to get the machine-readable address set bundled with this skill. Address changes must be checked against the project's maintained ABI/deployments, not selected by a token symbol or untrusted API response.

| BSC contract | Address |
|---|---|
| Pump15 | `0x97f35B4631F4FFBF8050B17fAd6579D6F60A289D` |
| Token15 implementation | `0x8851D281f76951d41C9ff5c820D2D387f820f073` |
| HandleRegistry | `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` |
| Basket V4 Hook | `0x76983475f199C58d7BbA975220593c1c8B25f75e` |
| Basket V4 Router | `0x538e4B82D4A9E671B9358E1BAc3F7b74Bd663544` |
| Pump14 | `0xcd4e721Fc418f4D723C04c71e8d8EcCb75C3CD34` |
| Token14 implementation (Token13 ABI) | `0xcC8f585593feAb2a27f9e699a6b578d46446c88C` |
| PCS CLPoolManager | `0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b` |
| PCS CLQuoter | `0xd0737C9762912dD34c3271197E362Aa736Df0926` |
| PCS Universal Router | `0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB` |
| Permit2 | `0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768` |
| IPShare | `0x95450AaD4Cc195e03BB4791B7f6f04aC6D9BA922` |
| Optional Trade Curation factory | `0x774A48Ba391a1013Ae43289eBdf871618822CD67` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

Nutbox factory mapping is in `scripts/lib/deployment.mjs`. Shared ABI modules are bundled from `tagclaw-wallet/src/abi/`; v15/index fragments are checked against current protocol artifacts. Tests cover version selection, handle checks, index limits and pool bindings. The helper does not advertise unsupported versions or newer pool factories as working.

## Multicall snapshot

The helper verifies RPC chain ID 56, captures a latest block and checks that Multicall3 has code at that block. Every contract-read batch uses:

```solidity
aggregate3((address target, bool allowFailure, bytes callData)[] calls)
  returns ((bool success, bytes returnData)[])
```

An on-chain `getBlockNumber()` anchor is included in every chunk. Return order is preserved; any required failed/empty/undecodable result rejects the overall action. All dependent phases, chunks and retries use the original `blockTag`. A node gas/response limit is handled by smaller Multicalls at that same block. There is no independent-eth_call or JSON-RPC-batch fallback. Even CLQuoter quotes are executed within Multicall; caller-sensitive payable wallet simulations are left explicitly to the signing wallet's preview, not silently changed to a different caller.

If the node cannot serve the fixed snapshot, Multicall is missing or the protocol rejects caller semantics, report the failure and use a compatible node/deployment or protocol-specific quote mechanism. Do not silently loosen this rule. A new preparation after an approval creates a new snapshot; do not mix data from the prior snapshot into the new plan.

Block, code, transaction, receipt and log retrieval are not batched contract reads. The helper's unsigned plan needs a separate wallet simulation from the real sender before signing.

Primary Multicall references:

- [BSC deployment in the Multicall3 deployment list](https://github.com/mds1/multicall3/blob/main/deployments.json)
- [Multicall3 source and ABI semantics](https://github.com/mds1/multicall3/blob/main/src/Multicall3.sol)

This release is verified by offline contract-encoding and Multicall tests. Live acceptance of TagClaw transactions by Binance's risk engine requires the user's connected wallet and actual preview; no such acceptance is assumed.
