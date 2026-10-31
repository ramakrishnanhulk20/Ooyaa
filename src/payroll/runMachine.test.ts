import { describe, test, expect } from 'bun:test';
import { runReducer, INITIAL_STATE } from './runMachine.js';
import type { RunState, RunEvent } from './runMachine.js';
import type { Hex } from 'viem';

const TX = '0xaabbccdd00000000000000000000000000000000000000000000000000001234' as Hex;

function apply(state: RunState, events: RunEvent[]): RunState {
  return events.reduce(runReducer, state);
}

describe('runMachine', () => {
  test('PRESS then SIM_REVERT NothingDue gives refused already_paid', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_REVERT', name: 'NothingDue', detail: '' },
    ]);
    expect(s.kind).toBe('refused');
    if (s.kind === 'refused') expect(s.reason).toBe('already_paid');
  });

  test('PRESS then SIM_REVERT Underfunded gives refused underfunded', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_REVERT', name: 'Underfunded', detail: 'owes 1' },
    ]);
    expect(s.kind).toBe('refused');
    if (s.kind === 'refused') expect(s.reason).toBe('underfunded');
  });

  test('PRESS then SIM_REVERT unknown gives refused other', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_REVERT', name: 'SomeOtherError', detail: 'x' },
    ]);
    expect(s.kind).toBe('refused');
    if (s.kind === 'refused') expect(s.reason).toBe('other');
  });

  // SIM_REVERT covers both the simulation and the estimate step.
  test('SIM_REVERT from an estimate race gives refused (same as simulation)', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_REVERT', name: 'NothingDue', detail: '' },
    ]);
    expect(s.kind).toBe('refused');
    if (s.kind === 'refused') expect(s.reason).toBe('already_paid');
  });

  test('PRESS then NO_WALLET gives needs_wallet', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'NO_WALLET' },
    ]);
    expect(s.kind).toBe('needs_wallet');
  });

  test('PRESS then WRONG_CHAIN gives wrong_chain', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'WRONG_CHAIN' },
    ]);
    expect(s.kind).toBe('wrong_chain');
  });

  test('NO_WALLET while signing leaves the state unchanged', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'NO_WALLET' },
    ]);
    expect(s.kind).toBe('signing');
  });

  test('SIM_OK, SIGNED, RECEIPT_OK give paid with summary', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'SIGNED', hash: TX },
      {
        type: 'RECEIPT_OK',
        summary: { hash: TX, period: 3n, paid: 30000n, deferred: 0n, tip: 10000n, count: 3 },
      },
    ]);
    expect(s.kind).toBe('paid');
    if (s.kind === 'paid') {
      expect(s.period).toBe(3n);
      expect(s.count).toBe(3);
      expect(s.hash).toBe(TX);
    }
  });

  test('SIGNED then RECEIPT_REVERTED gives failed reverted', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'SIGNED', hash: TX },
      { type: 'RECEIPT_REVERTED', hash: TX },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toBe('reverted');
  });

  test('REJECTED gives failed cancelled', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'REJECTED' },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toBe('cancelled');
  });

  test('RESET from refused gives ready', () => {
    const refused = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_REVERT', name: 'NothingDue', detail: '' },
    ]);
    expect(apply(refused, [{ type: 'RESET' }]).kind).toBe('ready');
  });

  test('RESET from failed gives ready', () => {
    const failed = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'REJECTED' },
    ]);
    expect(apply(failed, [{ type: 'RESET' }]).kind).toBe('ready');
  });

  test('RESET from paid gives ready', () => {
    const paid = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'SIGNED', hash: TX },
      {
        type: 'RECEIPT_OK',
        summary: { hash: TX, period: 0n, paid: 10n, deferred: 0n, tip: 5n, count: 1 },
      },
    ]);
    expect(apply(paid, [{ type: 'RESET' }]).kind).toBe('ready');
  });

  test('no transition from checking straight to signing without SIM_OK', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      // SIGNED is only valid from signing, not checking.
      { type: 'SIGNED', hash: TX },
    ]);
    expect(s.kind).toBe('checking');
  });

  test('ERROR from signing gives failed', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'ERROR', kind: 'no_gas', detail: 'need USDC for gas' },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toBe('no_gas');
  });

  test('ERROR from pending gives failed', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'SIGNED', hash: TX },
      { type: 'ERROR', kind: 'other', hash: TX, detail: 'timeout' },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') {
      expect(s.reason).toBe('other');
      expect(s.hash).toBe(TX);
    }
  });

  test('ERROR from checking gives failed (RPC error during simulation)', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'ERROR', kind: 'other', detail: 'RPC timeout' },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toBe('other');
  });

  // D.1 late-receipt tests.
  test('SIGNED(h), ERROR(other, h), RECEIPT_OK(h) gives paid', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'SIGNED', hash: TX },
      { type: 'ERROR', kind: 'other', hash: TX, detail: 'Still waiting for Arc. Check the tx link.' },
      { type: 'RECEIPT_OK', summary: { hash: TX, period: 5n, paid: 30000n, deferred: 0n, tip: 10000n, count: 3 } },
    ]);
    expect(s.kind).toBe('paid');
    if (s.kind === 'paid') expect(s.hash).toBe(TX);
  });

  test('RECEIPT_OK with a different hash leaves failed state unchanged', () => {
    const OTHER = '0xdeadbeef00000000000000000000000000000000000000000000000000000000' as Hex;
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'SIM_OK' },
      { type: 'SIGNED', hash: TX },
      { type: 'ERROR', kind: 'other', hash: TX, detail: 'Still waiting.' },
      { type: 'RECEIPT_OK', summary: { hash: OTHER, period: 0n, paid: 0n, deferred: 0n, tip: 0n, count: 0 } },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.hash).toBe(TX);
  });

  // D.2 double-full-stop: the detail stripping is in PayrollCard; the machine
  // stores whatever string it receives, so just confirm the reducer is transparent.
  test('detail with trailing full stop is stored as-is in the machine', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'PRESS' },
      { type: 'ERROR', kind: 'other', detail: 'Gas limit exceeded.' },
    ]);
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.detail).toBe('Gas limit exceeded.');
  });
});
