import { describe, test, expect } from 'bun:test';
import { CREATE_ERROR_NAMES } from './runErrors.js';
import { parsePayrollCreated } from './parsePayrollCreated.js';
import type { Address } from 'viem';

const FACTORY = '0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b' as Address;
const OTHER   = '0x0000000000000000000000000000000000000001' as Address;
const PAYROLL = '0xDEAD000000000000000000000000000000000001' as Address;

describe('CREATE_ERROR_NAMES', () => {
  test('EmptyPayeeList maps to expected message', () => {
    expect(CREATE_ERROR_NAMES['EmptyPayeeList']).toBe('Add at least one payee.');
  });

  test('DuplicatePayee maps to expected message', () => {
    expect(CREATE_ERROR_NAMES['DuplicatePayee']).toBe('That payee is listed twice.');
  });

  test('PayeeIsUsdc maps to expected message', () => {
    expect(CREATE_ERROR_NAMES['PayeeIsUsdc']).toBe('A payee cannot be the USDC contract.');
  });

  test('TipTooLarge maps to expected message', () => {
    expect(CREATE_ERROR_NAMES['TipTooLarge']).toBe('The tip can be at most 10 USDC.');
  });

  test('PeriodLengthTooShort and PeriodLengthTooLong map to same message', () => {
    expect(CREATE_ERROR_NAMES['PeriodLengthTooShort']).toBe(CREATE_ERROR_NAMES['PeriodLengthTooLong']);
  });

  test('unknown error name is not in the map', () => {
    expect(CREATE_ERROR_NAMES['SomeRandomError']).toBeUndefined();
  });
});

describe('parsePayrollCreated', () => {
  function makeLog(address: Address, payroll: Address) {
    return {
      address,
      eventName: 'PayrollCreated' as const,
      args: { employer: address, payroll, index: 0n },
      blockNumber: 1000n,
      transactionHash: '0xabc' as `0x${string}`,
      logIndex: 0,
    };
  }

  test('returns payroll address from matching factory log', () => {
    const logs = [makeLog(FACTORY, PAYROLL)];
    expect(parsePayrollCreated(logs, FACTORY)).toBe(PAYROLL);
  });

  test('ignores PayrollCreated from a different factory address', () => {
    const logs = [makeLog(OTHER, PAYROLL)];
    expect(parsePayrollCreated(logs, FACTORY)).toBeNull();
  });

  test('returns null when no logs', () => {
    expect(parsePayrollCreated([], FACTORY)).toBeNull();
  });

  test('picks the matching log when multiple are present', () => {
    const logs = [makeLog(OTHER, OTHER), makeLog(FACTORY, PAYROLL)];
    expect(parsePayrollCreated(logs, FACTORY)).toBe(PAYROLL);
  });
});
