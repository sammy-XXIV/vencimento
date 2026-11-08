# Vencimento

Vencimento is a cash-flow agent for small Brazilian shops. It reads supplier bills, checks available wBRL and expected inflows, prioritizes payments using the owner’s rules, protects a cash reserve, and prepares tagged wBRL payments on Celo for owner approval.

## Live demo

- App: https://levanter-production-4b47.up.railway.app
- Dashboard: https://levanter-production-4b47.up.railway.app/dashboard
- ERC-8004 metadata: https://levanter-production-4b47.up.railway.app/agent.json

## Results

- 0.1 wBRL paid to Demo Supplier on Celo mainnet.
- Transaction: https://celoscan.io/tx/0x7172d1c716af602fd2364a7a1675a05607c0b220223df451252bc9805af7bd64
- Sender: `0x95149bf6b2caAC09DEBF4Af96Ce5AC94aBdB24E1`
- Recipient: `0x145aAF98DC340f64146b7eE1EE4347F9d88D90bD`
- Receipt status: successful (`0x1`); calldata includes the Loops attribution tag `celo_29cc419a3735`.
- Additional 0.1 wBRL payment: https://celoscan.io/tx/0x9457f684df87b816c46bf687e36d41183e002a5abed8b2c2031f809793d165a6
- Additional 0.1 wBRL payment: https://celoscan.io/tx/0xd53a28f4437538b546cdc499b6f6d4d18ebc392e8df729edca0c3227c8a8ba5c

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
