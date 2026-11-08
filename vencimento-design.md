# Vencimento Design

## Status

Draft for review.

## Product

Vencimento is a cash-flow agent for small Brazilian shops. It pays supplier bills in wBRL on Celo before their due dates, and uses owner-defined priorities to decide what to pay or delay when available cash is insufficient.

## User and problem

The initial user is a small Brazilian shop owner who receives customer payments unevenly and manages supplier bills with different due dates. Missing a key supplier payment can interrupt inventory, while paying every bill immediately can exhaust operating cash.

## MVP scope

- One shop owner and one wBRL wallet.
- Bills entered through a simple form or CSV; no OCR in the first version.
- Expected inflows entered manually with amount and expected date.
- Three to five supplier bills per run.
- Whitelisted supplier wallet addresses only.
- Owner-defined priority rules, such as distributor first, utilities second, and grace-period bills last.
- Scheduled evaluation and payment execution on Celo mainnet.
- Owner approval required before each payment batch.
- Supplier receipt containing amount, token, chain, transaction hash, and timestamp.
- Ripio ramp links for wallet funding and cash-out.

## Core flow

1. Owner connects or configures a shop wallet and adds whitelisted suppliers.
2. Owner records bills: supplier, wBRL amount, due date, grace period, and priority.
3. Owner records expected customer inflows.
4. Scheduler evaluates the wallet balance, upcoming bills, inflows, and reserve threshold.
5. The decision engine produces a payment plan: pay now, schedule, or delay.
6. Dashboard explains each decision and requests owner approval.
7. Approved payments are sent as wBRL transfers on Celo mainnet.
8. Receipts are generated and shown to the owner and supplier.

## Decision policy

The initial policy is deterministic and explainable:

- Reserve a configurable operating-cash buffer.
- Pay bills that would become overdue before the next expected inflow.
- Among competing bills, sort by owner priority, due date, and grace-period expiry.
- Never exceed the approved batch budget.
- Do not pay an unknown supplier or an address that changed without owner confirmation.

The LLM, if used, may translate owner language into structured rules and explain the plan, but it must not independently decide or sign payments.

## Celo integration

- Network: Celo mainnet.
- Token: wBRL at `0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0`.
- Transfers must carry the event attribution tag before the first transaction.
- Register the agent wallet with ERC-8004 before submission.
- Use a transaction simulator or balance/allowance checks before signing.
- Keep the wallet key outside the application and require explicit owner approval for payment batches.

## Dashboard

- Current wBRL balance and reserve buffer.
- Bills due soon and their priority.
- Expected inflows.
- Proposed payment plan with reasons.
- Approve, reject, or edit batch.
- Payment history and transaction receipts.

## Safety and failure handling

- No automatic payment without owner approval in the MVP.
- Whitelist supplier addresses and require reapproval on changes.
- Idempotency key per bill prevents duplicate payment.
- Recheck balance, recipient, amount, and chain immediately before signing.
- If a transaction fails or status is uncertain, stop and show a reconciliation state; never blindly retry.
- Display all decisions and assumptions in the dashboard.

## Demo scenario

The shop has 1,000 wBRL, a 300 wBRL reserve, and three bills: a key distributor due tomorrow, utilities due in three days with a five-day grace period, and packaging due today. An expected 500 wBRL customer payment arrives in four days. Vencimento pays the distributor and packaging now, delays utilities within its grace period, explains the choice, and produces Celo receipts.

## Success criteria

- Correctly produces a deterministic plan for a seeded set of cash-flow scenarios.
- Executes at least one real wBRL mainnet payment to a whitelisted recipient.
- Prevents duplicate, over-budget, wrong-token, and wrong-chain payments.
- Provides a verifiable receipt for every successful payment.
- Owner can understand why each bill was paid or delayed.

## Explicitly out of scope

- OCR and arbitrary invoice ingestion.
- Bank-account synchronization.
- Automatic fiat conversion.
- Unapproved autonomous payments.
- Supplier onboarding or merchant acceptance infrastructure.
- Multi-country and multi-token support.

## Verified integration decisions

- Supplier payments use direct ERC-20 `transfer` calls for wBRL on Celo, not x402. The wBRL token is live on Celo at `0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0` with 18 decimals and visible transfers on Celo explorers.
- Ripio documents Brazil ramps with PIX support and wBRL availability. The production Ramps API requires a Ripio account, customer setup, terms acceptance, KYC, and a Brazilian investor profile; the hackathon demo therefore treats funding as a Ripio ramp link or manual wallet funding rather than implementing the full regulated onboarding flow.
- The MVP will not claim that every supplier accepts wBRL. It pays only whitelisted supplier wallets and shows the payment receipt; supplier fiat cash-out is a future integration.
