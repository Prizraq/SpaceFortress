import { describe, expect, it } from 'vitest';
import * as CreditLedger from './credit-ledger';

describe('credit ledger', () => {
  it('accumulates fractional resident taxes exactly over a full minute', () => {
    let balance = { credits: 0, creditRemainder: 0 };
    for (let step = 0; step < 30; step++) {
      balance = CreditLedger.settleCredits(balance.credits, balance.creditRemainder, 20, 0);
    }
    expect(balance).toEqual({ credits: 6, creditRemainder: 0, maintenanceShortfall: 0 });
  });

  it('keeps fractional income and borrows exact cents for maintenance', () => {
    expect(CreditLedger.settleCredits(10, 95, 20, 50)).toEqual({
      credits: 10,
      creditRemainder: 65,
      maintenanceShortfall: 0,
    });
    expect(CreditLedger.settleCredits(10, 5, 20, 50)).toEqual({
      credits: 9,
      creditRemainder: 75,
      maintenanceShortfall: 0,
    });
  });

  it('uses taxes from the same step, reports unpaid maintenance without debt and clears it on recovery', () => {
    const insufficient = CreditLedger.settleCredits(0, 10, 100, 610);
    expect(insufficient).toEqual({ credits: 0, creditRemainder: 0, maintenanceShortfall: 500 });
    expect(CreditLedger.settleCredits(insufficient.credits, insufficient.creditRemainder, 100, 0)).toEqual({
      credits: 1,
      creditRemainder: 0,
      maintenanceShortfall: 0,
    });
    expect(CreditLedger.settleCredits(0, 0, 100, 100)).toEqual({
      credits: 0,
      creditRemainder: 0,
      maintenanceShortfall: 0,
    });
  });

  it('preserves maximum v1 credits without scaling overflow and rejects unsafe arithmetic', () => {
    expect(CreditLedger.settleCredits(Number.MAX_SAFE_INTEGER, 0, 20, 20)).toEqual({
      credits: Number.MAX_SAFE_INTEGER,
      creditRemainder: 0,
      maintenanceShortfall: 0,
    });
    expect(() => CreditLedger.settleCredits(Number.MAX_SAFE_INTEGER, 99, 1, 0)).toThrow(RangeError);
    expect(() => CreditLedger.settleCredits(0, 0, Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(RangeError);
  });

  it.each([
    [95, 20, 50, 65],
    [0, 100, 50, 50],
    [99, 1, 1, 99],
    [0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0],
  ])(
    'settles a representable final balance without overflowing the temporary income: %s + %s - %s',
    (remainder, income, maintenance, expectedRemainder) => {
      expect(CreditLedger.settleCredits(Number.MAX_SAFE_INTEGER, remainder, income, maintenance)).toEqual({
        credits: Number.MAX_SAFE_INTEGER,
        creditRemainder: expectedRemainder,
        maintenanceShortfall: 0,
      });
    },
  );

  it('keeps the largest possible shortfall exact without a negative credit balance', () => {
    expect(CreditLedger.settleCredits(0, 0, 0, Number.MAX_SAFE_INTEGER)).toEqual({
      credits: 0,
      creditRemainder: 0,
      maintenanceShortfall: Number.MAX_SAFE_INTEGER,
    });
  });
});
