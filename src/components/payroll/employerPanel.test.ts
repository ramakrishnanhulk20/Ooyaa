/**
 * Tests for the employer panel business logic:
 * - visibility rules (employer vs payee vs stranger)
 * - withdraw max amount derivation
 * - withdraw error copy for WithdrawExceedsFree
 * - close confirm gate (requires typing "close")
 *
 * These test the pure logic extracted here so they run without
 * a React renderer and without a live RPC connection.
 */
import { describe, test, expect } from 'bun:test';
import { getAddress } from 'viem';
import type { Address } from 'viem';

// ---- Visibility rules ----
//
// The EmployerPanel renders only when the connected wallet matches the employer.
// This function mirrors the check inside EmployerPanel.

function isEmployer(connectedAddress: Address | undefined, employer: Address | undefined): boolean {
  if (!connectedAddress || !employer) return false;
  try {
    return getAddress(connectedAddress) === getAddress(employer);
  } catch {
    return false;
  }
}

// The ClaimButton renders only when claimable > 0n and the wallet is connected.
function shouldShowClaim(connectedAddress: Address | undefined, claimable: bigint): boolean {
  return !!connectedAddress && claimable > 0n;
}

const EMPLOYER = '0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA' as Address;
const PAYEE    = '0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb' as Address;
const STRANGER = '0xcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc' as Address;

describe('employer panel visibility', () => {
  test('employer wallet sees the panel', () => {
    expect(isEmployer(EMPLOYER, EMPLOYER)).toBe(true);
  });

  test('payee wallet does not see the panel', () => {
    expect(isEmployer(PAYEE, EMPLOYER)).toBe(false);
  });

  test('stranger wallet does not see the panel', () => {
    expect(isEmployer(STRANGER, EMPLOYER)).toBe(false);
  });

  test('no wallet connected: panel is hidden', () => {
    expect(isEmployer(undefined, EMPLOYER)).toBe(false);
  });

  test('employer address not yet loaded: panel is hidden', () => {
    expect(isEmployer(EMPLOYER, undefined)).toBe(false);
  });

  test('address comparison is case-insensitive (checksummed vs lowercase)', () => {
    const lower = EMPLOYER.toLowerCase() as Address;
    expect(isEmployer(lower, EMPLOYER)).toBe(true);
  });
});

describe('claim button visibility', () => {
  test('payee with claimable > 0 sees the button', () => {
    expect(shouldShowClaim(PAYEE, 5_000n)).toBe(true);
  });

  test('payee with claimable == 0 does not see the button', () => {
    expect(shouldShowClaim(PAYEE, 0n)).toBe(false);
  });

  test('no wallet connected: button is hidden even when claimable > 0', () => {
    expect(shouldShowClaim(undefined, 5_000n)).toBe(false);
  });
});

// ---- Withdraw max ----
//
// The "Max" button fills the input with freeBalance formatted as USDC.

function withdrawMaxText(freeBalance: bigint): string {
  return (Number(freeBalance) / 1_000_000).toFixed(6).replace(/\.?0+$/, '');
}

describe('withdraw max', () => {
  test('whole number strips trailing zeros and dot', () => {
    expect(withdrawMaxText(1_000_000n)).toBe('1');
  });

  test('fractional amount strips trailing zeros', () => {
    expect(withdrawMaxText(1_500_000n)).toBe('1.5');
  });

  test('sub-cent amount preserves all significant digits', () => {
    expect(withdrawMaxText(1n)).toBe('0.000001');
  });

  test('zero free balance formats as "0"', () => {
    expect(withdrawMaxText(0n)).toBe('0');
  });

  test('large amount (100 USDC)', () => {
    expect(withdrawMaxText(100_000_000n)).toBe('100');
  });
});

// ---- Withdraw error copy ----
//
// WithdrawExceedsFree must produce the exact message from the spec.

function withdrawExceedsFreeMessage(freeBalance: bigint): string {
  const formatted = formatUsdc(freeBalance);
  return `You can withdraw at most ${formatted} without leaving a due payday unpaid.`;
}

function formatUsdc(units: bigint): string {
  const s = (Number(units) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  return `${s} USDC`;
}

describe('withdraw error copy', () => {
  test('WithdrawExceedsFree includes the free balance and the exact spec wording', () => {
    const msg = withdrawExceedsFreeMessage(500_000n);
    expect(msg).toContain('0.5 USDC');
    expect(msg).toContain('without leaving a due payday unpaid');
    expect(msg.startsWith('You can withdraw at most')).toBe(true);
  });

  test('zero free balance is named explicitly', () => {
    const msg = withdrawExceedsFreeMessage(0n);
    expect(msg).toContain('0 USDC');
  });
});

// ---- Close confirm gate ----
//
// The red close button is disabled unless the user typed exactly "close"
// (case-insensitive per spec: we normalise to lower).

function canConfirmClose(typed: string): boolean {
  return typed.toLowerCase() === 'close';
}

describe('close confirm gate', () => {
  test('"close" enables the button', () => {
    expect(canConfirmClose('close')).toBe(true);
  });

  test('"Close" (capital C) enables the button', () => {
    expect(canConfirmClose('Close')).toBe(true);
  });

  test('"CLOSE" enables the button', () => {
    expect(canConfirmClose('CLOSE')).toBe(true);
  });

  test('empty string keeps it disabled', () => {
    expect(canConfirmClose('')).toBe(false);
  });

  test('partial word keeps it disabled', () => {
    expect(canConfirmClose('clos')).toBe(false);
  });

  test('word with trailing space keeps it disabled', () => {
    expect(canConfirmClose('close ')).toBe(false);
  });
});
