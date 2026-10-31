/**
 * Pure reducer for the create+approve+fund flow.
 * Mirrors runMachine's design: no side-effects, no async, no RPC imports.
 * Steps: create -> approve (skippable) -> fund -> done.
 */
import type { Hex, Address } from 'viem';

// ---- Step type ----

export type CreateStep = 'create' | 'approve' | 'fund';

// ---- Per-step state ----

export type StepStatus =
  | { kind: 'waiting' }
  | { kind: 'signing' }
  | { kind: 'pending'; hash: Hex }
  | { kind: 'done'; hash: Hex }
  | { kind: 'failed'; detail: string; resumable: boolean };

export type CreateState =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'validation_error'; errors: string[] }
  | { kind: 'needs_wallet' }
  | { kind: 'wrong_chain' }
  | { kind: 'running'; step: CreateStep; stepStatus: StepStatus; payroll: Address | null; skipApprove: boolean }
  | { kind: 'done'; payroll: Address };

// ---- Events ----

export type CreateEvent =
  | { type: 'SUBMIT' }
  | { type: 'VALIDATION_OK' }
  | { type: 'VALIDATION_ERROR'; errors: string[] }
  | { type: 'NO_WALLET' }
  | { type: 'WRONG_CHAIN' }
  | { type: 'CHAIN_OK' }
  // create step
  | { type: 'CREATE_SIM_OK' }
  | { type: 'CREATE_SIM_FAIL'; detail: string }
  | { type: 'CREATE_SIGNED'; hash: Hex }
  | { type: 'CREATE_REJECTED' }
  | { type: 'CREATE_OK'; payroll: Address; hash: Hex }
  | { type: 'CREATE_FAIL'; detail: string }
  // approve step
  | { type: 'APPROVE_SKIP' }
  | { type: 'APPROVE_SIGNED'; hash: Hex }
  | { type: 'APPROVE_REJECTED' }
  | { type: 'APPROVE_OK'; hash: Hex }
  | { type: 'APPROVE_FAIL'; detail: string }
  // fund step
  | { type: 'FUND_SIM_OK' }
  | { type: 'FUND_SIM_FAIL'; detail: string }
  | { type: 'FUND_SIGNED'; hash: Hex }
  | { type: 'FUND_REJECTED' }
  | { type: 'FUND_OK'; hash: Hex }
  | { type: 'FUND_FAIL'; detail: string }
  // retry / reset
  | { type: 'RETRY' }
  | { type: 'RESET' };

export const INITIAL_STATE: CreateState = { kind: 'idle' };

export function createReducer(state: CreateState, event: CreateEvent): CreateState {
  switch (event.type) {
    case 'SUBMIT':
      if (state.kind === 'idle' || state.kind === 'validation_error') {
        return { kind: 'validating' };
      }
      return state;

    case 'VALIDATION_ERROR':
      if (state.kind === 'validating') {
        return { kind: 'validation_error', errors: event.errors };
      }
      return state;

    case 'NO_WALLET':
      if (state.kind === 'validating') return { kind: 'needs_wallet' };
      return state;

    case 'WRONG_CHAIN':
      if (state.kind === 'validating') return { kind: 'wrong_chain' };
      return state;

    case 'VALIDATION_OK':
      if (state.kind === 'validating') {
        return {
          kind: 'running',
          step: 'create',
          stepStatus: { kind: 'waiting' },
          payroll: null,
          skipApprove: false,
        };
      }
      return state;

    // ---- create ----

    case 'CREATE_SIM_OK':
      if (state.kind === 'running' && state.step === 'create' && state.stepStatus.kind === 'waiting') {
        return { ...state, stepStatus: { kind: 'signing' } };
      }
      return state;

    case 'CREATE_SIM_FAIL':
      if (state.kind === 'running' && state.step === 'create') {
        return { ...state, stepStatus: { kind: 'failed', detail: event.detail, resumable: false } };
      }
      return state;

    case 'CREATE_SIGNED':
      if (state.kind === 'running' && state.step === 'create' && state.stepStatus.kind === 'signing') {
        return { ...state, stepStatus: { kind: 'pending', hash: event.hash } };
      }
      return state;

    case 'CREATE_REJECTED':
      if (state.kind === 'running' && state.step === 'create' && state.stepStatus.kind === 'signing') {
        return { ...state, stepStatus: { kind: 'failed', detail: 'You cancelled. Nothing was signed.', resumable: true } };
      }
      return state;

    case 'CREATE_OK':
      if (state.kind === 'running' && state.step === 'create') {
        // Move to approve step immediately; the runner decides whether to skip it.
        return {
          ...state,
          payroll: event.payroll,
          stepStatus: { kind: 'done', hash: event.hash },
          step: 'approve',
          // stepStatus for the new step starts as waiting; the runner emits APPROVE_SKIP
          // synchronously if allowance is sufficient.
        };
      }
      return state;

    case 'CREATE_FAIL':
      if (state.kind === 'running' && state.step === 'create') {
        return { ...state, stepStatus: { kind: 'failed', detail: event.detail, resumable: true } };
      }
      return state;

    // ---- approve ----

    case 'APPROVE_SKIP':
      if (state.kind === 'running' && state.step === 'approve') {
        return { ...state, skipApprove: true, step: 'fund', stepStatus: { kind: 'waiting' } };
      }
      return state;

    case 'APPROVE_SIGNED':
      if (state.kind === 'running' && state.step === 'approve' && state.stepStatus.kind === 'signing') {
        return { ...state, stepStatus: { kind: 'pending', hash: event.hash } };
      }
      return state;

    case 'APPROVE_REJECTED':
      if (state.kind === 'running' && state.step === 'approve') {
        return { ...state, stepStatus: { kind: 'failed', detail: 'You cancelled. Nothing was signed.', resumable: true } };
      }
      return state;

    case 'APPROVE_OK':
      if (state.kind === 'running' && state.step === 'approve') {
        return { ...state, step: 'fund', stepStatus: { kind: 'waiting' } };
      }
      return state;

    case 'APPROVE_FAIL':
      if (state.kind === 'running' && state.step === 'approve') {
        return { ...state, stepStatus: { kind: 'failed', detail: event.detail, resumable: true } };
      }
      return state;

    // ---- fund ----

    case 'FUND_SIM_OK':
      if (state.kind === 'running' && state.step === 'fund' && state.stepStatus.kind === 'waiting') {
        return { ...state, stepStatus: { kind: 'signing' } };
      }
      return state;

    case 'FUND_SIM_FAIL':
      if (state.kind === 'running' && state.step === 'fund') {
        return { ...state, stepStatus: { kind: 'failed', detail: event.detail, resumable: true } };
      }
      return state;

    case 'FUND_SIGNED':
      if (state.kind === 'running' && state.step === 'fund' && state.stepStatus.kind === 'signing') {
        return { ...state, stepStatus: { kind: 'pending', hash: event.hash } };
      }
      return state;

    case 'FUND_REJECTED':
      if (state.kind === 'running' && state.step === 'fund') {
        return { ...state, stepStatus: { kind: 'failed', detail: 'You cancelled. Nothing was signed.', resumable: true } };
      }
      return state;

    case 'FUND_OK':
      if (state.kind === 'running' && state.step === 'fund') {
        // Done: payroll is set from the create step.
        if (state.payroll) {
          return { kind: 'done', payroll: state.payroll };
        }
        // Shouldn't happen in a valid flow, but treat as done anyway.
        return state;
      }
      return state;

    case 'FUND_FAIL':
      if (state.kind === 'running' && state.step === 'fund') {
        return { ...state, stepStatus: { kind: 'failed', detail: event.detail, resumable: true } };
      }
      return state;

    // ---- retry / reset ----

    case 'RETRY': {
      // Resume from the current failing step.
      if (state.kind === 'running' && state.stepStatus.kind === 'failed' && state.stepStatus.resumable) {
        // The approve step re-checks allowance and may skip again.
        return { ...state, stepStatus: { kind: 'waiting' } };
      }
      return state;
    }

    case 'RESET':
      return { kind: 'idle' };

    default:
      return state;
  }
}
