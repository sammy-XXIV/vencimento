function compareBills(a, b) {
  return a.priority - b.priority || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id);
}

export function buildPaymentPlan({ balance, reserve, dailySpendCap = null, bills, inflows = [] }) {
  if (!Number.isSafeInteger(Number(balance)) || balance < 0n) {
    throw new Error('balance must be a non-negative bigint');
  }
  if (!Number.isSafeInteger(Number(reserve)) || reserve < 0n) {
    throw new Error('reserve must be a non-negative bigint');
  }
  if (reserve > balance) {
    throw new Error('reserve cannot exceed balance');
  }
  if (dailySpendCap !== null && (typeof dailySpendCap !== 'bigint' || dailySpendCap < 0n)) {
    throw new Error('dailySpendCap must be a non-negative bigint or null');
  }

  const available = balance - reserve;
  let remaining = available;
  let spent = 0n;
  const payments = [];
  const delayed = [];

  for (const bill of [...bills].sort(compareBills)) {
    if (dailySpendCap !== null && spent + bill.amount > dailySpendCap) {
      delayed.push({
        ...bill,
        reason: `Delayed because the daily cap is ${dailySpendCap} wBRL.`,
      });
      continue;
    }

    if (bill.amount <= remaining) {
      payments.push(bill);
      remaining -= bill.amount;
      spent += bill.amount;
      continue;
    }

    delayed.push({
      ...bill,
      reason: `Delayed to preserve the ${reserve} wBRL reserve; the next expected inflow is ${inflows[0]?.amount ?? 0n} wBRL.`,
    });
  }

  return {
    payments,
    delayed,
    available,
    remainingBalance: balance - (payments.reduce((total, bill) => total + bill.amount, 0n)),
  };
}
