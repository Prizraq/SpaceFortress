function safeAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Финансы: сумма выходит за пределы безопасного целого числа.');
  return value;
}

export function settleCredits(
  credits: number,
  creditRemainder: number,
  incomeCents: number,
  maintenanceCents: number,
) {
  safeAmount(credits);
  safeAmount(creditRemainder);
  if (creditRemainder >= 100)
    throw new RangeError('Финансы: остаток должен быть от 0 до 99 сотых кредита.');
  safeAmount(incomeCents);
  safeAmount(maintenanceCents);
  // Net cents avoid a temporary income overflow; whole credits are never scaled on payment.
  const change = incomeCents - maintenanceCents;
  const remainder = creditRemainder + (change % 100);
  const carry = Math.floor(remainder / 100);
  const nextCredits = credits + Math.trunc(change / 100) + carry;
  if (nextCredits < 0) {
    return {
      credits: 0,
      creditRemainder: 0,
      maintenanceShortfall: -change - credits * 100 - creditRemainder,
    };
  }
  return {
    credits: safeAmount(nextCredits),
    creditRemainder: remainder - carry * 100,
    maintenanceShortfall: 0,
  };
}
