const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApi } = require('./vencimento-api.cjs');

(async () => {
  const api = createApi();

  const config = await api.request('POST', '/api/config', { shopName: 'Test shop', balance: '1000', reserve: '300', dailySpendCap: '3000', wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal(config.status, 201);

  const supplier = await api.request('POST', '/api/suppliers', {
    id: 'dist-sul',
    name: 'Distribuidora Sul',
    wallet: '0x1111111111111111111111111111111111111111',
    priority: 1,
  });
  assert.equal(supplier.status, 201);

  const bill = await api.request('POST', '/api/bills', {
    id: 'bill-1', supplierId: 'dist-sul', amount: '500', dueDate: '2026-11-05', graceDays: 0,
  });
  assert.equal(bill.status, 201);

  const plan = await api.request('POST', '/api/plan', {});
  assert.equal(plan.status, 200);
  assert.deepEqual(plan.body.payments.map((item) => item.id), ['bill-1']);

  const review = await api.request('GET', '/api/payment-batches/review');
  assert.equal(review.status, 200);
  assert.equal(review.body.transfers[0].supplierWallet, '0x1111111111111111111111111111111111111111');
  assert.equal(review.body.transfers[0].amount, '500');
  assert.equal(review.body.transfers[0].remainingBalance, '500');
  assert.equal(review.body.status, 'ready-for-owner-approval');
  assert.ok(review.body.reviewToken);

  const badToken = await api.request('POST', '/api/payment-batches/approve', { billIds: ['bill-1'], reviewToken: 'wrong-token' });
  assert.equal(badToken.status, 403);

  const batch = await api.request('POST', '/api/payment-batches/approve', { billIds: ['bill-1'], reviewToken: review.body.reviewToken });
  assert.equal(batch.status, 202);
  assert.equal(batch.body.status, 'awaiting-chain-review');
  assert.equal(batch.body.transfers[0].transfer.chainId, 42220);

  const submit = await api.request('POST', '/api/payment-batches/submit', { billIds: ['bill-1'], reviewToken: review.body.reviewToken });
  assert.equal(submit.status, 403);

  const duplicateReview = await api.request('GET', '/api/payment-batches/review');
  const duplicate = await api.request('POST', '/api/payment-batches/approve', { billIds: ['bill-1'], reviewToken: duplicateReview.body.reviewToken });
  assert.equal(duplicate.status, 409);

  const unknown = await api.request('POST', '/api/bills', {
    id: 'bill-2', supplierId: 'unknown', amount: '50', dueDate: '2026-11-06', graceDays: 0,
  });
  assert.equal(unknown.status, 422);

  const dataFile = path.join(os.tmpdir(), `vencimento-${process.pid}-${Date.now()}.json`);
  const persistentApi = createApi({ dataFile });
  assert.equal((await persistentApi.request('POST', '/api/config', { shopName: 'Persistent shop', balance: '900', reserve: '200', dailySpendCap: '900', wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).status, 201);
  assert.equal((await persistentApi.request('POST', '/api/suppliers', { id: 'persist-supplier', name: 'Persistent supplier', wallet: '0x2222222222222222222222222222222222222222', priority: 1 })).status, 201);
  const reloadedApi = createApi({ dataFile });
  const reloaded = await reloadedApi.request('GET', '/api/state');
  assert.equal(reloaded.body.shop.name, 'Persistent shop');
  assert.equal(reloaded.body.suppliers[0].name, 'Persistent supplier');
  fs.rmSync(dataFile, { force: true });

  console.log('vencimento-api.test.cjs: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
