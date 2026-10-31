import type { Address } from 'viem';

/**
 * The struct returned by Payroll.getState().
 * Field names match the ABI exactly.
 */
export type PayrollContractState = {
  employer: Address;
  pendingEmployer: Address;
  startTime: bigint;
  periodLength: bigint;
  tipPerRun: bigint;
  periodTotal: bigint;
  nextUnpaid: bigint;
  startedPeriods: bigint;
  owed: bigint;
  freeBalance: bigint;
  balance: bigint;
  runway: bigint;
  totalDeferred: bigint;
  payeeCount: bigint;
  closed: boolean;
  closedAt: bigint;
};

export type CardState =
  | { kind: 'loading' }
  // closedNote is set when the payroll is closed but still has a due period.
  // partialNote is set when the balance covers one period but not all owed periods.
  | { kind: 'due'; period: bigint; waiting: bigint; dueAt: bigint; closedNote?: true; partialNote?: { funded: bigint; total: bigint } }
  | { kind: 'idle'; lastPaidPeriod: bigint | null; nextAt: bigint }
  | { kind: 'underfunded'; owed: bigint; balance: bigint; shortfall: bigint }
  | { kind: 'closed' };

export type DeriveInput = {
  state: PayrollContractState | undefined;
  payees: readonly Address[] | undefined;
  dueNow: boolean | undefined;
  nextPayday: bigint | undefined;
  nowChain: bigint;
};

/**
 * Derives the card display state from live contract reads.
 * Pure function, no network calls, unit-testable.
 */
export function deriveCardState(input: DeriveInput): CardState {
  const { state, payees, dueNow, nextPayday } = input;

  if (
    state === undefined ||
    payees === undefined ||
    dueNow === undefined ||
    nextPayday === undefined
  ) {
    return { kind: 'loading' };
  }

  if (dueNow) {
    // The contract's run() requires balance >= totalDeferred + periodTotal + tipPerRun
    // to pay the next (oldest unpaid) period. This is the minimum cost for one payday.
    const onePeriodCost = state.totalDeferred + state.periodTotal + state.tipPerRun;
    if (state.balance < onePeriodCost) {
      // Cannot pay even one period; show the underfunded state.
      return {
        kind: 'underfunded',
        owed: onePeriodCost,
        balance: state.balance,
        shortfall: onePeriodCost - state.balance,
      };
    }
    const waiting = state.startedPeriods - state.nextUnpaid;
    const dueAt = state.startTime + state.nextUnpaid * state.periodLength;
    // When the balance covers one period but not all owed periods, attach a note.
    const partialNote =
      waiting > 1n && state.balance < state.owed
        ? { funded: state.balance / onePeriodCost, total: waiting }
        : undefined;
    // closed + dueNow: periods that already started can still run even after
    // close(). Only closed with nothing due shows the pure 'closed' state.
    return {
      kind: 'due',
      period: state.nextUnpaid,
      waiting,
      dueAt,
      ...(state.closed ? { closedNote: true as const } : {}),
      ...(partialNote ? { partialNote } : {}),
    };
  }

  // Nothing is due. If the payroll is closed, no more periods will ever start.
  if (state.closed) return { kind: 'closed' };

  const lastPaidPeriod = state.nextUnpaid > 0n ? state.nextUnpaid - 1n : null;
  return { kind: 'idle', lastPaidPeriod, nextAt: nextPayday };
}
