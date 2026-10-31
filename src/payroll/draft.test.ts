import { describe, test, expect } from 'bun:test';
import {
  validateDraft,
  fundAmount,
  parseUsdcInput,
  DEFAULT_DRAFT,
  type DraftPayroll,
} from './draft.js';
import { USDC_ADDRESS } from '../deployments.js';

const NOW = 1_700_000_000n; // arbitrary fixed chain timestamp

function draft(overrides: Partial<DraftPayroll> = {}): DraftPayroll {
  return {
    ...DEFAULT_DRAFT,
    payees: [{ address: '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9', amountUsdc: '0.01' }],
    ...overrides,
  };
}

describe('validateDraft', () => {
  test('valid draft returns no errors', () => {
    expect(validateDraft(draft(), NOW)).toHaveLength(0);
  });

  test('empty payees returns general error', () => {
    const errs = validateDraft(draft({ payees: [] }), NOW);
    expect(errs.some(e => e.field === 'general')).toBe(true);
  });

  test('more than 100 payees returns general error', () => {
    const payees = Array.from({ length: 101 }, (_, i) => ({
      address: `0x${String(i + 1).padStart(40, '0')}`,
      amountUsdc: '1',
    }));
    const errs = validateDraft(draft({ payees }), NOW);
    expect(errs.some(e => e.field === 'general')).toBe(true);
  });

  test('invalid payee address returns payee_address error', () => {
    const errs = validateDraft(draft({ payees: [{ address: 'notanaddress', amountUsdc: '1' }] }), NOW);
    expect(errs.some(e => e.field === 'payee_address' && e.index === 0)).toBe(true);
  });

  test('USDC contract as payee returns payee_address error', () => {
    const errs = validateDraft(draft({ payees: [{ address: USDC_ADDRESS, amountUsdc: '1' }] }), NOW);
    expect(errs.some(e => e.field === 'payee_address' && e.message === 'Cannot be the USDC contract')).toBe(true);
  });

  test('duplicate payee returns payee_address error on both rows', () => {
    const addr = '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9';
    const errs = validateDraft(draft({
      payees: [
        { address: addr, amountUsdc: '1' },
        { address: addr, amountUsdc: '2' },
      ],
    }), NOW);
    const dupeErrs = errs.filter(e => e.field === 'payee_address');
    expect(dupeErrs.length).toBeGreaterThanOrEqual(2);
  });

  test('zero amount returns payee_amount error', () => {
    const errs = validateDraft(draft({ payees: [{ address: '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9', amountUsdc: '0' }] }), NOW);
    expect(errs.some(e => e.field === 'payee_amount')).toBe(true);
  });

  test('amount above 1,000,000 returns payee_amount error', () => {
    const errs = validateDraft(draft({ payees: [{ address: '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9', amountUsdc: '1000001' }] }), NOW);
    expect(errs.some(e => e.field === 'payee_amount')).toBe(true);
  });

  test('amount with more than 6 decimals returns payee_amount error about decimals', () => {
    const errs = validateDraft(draft({ payees: [{ address: '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9', amountUsdc: '1.0000001' }] }), NOW);
    expect(errs.some(e => e.field === 'payee_amount' && e.message === 'At most 6 decimals')).toBe(true);
  });

  test('tip above 10 USDC returns tip error', () => {
    const errs = validateDraft(draft({ tipUsdc: '10.000001' }), NOW);
    expect(errs.some(e => e.field === 'tip')).toBe(true);
  });

  test('zero tip is valid', () => {
    const errs = validateDraft(draft({ tipUsdc: '0' }), NOW);
    expect(errs.some(e => e.field === 'tip')).toBe(false);
  });

  test('startTime in the past returns startTime error', () => {
    const errs = validateDraft(draft({ firstPayday: 'pick', pickDatetime: '2000-01-01T00:00' }), NOW);
    expect(errs.some(e => e.field === 'startTime')).toBe(true);
  });

  test('startTime beyond 365 days returns startTime error', () => {
    // 400 days from now in UTC.
    const far = new Date((Number(NOW) + 400 * 86400) * 1000);
    const iso = far.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
    const errs = validateDraft(draft({ firstPayday: 'pick', pickDatetime: iso }), NOW);
    expect(errs.some(e => e.field === 'startTime')).toBe(true);
  });

  test('fund paydays < 1 returns fund error', () => {
    const errs = validateDraft(draft({ fundPaydays: 0, fundLater: false }), NOW);
    expect(errs.some(e => e.field === 'fund')).toBe(true);
  });

  test('fundLater skips fund validation', () => {
    const errs = validateDraft(draft({ fundPaydays: 0, fundLater: true }), NOW);
    expect(errs.some(e => e.field === 'fund')).toBe(false);
  });
});

describe('fundAmount', () => {
  test('single payee 0.01 USDC + 0.01 tip, 5 paydays = 0.10 USDC', () => {
    const d = draft({ tipUsdc: '0.01', fundPaydays: 5 });
    // 0.01 payee + 0.01 tip = 0.02 per payday; x5 = 0.10
    expect(fundAmount(d, 5)).toBe(100_000n);
  });

  test('two payees 0.01 each + 0.01 tip, 1 payday = 0.03 USDC', () => {
    const d = draft({
      payees: [
        { address: '0xd57D8F8A615F35133D8121e58F4ed778A4F612E9', amountUsdc: '0.01' },
        { address: '0x1111111111111111111111111111111111111111', amountUsdc: '0.01' },
      ],
      tipUsdc: '0.01',
      fundPaydays: 1,
    });
    expect(fundAmount(d, 1)).toBe(30_000n);
  });

  test('no valid payees returns null', () => {
    const d = draft({ payees: [{ address: '', amountUsdc: '' }] });
    expect(fundAmount(d, 5)).toBeNull();
  });
});

describe('parseUsdcInput', () => {
  test('whole number', () => expect(parseUsdcInput('1')).toBe(1_000_000n));
  test('6 decimals', () => expect(parseUsdcInput('0.000001')).toBe(1n));
  test('7 decimals returns null', () => expect(parseUsdcInput('0.0000001')).toBeNull());
  test('non-numeric returns null', () => expect(parseUsdcInput('abc')).toBeNull());
});

// Gas estimate gate: the form enables estimateContractGas only when
// validateDraft(draft, chainNow) returns zero errors with a real chain time.
// chainNow = 0n skips start-time validation, so draftIsValid must use a real
// chain timestamp to catch past or too-far-future firstPayday: 'pick' entries.
describe('gas estimate gate', () => {
  // EIP-55 checksummed form of the address from the spec.
  const PAYEE = '0x96e81da285BB91b7d02EE3E6aD51fA3Caf5dAB75';

  test('valid draft with known chain time returns no errors (gate opens)', () => {
    const d = draft({
      payees: [{ address: PAYEE, amountUsdc: '0.01' }],
      firstPayday: 'in_2m',
    });
    expect(validateDraft(d, NOW)).toHaveLength(0);
  });

  test('past pick date with chainNow 0n passes (start-time check skipped)', () => {
    // This is why the gate must use a real chain timestamp, not 0n.
    const d = draft({
      payees: [{ address: PAYEE, amountUsdc: '0.01' }],
      firstPayday: 'pick',
      pickDatetime: '2000-01-01T00:00',
    });
    expect(validateDraft(d, 0n)).toHaveLength(0);
  });

  test('past pick date with real chain time returns startTime error (gate stays closed)', () => {
    const d = draft({
      payees: [{ address: PAYEE, amountUsdc: '0.01' }],
      firstPayday: 'pick',
      pickDatetime: '2000-01-01T00:00',
    });
    const errs = validateDraft(d, NOW);
    expect(errs.some(e => e.field === 'startTime')).toBe(true);
  });
});
