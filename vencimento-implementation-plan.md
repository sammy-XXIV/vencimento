# Vencimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a focused dashboard that plans and executes owner-approved wBRL supplier payments for a small Brazilian shop on Celo mainnet.

**Architecture:** A TypeScript Next.js app contains the dashboard and API routes. A deterministic planning engine converts bills, inflows, balance, reserve, and owner priorities into an explainable payment plan. A Celo adapter validates and sends approved wBRL transfers with idempotency and receipt storage; wallet signing is isolated behind an environment-configured signer.

**Tech Stack:** Next.js, TypeScript, Vitest, Zod, viem, SQLite via Prisma, and Playwright for the browser smoke test.

**Spec:** `C:/Users/Dell/vencimento-design.md`

## Global Constraints

- Celo mainnet only for real payments; test fixtures may use mocked chain calls.
- wBRL token: `0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0`.
- Supplier addresses must be whitelisted.
- No automatic payment without explicit owner approval.
- No OCR, bank synchronization, automatic fiat conversion, or checkout in the MVP.
- Recheck chain, token, recipient, amount, and balance immediately before signing.
- Never blindly retry a payment whose final status is uncertain.

## Review Focus

- A bill with an unknown supplier address must be blocked and tested in the payment service task.
- A batch that would breach the reserve or budget must be rejected and tested in the planning task.
- Duplicate approval or retry must not create a second payment and must be tested in the payment service task.
- A failed or pending transaction must become a visible reconciliation state and must be tested in the receipt task.
- A wrong chain or token configuration must fail closed and be tested in the Celo adapter task.

---

### Task 1: Application scaffold and domain model

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `src/app/page.tsx`
- Create: `src/app/api/health/route.ts`
- Create: `src/domain/types.ts`
- Create: `src/lib/db.ts`
- Create: `prisma/schema.prisma`
- Test: `src/domain/types.test.ts`

**Interfaces:**
- Produces domain types `Bill`, `ExpectedInflow`, `Supplier`, `ShopPolicy`, `PaymentPlan`, and `PaymentReceipt`.
- Produces database tables `shops`, `suppliers`, `bills`, `expected_inflows`, `payment_batches`, and `payment_receipts`.

- [ ] Write tests that validate required fields, non-negative monetary amounts, ISO dates, and Celo address shape.
- [ ] Run `npm test -- --run src/domain/types.test.ts` and verify the tests fail before implementation.
- [ ] Initialize the Next.js TypeScript project and install the exact dependencies listed in the Tech Stack.
- [ ] Implement Zod schemas and exported TypeScript types for the domain objects.
- [ ] Implement Prisma schema with decimal amounts stored as strings/decimal values and unique constraints on supplier addresses and bill IDs.
- [ ] Add a minimal dashboard shell showing wallet balance, upcoming bills, expected inflows, and an empty-plan state.
- [ ] Add `/api/health` returning `{ "ok": true }`.
- [ ] Run the typecheck, unit tests, and Next.js build.

### Task 2: Deterministic cash-flow planner

**Files:**
- Create: `src/domain/planner.ts`
- Test: `src/domain/planner.test.ts`
- Modify: `src/domain/types.ts`

**Interfaces:**
- Consumes `PlannerInput { balance: bigint; reserve: bigint; bills: Bill[]; inflows: ExpectedInflow[]; asOf: string; policy: ShopPolicy }`.
- Produces `PaymentPlan { payments: PlannedPayment[]; delayed: DelayedPayment[]; available: bigint; explanation: string[] }`.

- [ ] Write tests for paying due bills while preserving the reserve, owner priority ordering, grace-period ordering, expected inflows, insufficient balance, and deterministic tie-breaking.
- [ ] Run `npm test -- --run src/domain/planner.test.ts` and verify failure.
- [ ] Implement integer minor-unit arithmetic only; never use floating-point values for wBRL amounts.
- [ ] Implement the policy: reserve the configured buffer, prioritize overdue/soon-due bills, then owner priority, then due date, then bill ID.
- [ ] Mark bills as `pay`, `schedule`, or `delay` and include a human-readable reason for every decision.
- [ ] Add tests proving plans never exceed available balance and never include an unapproved supplier.
- [ ] Run planner tests and typecheck.

### Task 3: Celo wBRL payment adapter and receipts

**Files:**
- Create: `src/chain/celo.ts`
- Create: `src/services/payment-service.ts`
- Create: `src/app/api/payments/approve/route.ts`
- Create: `src/app/api/payments/[batchId]/route.ts`
- Test: `src/chain/celo.test.ts`
- Test: `src/services/payment-service.test.ts`

**Interfaces:**
- `validatePaymentConfig(): void` fails unless chain ID is `42220` and token address matches the configured wBRL address.
- `sendWbrlTransfer(input: { recipient: \\`0x${string}\\`; amount: bigint; idempotencyKey: string }): Promise<{ txHash: \\`0x${string}\\`; status: "submitted" }>`.
- `approvePaymentBatch(batchId: string): Promise<PaymentReceipt[]>`.

- [ ] Write adapter tests for wrong chain, wrong token, invalid recipient, insufficient balance, and successful mocked transfer.
- [ ] Write service tests proving unknown suppliers are blocked, duplicate idempotency keys are reused, and uncertain transactions are not retried.
- [ ] Implement viem public-client checks for chain ID, token code/configuration, balance, and recipient address.
- [ ] Implement a wallet-client signer behind an environment variable; do not expose private keys to the UI or LLM.
- [ ] Require a persisted approval record before sending any transfer.
- [ ] Persist submitted/pending/confirmed/failed receipt states and transaction hashes.
- [ ] Add attribution-tag injection at the transaction calldata construction boundary before the first mainnet transaction.
- [ ] Run all chain and payment-service tests with mocked RPC calls.

### Task 4: Owner dashboard, scheduler, and demo path

**Files:**
- Create: `src/app/api/bills/route.ts`
- Create: `src/app/api/inflows/route.ts`
- Create: `src/app/api/suppliers/route.ts`
- Create: `src/app/api/plans/route.ts`
- Create: `src/app/api/receipts/route.ts`
- Create: `src/components/BillForm.tsx`
- Create: `src/components/PaymentPlan.tsx`
- Create: `src/components/ReceiptList.tsx`
- Create: `src/lib/scheduler.ts`
- Test: `src/app/api/plans/route.test.ts`
- Test: `tests/demo.spec.ts`

**Interfaces:**
- API routes accept and return Zod-validated JSON using the domain types from Task 1.
- `buildCurrentPlan(shopId: string, asOf: string): Promise<PaymentPlan>` reads persisted shop state and calls the planner.

- [ ] Write API tests for creating bills, suppliers, and inflows; rejecting malformed input; and returning a plan with explanations.
- [ ] Implement forms for bills, expected inflows, suppliers, reserve, and priority values.
- [ ] Implement the plan view with pay/delay status, reason, amount, due date, and supplier.
- [ ] Implement an explicit approval button that submits the batch to the payment-service route.
- [ ] Implement receipt display with token, amount, recipient, timestamp, status, and Celo explorer link.
- [ ] Implement a scheduler entry point that evaluates due bills without signing or paying until an owner approval exists.
- [ ] Add a seeded demo dataset matching the spec: 1,000 wBRL balance, 300 wBRL reserve, three bills, and one expected 500 wBRL inflow.
- [ ] Run Playwright through the demo: create the plan, verify the distributor and packaging bills are selected, verify utilities is delayed with a reason, approve a mocked batch, and verify receipts appear.
- [ ] Run full test suite, typecheck, lint, and production build.

### Task 5: Mainnet readiness and submission evidence

**Files:**
- Create: `.env.example`
- Create: `README.md`
- Create: `docs/demo-runbook.md`
- Modify: `src/chain/celo.ts`
- Modify: `src/app/page.tsx`

- [ ] Document the Celo mainnet chain ID, wBRL address, wallet setup, attribution tag, and ERC-8004 identity requirement.
- [ ] Document that suppliers must be whitelisted and that the demo never enters private keys into the app.
- [ ] Add a mainnet safety checklist requiring a tiny test amount, verified recipient, verified token address, and owner approval.
- [ ] Add a dashboard panel showing paid-call/payment evidence and transaction hashes for the submission.
- [ ] Run the full local test suite against mocks before any mainnet transaction.
- [ ] Perform one owner-approved, low-value mainnet transfer only after the wallet, attribution, ERC-8004 identity, recipient, and token checks are verified.
- [ ] Record the transaction hash and include it in the demo runbook.
