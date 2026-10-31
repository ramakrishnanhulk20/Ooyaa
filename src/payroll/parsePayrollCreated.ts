/**
 * Extracts the new payroll address from a transaction receipt's decoded logs.
 * Only logs emitted by the expected factory address are considered, so a
 * re-entrant or spoofed PayrollCreated from another contract is ignored.
 */
import type { Address } from 'viem';

type PayrollCreatedLog = {
  address: Address;
  eventName: 'PayrollCreated';
  args: {
    employer: Address;
    payroll: Address;
    index: bigint;
  };
};

export function parsePayrollCreated(
  logs: Array<{ address: Address; eventName: string; args: Record<string, unknown> }>,
  factory: Address,
): Address | null {
  const factoryLower = factory.toLowerCase();
  for (const log of logs) {
    if (
      log.eventName === 'PayrollCreated' &&
      log.address.toLowerCase() === factoryLower
    ) {
      const typed = log as unknown as PayrollCreatedLog;
      return typed.args.payroll;
    }
  }
  return null;
}
