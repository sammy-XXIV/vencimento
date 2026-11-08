const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepareWbrlTransfer, sendWbrlTransfer } = require('./vencimento-celo.cjs');

const WALLET = /^0x[a-fA-F0-9]{40}$/;

function createApi({ dataFile = null, sendTransfer = sendWbrlTransfer } = {}) {
  const state = {
    shop: null,
    balance: null,
    reserve: null,
    dailySpendCap: null,
    suppliers: new Map(),
    bills: new Map(),
    inflows: [],
    approvedBills: new Set(),
    pendingReview: null,
    history: [],
    scheduler: { enabled: false, lastRun: null, decisions: null },
  };
  if (dataFile) loadState(state, dataFile);

  const persist = () => { if (dataFile) saveState(state, dataFile); };
  const buildPlan = async () => {
    if (!state.shop) throw new Error('Shop configuration is required before planning payments.');
    const { buildPaymentPlan } = await import('./vencimento-core.mjs');
    const bills = [...state.bills.values()].filter((bill) => bill.status === 'open').map((bill) => {
      const supplier = state.suppliers.get(bill.supplierId);
      return { id: bill.id, supplier: supplier.name, amount: bill.amount, dueDate: bill.dueDate, priority: supplier.priority, graceDays: bill.graceDays };
    });
    const today = new Date().toISOString().slice(0, 10);
    const spent = state.history.filter((item) => item.createdAt.startsWith(today)).reduce((sum, item) => sum + BigInt(item.amount), 0n);
    return buildPaymentPlan({ balance: state.balance, reserve: state.reserve, dailySpendCap: state.dailySpendCap > spent ? state.dailySpendCap - spent : 0n, bills, inflows: state.inflows });
  };

  return {
    state,
    async request(method, path, payload = {}) {
      if (method === 'GET' && path === '/api/health') return response(200, { ok: true });
      if (method === 'GET' && path === '/api/state') return response(200, serializeState(state));
      if (method === 'GET' && path === '/api/evidence') {
        return response(200, JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'payment-evidence.json'), 'utf8')));
      }
      if (method === 'POST' && path === '/api/scheduler') {
        state.scheduler.enabled = payload.enabled === true;
        persist();
        return response(200, state.scheduler);
      }
      if (method === 'POST' && path === '/api/scheduler/run') {
        try {
          const plan = await buildPlan();
          state.scheduler.lastRun = new Date().toISOString();
          state.scheduler.decisions = serialize({ ...plan, payments: plan.payments.map((bill) => ({ ...bill, reason: 'Eligible by supplier priority, cash reserve and daily cap; preview only.' })) });
          persist();
          return response(200, state.scheduler);
        } catch (error) { return response(409, { error: error.message }); }
      }

      if (method === 'POST' && path === '/api/config') {
        const balance = parseAmount(payload.balance);
        const reserve = parseAmount(payload.reserve);
        const dailySpendCap = parseAmount(payload.dailySpendCap);
        if (!payload.shopName || !WALLET.test(payload.wallet) || balance < 0n || reserve < 0n || dailySpendCap <= 0n || reserve > balance) {
          return response(422, { error: 'Shop name, wallet, valid balances, and a reserve within balance are required.' });
        }
        state.shop = { name: payload.shopName, wallet: payload.wallet };
        state.balance = balance;
        state.reserve = reserve;
        state.dailySpendCap = dailySpendCap;
        persist();
        return response(201, serializeState(state));
      }

      if (method === 'POST' && path === '/api/suppliers') {
        if (!payload.id || !payload.name || !WALLET.test(payload.wallet)) return response(422, { error: 'Supplier id, name, and a valid wallet are required.' });
        if (state.suppliers.has(payload.id)) return response(409, { error: 'Supplier already exists.' });
        const supplier = { id: payload.id, name: payload.name, wallet: payload.wallet, priority: Number(payload.priority ?? 5) };
        state.suppliers.set(supplier.id, supplier);
        persist();
        return response(201, supplier);
      }

      if (method === 'POST' && path === '/api/bills') {
        const amount = parseAmount(payload.amount);
        if (!payload.id || !state.suppliers.has(payload.supplierId) || amount <= 0n || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
          return response(422, { error: 'Bill needs a unique id, known supplier, positive amount, and YYYY-MM-DD due date.' });
        }
        if (state.bills.has(payload.id)) return response(409, { error: 'Bill already exists.' });
        const bill = { id: payload.id, supplierId: payload.supplierId, amount, dueDate: payload.dueDate, graceDays: Number(payload.graceDays ?? 0), status: 'open' };
        state.bills.set(bill.id, bill);
        persist();
        return response(201, serialize(bill));
      }

      if (method === 'POST' && path === '/api/inflows') {
        const amount = parseAmount(payload.amount);
        if (amount <= 0n || !/^\d{4}-\d{2}-\d{2}$/.test(payload.expectedDate)) return response(422, { error: 'Inflow needs a positive amount and YYYY-MM-DD expected date.' });
        const inflow = { amount, expectedDate: payload.expectedDate };
        state.inflows.push(inflow);
        persist();
        return response(201, serialize(inflow));
      }

      if (method === 'POST' && path === '/api/plan') {
        try { return response(200, serialize(await buildPlan())); }
        catch (error) { return response(409, { error: error.message }); }
      }

      if (method === 'GET' && path === '/api/payment-batches/review') {
        try {
          const plan = await buildPlan();
          const reviewToken = crypto.randomBytes(24).toString('hex');
          state.pendingReview = { reviewToken, billIds: plan.payments.map((payment) => payment.id), expiresAt: Date.now() + 10 * 60 * 1000 };
          let remainingBalance = state.balance;
          const transfers = plan.payments.map((payment) => {
            const bill = state.bills.get(payment.id);
            const supplier = state.suppliers.get(bill.supplierId);
            remainingBalance -= bill.amount;
            return { billId: bill.id, supplier: supplier.name, supplierWallet: supplier.wallet, amount: bill.amount, remainingBalance, transfer: prepareWbrlTransfer({ recipient: supplier.wallet, amount: bill.amount, dataSuffix: process.env.CELO_DATA_SUFFIX || '' }) };
          });
          return response(200, serialize({ status: 'ready-for-owner-approval', reviewToken, expiresAt: state.pendingReview.expiresAt, plan, transfers }));
        } catch (error) { return response(409, { error: error.message }); }
      }

      if (method === 'POST' && path === '/api/payment-batches/approve') {
        const billIds = Array.isArray(payload.billIds) ? payload.billIds : [];
        if (!billIds.length || billIds.some((id) => !state.bills.has(id))) return response(422, { error: 'Approve only known bill ids.' });
        if (billIds.some((id) => state.approvedBills.has(id))) return response(409, { error: 'One or more bills are already approved.' });
        if (!validReview(state, payload.reviewToken, billIds)) return response(403, { error: 'A fresh, matching owner review is required before approval.' });
        const plan = await buildPlan();
        const payableIds = new Set(plan.payments.map((payment) => payment.id));
        if (billIds.some((id) => !payableIds.has(id))) return response(409, { error: 'Approval no longer matches the current cash plan.' });
        if (plan.remainingBalance < state.reserve || plan.payments.reduce((sum, bill) => sum + bill.amount, 0n) > state.dailySpendCap) return response(409, { error: 'Payment plan exceeds the reserve or daily spending limit.' });
        if (billIds.some((id) => state.approvedBills.has(id))) return response(409, { error: 'One or more bills are already approved.' });
        const transfers = billIds.map((id) => {
          const bill = state.bills.get(id);
          const supplier = state.suppliers.get(bill.supplierId);
          return { billId: id, supplier: supplier.name, transfer: prepareWbrlTransfer({ recipient: supplier.wallet, amount: bill.amount, dataSuffix: process.env.CELO_DATA_SUFFIX || '' }) };
        });
        billIds.forEach((id) => state.approvedBills.add(id));
        state.pendingReview = null;
        persist();
        return response(202, { status: 'awaiting-chain-review', billIds, transfers, message: 'Batch approved and encoded for Celo; sending remains disabled until the owner reviews the transaction.' });
      }

      if (method === 'POST' && path === '/api/payment-batches/submit') {
        const billIds = Array.isArray(payload.billIds) ? payload.billIds : [];
        if (!billIds.length || new Set(billIds).size !== billIds.length || billIds.some((id) => !state.approvedBills.has(id) || state.bills.get(id)?.status !== 'open')) return response(409, { error: 'Only an approved, unpaid payment batch can be submitted.' });
        const plan = await buildPlan();
        if (billIds.some((id) => !plan.payments.some((bill) => bill.id === id))) return response(409, { error: 'Payment no longer fits the cash plan.' });
        if ([...state.bills.values()].some((bill) => bill.status === 'submitting')) return response(409, { error: 'A transfer is pending. Reconcile it before another submission.' });
        billIds.forEach((id) => { state.bills.get(id).status = 'submitting'; });
        persist();
        try {
          const results = [];
          for (const id of billIds) {
            const bill = state.bills.get(id);
            const supplier = state.suppliers.get(bill.supplierId);
            const result = await sendTransfer({ recipient: supplier.wallet, amount: bill.amount, dataSuffix: process.env.CELO_DATA_SUFFIX || '' });
            const record = serialize({ ...result, billId: id, supplier: supplier.name, createdAt: new Date().toISOString(), status: 'broadcast' });
            state.history.push(record);
            bill.status = 'broadcast';
            state.balance -= bill.amount;
            state.approvedBills.delete(id);
            persist();
            results.push(record);
          }
          return response(200, { status: 'submitted', transfers: results });
        } catch (error) { return response(403, { error: error.message }); }
      }

      return response(404, { error: 'Route not found.' });
    },
  };
}

function parseAmount(value) {
  try { return BigInt(String(value)); } catch { return -1n; }
}

function serialize(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function serializeState(state) {
  return serialize({ shop: state.shop, balance: state.balance, reserve: state.reserve, dailySpendCap: state.dailySpendCap, suppliers: [...state.suppliers.values()], bills: [...state.bills.values()], inflows: state.inflows, approvedBills: [...state.approvedBills], history: state.history, scheduler: state.scheduler });
}

function loadState(state, dataFile) {
  if (!fs.existsSync(dataFile)) return;
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  state.shop = saved.shop || null;
  state.balance = saved.balance === null ? null : BigInt(saved.balance);
  state.reserve = saved.reserve === null ? null : BigInt(saved.reserve);
  state.dailySpendCap = saved.dailySpendCap === null ? null : BigInt(saved.dailySpendCap);
  state.suppliers = new Map((saved.suppliers || []).map((supplier) => [supplier.id, supplier]));
  state.bills = new Map((saved.bills || []).map((bill) => [bill.id, { ...bill, amount: BigInt(bill.amount) }]));
  state.inflows = (saved.inflows || []).map((inflow) => ({ ...inflow, amount: BigInt(inflow.amount) }));
  state.approvedBills = new Set(saved.approvedBills || []);
  state.history = saved.history || [];
  state.scheduler = saved.scheduler || state.scheduler;
}

function saveState(state, dataFile) {
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(serializeState(state), null, 2), 'utf8');
  fs.renameSync(tempFile, dataFile);
}

function validReview(state, reviewToken, billIds) {
  const pending = state.pendingReview;
  if (!pending || pending.reviewToken !== reviewToken || pending.expiresAt < Date.now()) return false;
  return pending.billIds.length === billIds.length && pending.billIds.every((id) => billIds.includes(id));
}

function response(status, body) { return { status, body }; }

function startServer(port = 4174) {
  const api = createApi({ dataFile: process.env.VENCIMENTO_DATA_FILE || './vencimento-state.json' });
  const scheduler = setInterval(async () => {
    if (api.state.scheduler.enabled) await api.request('POST', '/api/scheduler/run');
  }, 60000);
  scheduler.unref();
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
      res.end();
      return;
    }
    let body = {};
    if (req.method !== 'GET') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON.' })); return; }
    }
    const requestPath = req.url.split('?')[0];
    if (req.method === 'POST') {
      const token = process.env.VENCIMENTO_OWNER_TOKEN;
      if (!token || req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Owner access is required. Configure the server owner token and connect from the dashboard.' }));
        return;
      }
    }
    if (req.method === 'GET' && !requestPath.startsWith('/api/')) {
      if (requestPath === '/agent.json') {
        const agentFile = path.join(__dirname, 'agent.json');
        if (!fs.existsSync(agentFile)) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(fs.readFileSync(agentFile));
        return;
      }
      if (requestPath === '/' || requestPath === '') { res.writeHead(302, { location: '/dashboard' }); res.end(); return; }
      const page = requestPath === '/dashboard' ? 'vencimento-dashboard.html' : 'vencimento-landing.html';
      const filePath = path.join(__dirname, page);
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
    const result = await api.request(req.method, requestPath, body);
    res.writeHead(result.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(result.body));
  });
  server.listen(port, process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1', () => console.log(`Vencimento API listening on port ${port}`));
  return server;
}

if (require.main === module) startServer(Number(process.env.PORT || 4174));

module.exports = { createApi, startServer };
