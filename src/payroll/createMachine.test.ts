import { describe, test, expect } from 'bun:test';
import { createReducer, INITIAL_STATE } from './createMachine.js';
import type { CreateState, CreateEvent } from './createMachine.js';
import type { Hex, Address } from 'viem';

const TX = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as Hex;
const TX2 = '0xbbbb000000000000000000000000000000000000000000000000000000000002' as Hex;
const TX3 = '0xcccc000000000000000000000000000000000000000000000000000000000003' as Hex;
const PAYROLL = '0xDEADBEEF00000000000000000000000000000001' as Address;

function apply(state: CreateState, events: CreateEvent[]): CreateState {
  return events.reduce(createReducer, state);
}

describe('createMachine', () => {
  test('initial state is idle', () => {
    expect(INITIAL_STATE.kind).toBe('idle');
  });

  test('SUBMIT from idle -> validating', () => {
    const s = apply(INITIAL_STATE, [{ type: 'SUBMIT' }]);
    expect(s.kind).toBe('validating');
  });

  test('VALIDATION_ERROR -> validation_error', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_ERROR', errors: ['Add at least one payee.'] },
    ]);
    expect(s.kind).toBe('validation_error');
    if (s.kind === 'validation_error') expect(s.errors).toContain('Add at least one payee.');
  });

  test('SUBMIT again after validation_error -> validating again', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_ERROR', errors: ['err'] },
      { type: 'SUBMIT' },
    ]);
    expect(s.kind).toBe('validating');
  });

  test('NO_WALLET from validating -> needs_wallet', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'NO_WALLET' },
    ]);
    expect(s.kind).toBe('needs_wallet');
  });

  test('WRONG_CHAIN from validating -> wrong_chain', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'WRONG_CHAIN' },
    ]);
    expect(s.kind).toBe('wrong_chain');
  });

  test('full create -> approve -> fund flow without skip', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_SIGNED', hash: TX },
      { type: 'CREATE_OK', payroll: PAYROLL, hash: TX },
      // approve step starts waiting; runner sets signing
      { type: 'APPROVE_SIGNED', hash: TX2 },
      { type: 'APPROVE_OK', hash: TX2 },
      { type: 'FUND_SIM_OK' },
      { type: 'FUND_SIGNED', hash: TX3 },
      { type: 'FUND_OK', hash: TX3 },
    ]);
    expect(s.kind).toBe('done');
    if (s.kind === 'done') expect(s.payroll).toBe(PAYROLL);
  });

  test('approve step is skipped when APPROVE_SKIP fires', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_SIGNED', hash: TX },
      { type: 'CREATE_OK', payroll: PAYROLL, hash: TX },
      { type: 'APPROVE_SKIP' },
      { type: 'FUND_SIM_OK' },
      { type: 'FUND_SIGNED', hash: TX3 },
      { type: 'FUND_OK', hash: TX3 },
    ]);
    expect(s.kind).toBe('done');
    if (s.kind === 'running') expect(s.skipApprove).toBe(true);
  });

  test('CREATE_REJECTED -> failed with resumable true', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_REJECTED' },
    ]);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') {
      expect(s.stepStatus.kind).toBe('failed');
      if (s.stepStatus.kind === 'failed') expect(s.stepStatus.resumable).toBe(true);
    }
  });

  test('RETRY from failed resumable resets stepStatus to waiting', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_REJECTED' },
      { type: 'RETRY' },
    ]);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') expect(s.stepStatus.kind).toBe('waiting');
  });

  test('failure then resume then complete (create cancelled, retry, done)', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_REJECTED' },
      { type: 'RETRY' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_SIGNED', hash: TX },
      { type: 'CREATE_OK', payroll: PAYROLL, hash: TX },
      { type: 'APPROVE_SKIP' },
      { type: 'FUND_SIM_OK' },
      { type: 'FUND_SIGNED', hash: TX3 },
      { type: 'FUND_OK', hash: TX3 },
    ]);
    expect(s.kind).toBe('done');
  });

  test('FUND_REJECTED -> failed with resumable true', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_SIGNED', hash: TX },
      { type: 'CREATE_OK', payroll: PAYROLL, hash: TX },
      { type: 'APPROVE_SKIP' },
      { type: 'FUND_SIM_OK' },
      { type: 'FUND_REJECTED' },
    ]);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') {
      expect(s.step).toBe('fund');
      if (s.stepStatus.kind === 'failed') expect(s.stepStatus.resumable).toBe(true);
    }
  });

  test('CREATE_SIM_FAIL -> failed non-resumable (sim failure is a hard stop)', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_FAIL', detail: 'TooManyPayees' },
    ]);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') {
      if (s.stepStatus.kind === 'failed') expect(s.stepStatus.resumable).toBe(false);
    }
  });

  test('RESET from any state returns idle', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'RESET' },
    ]);
    expect(s.kind).toBe('idle');
  });

  test('APPROVE_REJECTED -> failed, RETRY -> waiting on approve', () => {
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'CREATE_SIM_OK' },
      { type: 'CREATE_SIGNED', hash: TX },
      { type: 'CREATE_OK', payroll: PAYROLL, hash: TX },
      { type: 'APPROVE_REJECTED' },
      { type: 'RETRY' },
    ]);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') {
      expect(s.step).toBe('approve');
      expect(s.stepStatus.kind).toBe('waiting');
    }
  });

  test('events on wrong step are ignored', () => {
    // FUND_OK while still on create step should be ignored.
    const s = apply(INITIAL_STATE, [
      { type: 'SUBMIT' },
      { type: 'VALIDATION_OK' },
      { type: 'FUND_OK', hash: TX3 },
    ]);
    expect(s.kind).toBe('running');
    if (s.kind === 'running') expect(s.step).toBe('create');
  });
});
