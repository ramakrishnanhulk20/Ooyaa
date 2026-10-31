import { test, expect } from 'bun:test';
import { deriveCardState } from './cardState.js';
import type { DeriveInput, PayrollContractState } from './cardState.js';

const BASE_STATE: PayrollContractState = {
  employer:        '0x0000000000000000000000000000000000000001',
  pendingEmployer: '0x0000000000000000000000000000000000000000',
  startTime:       1793178000n,
  periodLength:    3600n,
  tipPerRun:       10000n,
  periodTotal:     30000n,
  nextUnpaid:      1n,
  startedPeriods:  1n,
  owed:            40000n,
  freeBalance:     1460000n,
  balance:         1500000n,
  runway:          37n,
  totalDeferred:   0n,
  payeeCount:      3n,
  closed:          false,
  closedAt:        0n,
};

const PAYEES = [
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000004',
] as const;

function makeInput(
  stateOverride: Partial<PayrollContractState>,
  rest?: Partial<Omit<DeriveInput, 'state'>>,
): DeriveInput {
  return {
    state: { ...BASE_STATE, ...stateOverride },
    payees: PAYEES,
    dueNow: false,
    nextPayday: 1793178000n + 3600n,
    nowChain: 1793178100n,
    ...rest,
  };
}

test('loading when state is undefined', () => {
  const cs = deriveCardState({ state: undefined, payees: PAYEES, dueNow: false, nextPayday: 1n, nowChain: 1n });
  expect(cs.kind).toBe('loading');
});

test('loading when payees is undefined', () => {
  const cs = deriveCardState({ state: BASE_STATE, payees: undefined, dueNow: false, nextPayday: 1n, nowChain: 1n });
  expect(cs.kind).toBe('loading');
});

test('loading when dueNow is undefined', () => {
  const cs = deriveCardState({ state: BASE_STATE, payees: PAYEES, dueNow: undefined, nextPayday: 1n, nowChain: 1n });
  expect(cs.kind).toBe('loading');
});

test('loading when nextPayday is undefined', () => {
  const cs = deriveCardState({ state: BASE_STATE, payees: PAYEES, dueNow: false, nextPayday: undefined, nowChain: 1n });
  expect(cs.kind).toBe('loading');
});

test('due with one waiting', () => {
  // startedPeriods 2, nextUnpaid 1 -> waiting = 1
  const cs = deriveCardState(makeInput({ startedPeriods: 2n, nextUnpaid: 1n }, { dueNow: true }));
  expect(cs.kind).toBe('due');
  if (cs.kind === 'due') {
    expect(cs.waiting).toBe(1n);
    expect(cs.period).toBe(1n);
  }
});

test('due with 19 waiting', () => {
  const cs = deriveCardState(makeInput(
    { startedPeriods: 20n, nextUnpaid: 1n, balance: 5000000n },
    { dueNow: true },
  ));
  expect(cs.kind).toBe('due');
  if (cs.kind === 'due') {
    expect(cs.waiting).toBe(19n);
  }
});

test('idle after period 0', () => {
  const cs = deriveCardState(makeInput({ nextUnpaid: 1n, startedPeriods: 1n }));
  expect(cs.kind).toBe('idle');
  if (cs.kind === 'idle') {
    expect(cs.lastPaidPeriod).toBe(0n);
  }
});

test('underfunded: balance below one period cost (totalDeferred + periodTotal + tipPerRun)', () => {
  // onePeriodCost = 0 + 30000 + 10000 = 40000. balance(30000) < 40000 => underfunded.
  const cs = deriveCardState(makeInput(
    { balance: 30000n, owed: 40000n, totalDeferred: 0n },
    { dueNow: true },
  ));
  expect(cs.kind).toBe('underfunded');
  if (cs.kind === 'underfunded') {
    expect(cs.shortfall).toBe(10000n);
  }
});

test('due: balance covers one period but not all owed (partialNote set)', () => {
  // 5 periods started, next unpaid = 1, so waiting = 4.
  // onePeriodCost = 40000. balance = 80000 (covers 2 of the 4 waiting).
  // owed = 4 * 40000 = 160000. balance < owed but >= onePeriodCost -> due with partialNote.
  const cs = deriveCardState(makeInput(
    { startedPeriods: 5n, nextUnpaid: 1n, balance: 80000n, owed: 160000n, totalDeferred: 0n },
    { dueNow: true },
  ));
  expect(cs.kind).toBe('due');
  if (cs.kind === 'due') {
    expect(cs.partialNote).toBeDefined();
  }
});

test('due: balance covers all owed periods (no partialNote)', () => {
  // 2 periods started, next unpaid = 1, waiting = 1. Only one owed payday.
  // Even though balance > owed, partialNote requires waiting > 1 so it is absent.
  const cs = deriveCardState(makeInput(
    { startedPeriods: 2n, nextUnpaid: 1n, balance: 5_000_000n, owed: 40000n, totalDeferred: 0n },
    { dueNow: true },
  ));
  expect(cs.kind).toBe('due');
  if (cs.kind === 'due') {
    expect(cs.partialNote).toBeUndefined();
  }
});

test('closed with nothing due: kind is closed', () => {
  const cs = deriveCardState(makeInput({ closed: true }));
  expect(cs.kind).toBe('closed');
});

test('closed with dueNow: kind is due, closedNote is set', () => {
  const cs = deriveCardState(makeInput({ closed: true }, { dueNow: true }));
  expect(cs.kind).toBe('due');
  if (cs.kind === 'due') {
    expect(cs.closedNote).toBe(true);
  }
});

test('closed with dueNow and funded: Run is enabled (not disabled for closed)', () => {
  // Verifies the order: dueNow check comes before the closed check.
  const cs = deriveCardState(makeInput(
    { closed: true, balance: 5_000_000n, owed: 40_000n },
    { dueNow: true },
  ));
  expect(cs.kind).toBe('due');
});

test('nextUnpaid 0 with nothing started: idle, lastPaidPeriod null', () => {
  const cs = deriveCardState(makeInput({ nextUnpaid: 0n, startedPeriods: 0n }));
  expect(cs.kind).toBe('idle');
  if (cs.kind === 'idle') {
    expect(cs.lastPaidPeriod).toBeNull();
  }
});
