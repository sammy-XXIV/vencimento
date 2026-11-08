const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('./vencimento-api.cjs');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vencimento-workflow-'));
  const dataFile = path.join(dir, 'state.json');
  let sends = 0;
  const api = createApi({ dataFile, sendTransfer: async ({ amount, recipient }) => {
    sends++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { hash: '0x' + 'a'.repeat(64), amount, recipient };
  } });
  const post = (route, data) => api.request('POST', route, data);
  assert.equal((await api.request('GET', '/api/evidence')).body.payments.length, 3);
  await post('/api/config', { shopName: 'Test', wallet: '0x' + '1'.repeat(40), balance: '1000000000000000000', reserve: '500000000000000000', dailySpendCap: '100000000000000000' });
  await post('/api/suppliers', { id: 's', name: 'Supplier', wallet: '0x' + '2'.repeat(40) });
  for (const id of ['a', 'b']) await post('/api/bills', { id, supplierId: 's', amount: '100000000000000000', dueDate: '2026-11-08' });
  await post('/api/scheduler', { enabled: true });
  const preview = await post('/api/scheduler/run');
  assert.equal(sends, 0);
  assert.equal(preview.body.decisions.payments.length, 1);
  assert.equal(preview.body.decisions.delayed.length, 1);
  const review = await api.request('GET', '/api/payment-batches/review');
  await post('/api/payment-batches/approve', { billIds: ['a'], reviewToken: review.body.reviewToken });
  const concurrent = await Promise.all([post('/api/payment-batches/submit', { billIds: ['a'] }), post('/api/payment-batches/submit', { billIds: ['a'] })]);
  assert.equal(sends, 1);
  assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
  assert.equal((await post('/api/payment-batches/submit', { billIds: ['a'] })).status, 409);
  const restored = createApi({ dataFile });
  assert.equal(restored.state.history.length, 1);
  assert.equal(restored.state.scheduler.enabled, true);
  const plan = await restored.request('POST', '/api/plan');
  assert.equal(plan.body.payments.length, 0);
  assert.equal(plan.body.delayed.length, 1);
  console.log('workflow: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
