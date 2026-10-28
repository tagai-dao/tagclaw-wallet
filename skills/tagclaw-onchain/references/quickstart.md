# First use and conversation flow

This is the registration-free **TagClaw-For-AgentWallet** skill for agents using an external wallet, including Binance Agentic Wallet. TagClaw provides no wallet. TagAI helpers return unsigned plans, while the calling agent's wallet integration previews, obtains authorization and signs. Use the user's language and complete the requested flow without making them manage JSON files or ask repeatedly for status. If no signing wallet is available, finish by returning the unsigned transaction structure and its pending execution status.

## Installation and example requests

Install the complete `tagclaw-onchain` directory and its locked dependencies as described in [SKILL.md](../SKILL.md). Installing only the Markdown file omits the helpers. Before a selected flow, check that its linked reference and executable helper files exist; if missing, recover the full package instead of improvising contract calls. Load references at the step that needs them, rather than loading every playbook at startup.

Users can say:

- “What can TagAI do with my Binance wallet? Show the available functions; do not trade.”
- “Find the full contract address for this tick and tell me its price and whether it is internal or external.”
- “Issue a token called MYCOIN. Guide me through the remaining choices; skip the initial purchase.”
- “Buy 0.01 BNB of this TagAI token. Show the quote before executing.”
- “Quote a sale of half my token balance. Do not execute yet.”
- “Look up this person's IPShare market and quote a 0.01 BNB purchase.”
- “Show this community's Nutbox pools, my positions and claimable rewards.”

For a percentage sale, read the selected address's fresh balance and calculate the raw amount with integer arithmetic, rounding down. Report the reference balance/block and calculated quantity; preparation rechecks available funds at its own fixed snapshot. Do not use a float, a cached portfolio value, or change a quote-only request into execution. If the helper input expects an exact `amount`, convert the user's percentage intent to that amount; do not invent a `sellPercent` helper field.

## 1. Understand the goal and collect missing decisions

Reuse the current conversation's answers. Ask only for missing decisions, grouped in one message; do not ask separately for values already given. A bare address usually needs the requested action and amount, while a discovery request needs no trade questionnaire.

For token issuance, follow [the parameter guide](creation.md). The user's constituent assets/weights, fee choices, ownership and initial buy are economic decisions; collect or explicitly propose them. Optional description, tags and social links may remain empty if not requested; disclose that in the final configuration instead of making each optional field a separate question. A positive initial-buy amount already answers whether to buy. Never silently substitute zero, change the amount or choose assets from the logo.

| Requested work | Needed before proceeding |
|---|---|
| Capability description, public search or price | Complete skill/helper installation and relevant public API/RPC access; no wallet login or Developer Mode |
| Personal balance/position query | A full public wallet address; it need not be connected just to read |
| Prepare a wallet transaction | The intended public BSC sender address, action/amount and protocol-specific parameters; no connected wallet is required |
| Execute a wallet transaction | Connected wallet, current Developer Mode/limits, successful wallet preview and authorization for that exact transaction |

Resolve tick/address and market before preparing. Preserve the actual historical version for existing tokens; the creation helper selects the supported implementation automatically. For creation, run the chain readiness check before uploading assets or spending funds. The agent must report missing protocol permissions, not attempt operator activation.

Report the user-facing capability as token issuance, without turning internal version numbers into a requirement. A failed creation-readiness check applies to the protocol's factory, not the selected wallet: explain platform activation is pending and do not ask the user to obtain Nutbox/Basket roles or wallet whitelisting. Read the [readiness interpretation](creation.md#interpret-protocol-readiness-correctly). Draft parameters and public queries may continue while deployment is blocked.

Use `wallet-payload` to export the [transaction handoff structure](transactions.md). The agent's external wallet performs execution; wallet ownership, connection and selected chain must be verified before signing, not assumed from a supplied public address.

## 2. Prepare and present one combined confirmation

For a TagClaw token buy/sell with a public reason, follow [trade notes](trade-notes.md) after approvals and before the wallet preview. Include the exact normalized text and optional `conf` in that preview. Save the prepared note alongside the plan; the nonce stays private at the backend. After a successful receipt, report only the transaction hash and track publication separately from chain success. No new account or API key is involved.

Once required decisions are complete, prepare the plan and obtain the wallet preview. The user does not need to approve the same parameters once before preparation and again after preview. Combine the plan's intent/quote and wallet security result into **one final confirmation for that concrete transaction**.

Use a compact summary in the user's language, populated from actual results:

```text
Action and route: <issue token / curve buy / V4 sell / IPShare / pool action>
Network and wallet: BSC 56; <full sender address>
Token / subject / pool: <full addresses and resolved identifiers>
Payment or approval: <asset, full address, human amount and exact raw amount>
Expected and minimum received: <quote values, units and slippage; or not applicable>
Fees and gas: <protocol fees; actual wallet estimate; separately label unknown values>
Recipients and authority changes: <beneficiaries, spender/allowance, ownership effects>
Wallet preview: <parsed operation, simulation, risks and required App confirmation>
Quote / preview expiry: <actual expiry>
Proceed with this transaction?
```

For creation, include the selected index configuration, fees, initial buy, predicted address and any automatic IPShare/pool creation. For an approval, explicitly say it only authorizes a spender and has not performed the buy/deposit. Follow any authorization already supplied in the conversation and the official wallet's requirements; do not add redundant questions or interpret an authorization for one amount/route as authorization for a different transaction.

Dependent approval/reset/Permit2 and swap transactions each get their own current preview and authorization. A “single confirmation” is per transaction, not permission to sign unseen follow-up transactions. Rebuild after each successful dependent receipt. Preserve defaults and the original amount on refresh; disclose any changed terms before the replacement is authorized.

Do not copy another platform's fee/slippage/defaults into TagAI. This helper currently defaults token/IPShare slippage to 200 bps; report the actual quote's bound. Gas is wallet-estimated. The custom-contract path does not prove MEV protection; do not advertise protection or invent flags. Do not automatically raise slippage, increase gas, change wallet-wide token permissions or relax risk handling after a failure.

## 3. Submit once and follow the result

Persist non-secret workflow state locally: original intent and parameters, wallet/chain, plan, creation salt/predicted token where applicable, quote/preview expiry, wallet request/order ID, accepted transaction hash, receipt and metadata publication result. Do not store wallet sessions or private keys in this record.

Resume according to observed state:

| Observed state | Next action |
|---|---|
| Prepared or previewed, no accepted order/hash | Refresh if stale; obtain the required authorization before execution |
| App confirmation pending | Tell the user promptly; preserve the order and track it without another execute |
| Broadcast hash known | Resume receipt tracking; never sign/broadcast the same intent again merely because the conversation was interrupted |
| Receipt status 1 | Report the on-chain result and hash, then finish any dependent protocol/metadata step |
| Receipt status 0 | Report the revert; retain the hash and obtain a fresh reviewed plan before another transaction |
| No known result after a timeout | Reconcile wallet history/lock and any saved order/hash; do not blindly resend |
| On-chain creation confirmed but API/site not updated | Report publication/indexing as pending; retry metadata with the same create hash |

After execution, follow the order/hash to a terminal result within the active flow. If user input or an external blocker is needed, state the exact pending step and the saved identifier. Do not create scheduled monitoring unless the user asks for it.

If wallet preview returns a generic simulation error, retain the exact error. An independent **single** read-only simulation of the same full transaction from the real sender can provide diagnostic evidence; it never authorizes a broadcast or replaces wallet preview. Keep all batched protocol/configuration reads in fixed-block Multicall. Report what each simulator actually returned without guessing the cause or assuming a fixed wallet gas ceiling. A blocked or failed wallet preview remains a stop for execution.
