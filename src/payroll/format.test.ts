import { describe, test, expect } from 'bun:test';
import { shortAddress, formatUsdc, countdown, periodLabel, periodDisplayLabel, periodDueTime, cadence, utcTime } from './format.js';

describe('shortAddress', () => {
  test('truncates a full address', () => {
    expect(shortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678');
  });
  test('returns short strings as-is', () => {
    expect(shortAddress('0xabc')).toBe('0xabc');
  });
});

describe('formatUsdc', () => {
  test('10000 -> "0.01 USDC"', () => {
    expect(formatUsdc(10000n)).toBe('0.01 USDC');
  });
  test('1460000 -> "1.46 USDC"', () => {
    expect(formatUsdc(1460000n)).toBe('1.46 USDC');
  });
  test('1000000 -> "1 USDC" (no trailing zeros)', () => {
    expect(formatUsdc(1000000n)).toBe('1 USDC');
  });
  test('0 -> "0 USDC"', () => {
    expect(formatUsdc(0n)).toBe('0 USDC');
  });
});

describe('countdown', () => {
  test('0 seconds -> "0:00"', () => {
    expect(countdown(0)).toBe('0:00');
  });
  test('59 seconds -> "0:59"', () => {
    expect(countdown(59)).toBe('0:59');
  });
  test('3599 seconds -> "59:59"', () => {
    expect(countdown(3599)).toBe('59:59');
  });
  test('3600 seconds -> "1h 00m"', () => {
    expect(countdown(3600)).toBe('1h 00m');
  });
  test('3660 seconds -> "1h 01m"', () => {
    expect(countdown(3660)).toBe('1h 01m');
  });
  test('754 seconds -> "12:34"', () => {
    expect(countdown(754)).toBe('12:34');
  });
});

describe('periodLabel', () => {
  test('period 1 -> "PAYSLIP, PERIOD 0001"', () => {
    expect(periodLabel(1)).toBe('PAYSLIP, PERIOD 0001');
  });
  test('period 42 -> "PAYSLIP, PERIOD 0042"', () => {
    expect(periodLabel(42)).toBe('PAYSLIP, PERIOD 0042');
  });
});

describe('periodDisplayLabel', () => {
  test('index 0 -> "Period 0001"', () => {
    expect(periodDisplayLabel(0n)).toBe('Period 0001');
  });
  test('index 37 -> "Period 0038"', () => {
    expect(periodDisplayLabel(37n)).toBe('Period 0038');
  });
  test('index 9999 -> "Period 10000"', () => {
    expect(periodDisplayLabel(9999n)).toBe('Period 10000');
  });
});

describe('periodDueTime', () => {
  const ST = 1_000_000n;
  const PL = 3600n;

  test('index 0 is due at startTime', () => {
    expect(periodDueTime(0n, ST, PL)).toBe(ST);
  });
  test('index 37 is due at startTime + 37 * periodLength', () => {
    expect(periodDueTime(37n, ST, PL)).toBe(ST + 37n * PL);
  });
});

describe('cadence', () => {
  test('3600 -> "every hour"', () => {
    expect(cadence(3600n)).toBe('every hour');
  });
  test('86400 -> "every day"', () => {
    expect(cadence(86400n)).toBe('every day');
  });
  test('604800 -> "every week"', () => {
    expect(cadence(604800n)).toBe('every week');
  });
  test('7200 -> "every 2 hours"', () => {
    expect(cadence(7200n)).toBe('every 2 hours');
  });
  test('120 -> "every 2 minutes"', () => {
    expect(cadence(120n)).toBe('every 2 minutes');
  });
});

describe('utcTime', () => {
  // 2026-10-28 10:00:00 UTC
  const ts = BigInt(Date.UTC(2026, 9, 28, 10, 0, 0) / 1000);
  // Same day
  const sameDay = BigInt(Date.UTC(2026, 9, 28, 12, 0, 0) / 1000);
  // Different day
  const nextDay = BigInt(Date.UTC(2026, 9, 29, 8, 0, 0) / 1000);

  test('same UTC day -> "10:00 UTC"', () => {
    expect(utcTime(ts, sameDay)).toBe('10:00 UTC');
  });
  test('different UTC day -> "10:00 UTC, 28 Oct"', () => {
    expect(utcTime(ts, nextDay)).toBe('10:00 UTC, 28 Oct');
  });
});
