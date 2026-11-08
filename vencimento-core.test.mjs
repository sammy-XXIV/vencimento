import assert from 'node:assert/strict';
import { buildPaymentPlan } from './vencimento-core.mjs';

const plan = buildPaymentPlan({
  balance: 1000n,
  reserve: 300n,
  asOf: '2026-11-04',
  bills: [
    { id: 'distributor', supplier: 'Key distributor', amount: 500n, dueDate: '2026-11-05', priority: 1, graceDays: 0 },
    { id: 'utilities', supplier: 'Utilities', amount: 300n, dueDate: '2026-11-07', priority: 3, graceDays: 5 },
    { id: 'packaging', supplier: 'Packaging', amount: 200n, dueDate: '2026-11-04', priority: 2, graceDays: 0 },
  ],
  inflows: [{ amount: 500n, expectedDate: '2026-11-08' }],
});

assert.deepEqual(plan.payments.map((bill) => bill.id), ['distributor', 'packaging']);
assert.deepEqual(plan.delayed.map((bill) => bill.id), ['utilities']);
assert.equal(plan.remainingBalance, 300n);
assert.match(plan.delayed[0].reason, /reserve|priority|inflow/i);

console.log('vencimento-core.test.mjs: PASS');

const cappedPlan = buildPaymentPlan({
  balance: 1000n,
  reserve: 300n,
  dailySpendCap: 300n,
  asOf: '2026-11-04',
  bills: [
    { id: 'large-bill', supplier: 'Distributor', amount: 500n, dueDate: '2026-11-04', priority: 1, graceDays: 0 },
  ],
});

assert.deepEqual(cappedPlan.payments, []);
assert.match(cappedPlan.delayed[0].reason, /daily cap/i);
