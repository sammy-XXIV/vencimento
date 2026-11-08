# Vencimento

Vencimento is a cash-flow agent for small Brazilian shops. It reads supplier bills, checks available wBRL and expected inflows, prioritizes payments using the owner’s rules, protects a cash reserve, and prepares tagged wBRL payments on Celo for owner approval.

## Live demo

- App: https://levanter-production-4b47.up.railway.app
- Dashboard: https://levanter-production-4b47.up.railway.app/dashboard
- ERC-8004 metadata: https://levanter-production-4b47.up.railway.app/agent.json

## Current flow

1. Configure the shop wallet, balance, reserve, and daily cap.
2. Add supplier wallets and bills.
3. Add expected inflows.
4. Generate a deterministic payment plan.
5. Review recipients, amounts, and remaining balance.
6. Approve and submit guarded wBRL transfers on Celo.

The planner is intentionally deterministic for the MVP: it pays by priority and due date, never breaks the reserve, and respects the daily cap. The payment path appends the event attribution tag `celo_29cc419a3735` to transaction calldata.

## Run locally

```bash
npm install
npm start
```

Open http://127.0.0.1:4174/ or http://127.0.0.1:4174/dashboard.

The local API stores state in `vencimento-state.json`. Set `VENCIMENTO_DATA_FILE` to use another path. Mainnet sending is disabled unless explicitly enabled with the required wallet, attribution, and payment-cap configuration.

## Tests

```bash
node vencimento-api.test.cjs
node vencimento-celo.test.cjs
node vencimento-core.test.mjs
```

## Security

Never commit `AGENT_PRIVATE_KEY`, seed phrases, or wallet exports. Use a secret manager such as Railway variables. Keep mainnet sending disabled during development and use small payment caps and whitelisted supplier wallets.
