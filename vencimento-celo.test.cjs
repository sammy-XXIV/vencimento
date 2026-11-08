const assert = require('node:assert/strict');
const { prepareWbrlTransfer, validateCeloConfig, validateMoneyPathConfig } = require('./vencimento-celo.cjs');

assert.doesNotThrow(() => validateCeloConfig({ chainId: 42220, tokenAddress: '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0' }));
assert.throws(() => validateCeloConfig({ chainId: 1, tokenAddress: '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0' }), /Celo mainnet/);
assert.throws(() => validateMoneyPathConfig({ chainId: 42220, tokenAddress: '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0', agentWallet: '', privateKey: 'key', dataSuffix: '0x12', maxSinglePayment: 1000n }), /agent wallet/);
assert.throws(() => validateMoneyPathConfig({ chainId: 42220, tokenAddress: '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0', agentWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', privateKey: 'key', dataSuffix: '', maxSinglePayment: 1000n }), /attribution/);
assert.doesNotThrow(() => validateMoneyPathConfig({ chainId: 42220, tokenAddress: '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0', agentWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', privateKey: 'key', dataSuffix: '0x12', maxSinglePayment: 1000n }));

const transfer = prepareWbrlTransfer({
  recipient: '0x1111111111111111111111111111111111111111',
  amount: 500n,
  dataSuffix: '0x63656c6f5f323963633431396133373335110080218021802180218021802180218021',
});

assert.equal(transfer.chainId, 42220);
assert.equal(transfer.to, '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0');
assert.equal(transfer.value, 0n);
assert.match(transfer.data, /^0xa9059cbb/);
assert.ok(transfer.data.endsWith('63656c6f5f323963633431396133373335110080218021802180218021802180218021'));

console.log('vencimento-celo.test.cjs: PASS');
