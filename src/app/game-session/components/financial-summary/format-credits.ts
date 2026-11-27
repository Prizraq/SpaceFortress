export function formatCredits(credits: number, creditRemainder: number): string {
  const whole = credits.toString();
  return creditRemainder === 0
    ? whole
    : `${whole},${creditRemainder.toString().padStart(2, '0').replace(/0$/, '')}`;
}
