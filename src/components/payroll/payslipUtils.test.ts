/**
 * Tests for payslip utilities: payee filter and CSV builders.
 */
import { describe, test, expect } from 'bun:test';
import { filterPayeeRows, buildPayeeCsv, buildAllCsv } from './payslipUtils.js';
import type { LedgerRow } from '../../proof/rows.js';

const PAYROLL = '0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A' as const;
const PAYEE_A = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B' as const;
const PAYEE_B = '0x1111111111111111111111111111111111111111' as const;
const TX = '0xdeadbeef00000000000000000000000000000000000000000000000000000001' as const;

function makeRow(to: string, period: bigint, amount: bigint): LedgerRow {
  return {
    kind: 'payslip',
    direction: 'out',
    payroll: PAYROLL,
    txHash: TX,
    blockNumber: 100n,
    logIndex: 0,
    time: 1_700_000_000n,
    period,
    from: PAYROLL,
    to: to as LedgerRow['to'],
    amount,
  };
}

const ROW_A = makeRow(PAYEE_A, 1n, 10_000n);
const ROW_B = makeRow(PAYEE_B, 1n, 10_000n);
const ROW_A2 = makeRow(PAYEE_A, 2n, 10_000n);

describe('filterPayeeRows', () => {
  test('returns only rows for the given payee', () => {
    const result = filterPayeeRows([ROW_A, ROW_B, ROW_A2], PAYEE_A);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.to.toLowerCase() === PAYEE_A.toLowerCase())).toBe(true);
  });

  test('is case-insensitive', () => {
    const lower = PAYEE_A.toLowerCase() as typeof PAYEE_A;
    const result = filterPayeeRows([ROW_A, ROW_B], lower);
    expect(result).toHaveLength(1);
  });

  test('returns empty array when no rows match', () => {
    const OTHER = '0x2222222222222222222222222222222222222222' as const;
    expect(filterPayeeRows([ROW_A, ROW_B], OTHER)).toHaveLength(0);
  });
});

describe('buildPayeeCsv', () => {
  test('first line is the exact header', () => {
    const csv = buildPayeeCsv([], PAYROLL);
    expect(csv.split('\n')[0]).toBe('when_utc,period_index,period_label,amount_usdc,tx,payroll');
  });

  test('data row contains period_index, period_label, amount, tx and payroll', () => {
    const csv = buildPayeeCsv([ROW_A], PAYROLL);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    // period index 1 -> label "Period 0002"
    expect(lines[1]).toContain('"1"');
    expect(lines[1]).toContain('"Period 0002"');
    expect(lines[1]).toContain('"0.010000"');
    expect(lines[1]).toContain(`"${TX}"`);
    expect(lines[1]).toContain(`"${PAYROLL}"`);
  });
});

describe('buildAllCsv', () => {
  test('first line is the exact header', () => {
    const csv = buildAllCsv([]);
    expect(csv.split('\n')[0]).toBe('when_utc,block,kind,period_index,period_label,from,to,direction,amount_usdc,tx,payroll');
  });

  test('data row contains kind, block, period_index, period_label and direction', () => {
    const csv = buildAllCsv([ROW_A]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"payslip"');
    expect(lines[1]).toContain('"100"');
    expect(lines[1]).toContain('"out"');
    // period index 1 -> label "Period 0002"
    expect(lines[1]).toContain('"1"');
    expect(lines[1]).toContain('"Period 0002"');
  });
});
