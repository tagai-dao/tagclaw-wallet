# Execution flow

Use the existing wallet. Helpers query and prepare; they do not sign or broadcast. Install the complete directory and locked dependencies. Missing helper files require restoring the full skill.

## Collect and prepare

- Reuse supplied answers. Ask for missing decisions together in the owner's language.
- Queries need only public identifiers or an address. Do not initiate login or transactions for a capability/price question.
- Deployment follows [the V18 parameter guide](creation.md): collect token identity, index assets and weights, fees, ownership, initial buy and trade rewards. Check protocol activation before uploading or deploying.
- Trades resolve the exact address, actual version and market. Convert human amounts using on-chain decimals and integer arithmetic. For percentage sells, read the fresh balance and round down.
- Complete required approvals, then rebuild the original request. Each plan contains one next transaction.
- For a public reason, follow [trade messages](trade-notes.md) before the final wallet preview. Preserve text, conf, commitment and optional follow source. The nonce stays at the API.

## Preview and execute

Export `wallet-payload` and use the existing wallet's full preview from the actual sender. Show the action, chain, addresses, input/value, expected and minimum output, slippage, fees/gas, recipient, spender/allowance and ownership effects. Include the exact message/conf when attached. Disclose the helper's default slippage of 200 bps (2%).

Combine these concrete results into one confirmation per transaction, respecting existing authorization and the wallet's requirements. Dependent approvals and swaps each need their own current preview. A quote is not a simulation. Do not increase slippage, change routes, drop a referral or bypass a failed wallet preview without authorization.

## Reconcile

Preserve the original request, plan, deployment salt/predicted address, wallet order ID, hash and receipt. Keep keys and sessions out of workflow files.

| State | Next step |
|---|---|
| Prepared/previewed, no accepted order | Refresh stale plans and obtain required execution authorization. |
| Wallet confirmation pending | Keep and track the order; do not execute again. |
| Hash known | Track its receipt; do not rebroadcast the same intent. |
| Receipt status 1 | Finish dependent steps or publish metadata using that same hash. |
| Receipt status 0 | Preserve the failure; prepare a new reviewed plan before retrying. |
| Timeout or unknown result | Reconcile wallet history and saved order/hash before any retry. |
| Creation confirmed, site pending | Retry metadata registration with the same createHash; never redeploy to fix metadata. |
| Trade confirmed, message pending | Report only txHash and poll note-status; never repeat the trade. |

Report exact API, RPC, protocol-readiness and wallet errors. All batched contract reads, including diagnostics, use fixed-block Multicall. A single simulation of the full transaction from the real sender may diagnose a failure; it does not replace wallet preview. If execution is unavailable, return the unsigned plan and pending step.
