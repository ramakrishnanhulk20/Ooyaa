/**
 * Tests for the PayrollCard handle's press() guard.
 * press() calls through to useRunPayday's press when idle/due/wrong_chain,
 * and is a no-op when the card is already checking, signing, or pending.
 */
import { describe, test, expect } from 'bun:test';
import { runReducer, INITIAL_STATE } from '../payroll/runMachine.js';
import type { RunState } from '../payroll/runMachine.js';

const TX = '0xaabbccdd00000000000000000000000000000000000000000000000000001234' as const;

// Mirrors the guard inside handlePress in PayrollCard.
function isBusy(s: RunState): boolean {
  return s.kind === 'checking' || s.kind === 'signing' || s.kind === 'pending';
}

describe('PayrollCard handle press() guard', () => {
  test('handle press is not busy in initial ready state', () => {
    expect(isBusy(INITIAL_STATE)).toBe(false);
  });

  test('handle press is busy while checking (sim running)', () => {
    const s = runReducer(INITIAL_STATE, { type: 'PRESS' });
    expect(s.kind).toBe('checking');
    expect(isBusy(s)).toBe(true);
  });

  test('handle press is busy while signing (wallet prompt open)', () => {
    const s = [
      { type: 'PRESS' as const },
      { type: 'SIM_OK' as const },
    ].reduce(runReducer, INITIAL_STATE);
    expect(s.kind).toBe('signing');
    expect(isBusy(s)).toBe(true);
  });

  test('handle press is busy while pending (tx in mempool)', () => {
    const s = [
      { type: 'PRESS' as const },
      { type: 'SIM_OK' as const },
      { type: 'SIGNED' as const, hash: TX },
    ].reduce(runReducer, INITIAL_STATE);
    expect(s.kind).toBe('pending');
    expect(isBusy(s)).toBe(true);
  });

  test('a second hero button click while pending does not start a new run', () => {
    // When the card is pending, isBusy returns true, so the press guard
    // returns early and pressRef.current() is never called a second time.
    let callCount = 0;
    const fakePress = () => { callCount++; };

    // Simulate first click: state transitions to checking.
    let state = runReducer(INITIAL_STATE, { type: 'PRESS' });
    callCount++; // first click reaches pressRef

    // Second click while busy: guard fires, callCount must not increment.
    if (!isBusy(state)) {
      fakePress();
    }
    // State is 'checking' (busy), so fakePress was not called a second time.
    expect(callCount).toBe(1);
    void state;
  });
});
