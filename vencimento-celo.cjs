const WBRL = '0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0';
const CELO_MAINNET = 42220;

function validateCeloConfig({ chainId, tokenAddress }) {
  if (chainId !== CELO_MAINNET) throw new Error('Celo mainnet is required.');
  if (String(tokenAddress).toLowerCase() !== WBRL) throw new Error('Configured token is not wBRL.');
}

function validateMoneyPathConfig({ chainId, tokenAddress, agentWallet, privateKey, dataSuffix, maxSinglePayment }) {
  validateCeloConfig({ chainId, tokenAddress });
  if (!/^0x[a-fA-F0-9]{40}$/.test(agentWallet || '')) throw new Error('A valid agent wallet is required.');
  if (!privateKey) throw new Error('A private key is required only inside the server process.');
  if (!dataSuffix) throw new Error('The Loops attribution suffix is required.');
  if (typeof maxSinglePayment !== 'bigint' || maxSinglePayment <= 0n) throw new Error('A positive maximum single payment is required.');
}

function prepareWbrlTransfer({ recipient, amount, dataSuffix = '' }) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) throw new Error('Invalid supplier wallet.');
  if (typeof amount !== 'bigint' || amount <= 0n) throw new Error('Transfer amount must be a positive bigint.');
  const suffix = String(dataSuffix).replace(/^0x/, '');
  if (suffix && (!/^[a-fA-F0-9]+$/.test(suffix) || suffix.length % 2 !== 0)) throw new Error('Invalid attribution data suffix.');
  const calldata = `0xa9059cbb${recipient.slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}${suffix}`;
  return { chainId: CELO_MAINNET, to: WBRL, value: 0n, data: calldata };
}

async function sendWbrlTransfer({ recipient, amount, dataSuffix }) {
  if (process.env.VENCIMENTO_ENABLE_MAINNET_SEND !== 'true') throw new Error('Mainnet sending is disabled. Set VENCIMENTO_ENABLE_MAINNET_SEND=true only after reviewing the transaction.');
  const maxSinglePayment = BigInt(process.env.MAX_SINGLE_PAYMENT_WBRL || '0');
  validateMoneyPathConfig({ chainId: CELO_MAINNET, tokenAddress: WBRL, agentWallet: process.env.CELO_AGENT_WALLET, privateKey: process.env.AGENT_PRIVATE_KEY, dataSuffix: process.env.CELO_DATA_SUFFIX, maxSinglePayment });
  if (amount > maxSinglePayment) throw new Error('Transfer exceeds the configured maximum single payment.');
  const { createWalletClient, http } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { celo } = await import('viem/chains');
  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
  const transfer = prepareWbrlTransfer({ recipient, amount, dataSuffix: process.env.CELO_DATA_SUFFIX });
  const wallet = createWalletClient({ account, chain: celo, transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org') });
  const hash = await wallet.sendTransaction({ to: transfer.to, data: transfer.data, value: transfer.value });
  return { hash, chainId: CELO_MAINNET, token: WBRL, from: account.address, recipient, amount };
}

module.exports = { WBRL, CELO_MAINNET, validateCeloConfig, validateMoneyPathConfig, prepareWbrlTransfer, sendWbrlTransfer };
