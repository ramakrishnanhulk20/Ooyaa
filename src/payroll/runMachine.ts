import type { Hex } from 'viem';

// ---- States ----

export type RunState =
  | { kind: 'ready' }
  | { kind: 'checking' }
  | { kind: 'refused'; reason: 'already_paid' | 'underfunded' | 'other'; detail: string }
  | { kind: 'needs_wallet' }
  | { kind: 'wrong_chain' }
  | { kind: 'signing' }
  | { kind: 'pending'; hash: Hex }
  | { kind: 'paid'; hash: Hex; period: bigint; paid: bigint; deferred: bigint; tip: bigint; count: number }
  | { kind: 'failed'; reason: 'cancelled' | 'reverted' | 'no_gas' | 'other'; hash?: Hex; detail: string };

// ---- Events ----

export type RunEvent =
  | { type: 'PRESS' }
  | { type: 'SIM_OK' }
  | { type: 'SIM_REVERT'; name: string; detail: string }
  | { type: 'NO_WALLET' }
  | { type: 'WRONG_CHAIN' }
  | { type: 'SIGNED'; hash: Hex }
  | { type: 'REJECTED' }
  | { type: 'RECEIPT_OK'; summary: { hash: Hex; period: bigint; paid: bigint; deferred: bigint; tip: bigint; count: number } }
  | { type: 'RECEIPT_REVERTED'; hash: Hex }
  | { type: 'ERROR'; kind: 'cancelled' | 'reverted' | 'no_gas' | 'other'; hash?: Hex; detail: string }
  | { type: 'RESET' };

export const INITIAL_STATE: RunState = { kind: 'ready' };

// Pure reducer: no side-effects, no async, no imports of wagmi/viem classes.
export function runReducer(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'PRESS':
      if (
        state.kind === 'ready' ||
        state.kind === 'refused' ||
        state.kind === 'needs_wallet' ||
        state.kind === 'wrong_chain'
      ) {
        return { kind: 'checking' };
      }
      return state;

    case 'SIM_OK':
      if (state.kind === 'checking') return { kind: 'signing' };
      return state;

    case 'SIM_REVERT':
      if (state.kind !== 'checking') return state;
      if (event.name === 'NothingDue') {
        return { kind: 'refused', reason: 'already_paid', detail: event.detail };
      }
      if (event.name === 'Underfunded') {
        return { kind: 'refused', reason: 'underfunded', detail: event.detail };
      }
      return { kind: 'refused', reason: 'other', detail: event.detail };

    case 'NO_WALLET':
      // Wallet and chain checks happen before SIM_OK, so only checking is valid here.
      if (state.kind === 'checking') return { kind: 'needs_wallet' };
      return state;

    case 'WRONG_CHAIN':
      if (state.kind === 'checking') return { kind: 'wrong_chain' };
      return state;

    case 'SIGNED':
      if (state.kind === 'signing') return { kind: 'pending', hash: event.hash };
      return state;

    case 'REJECTED':
      if (state.kind === 'signing') {
        return { kind: 'failed', reason: 'cancelled', detail: 'You cancelled. Nothing was sent.' };
      }
      return state;

    case 'RECEIPT_OK':
      if (state.kind === 'pending') {
        return {
          kind: 'paid',
          hash: event.summary.hash,
          period: event.summary.period,
          paid: event.summary.paid,
          deferred: event.summary.deferred,
          tip: event.summary.tip,
          count: event.summary.count,
        };
      }
      // A receipt arriving after the 60s ERROR (reason 'other') is still valid
      // when the hash matches the one we dispatched -- the tx landed eventually.
      if (
        state.kind === 'failed' &&
        state.reason === 'other' &&
        state.hash === event.summary.hash
      ) {
        return {
          kind: 'paid',
          hash: event.summary.hash,
          period: event.summary.period,
          paid: event.summary.paid,
          deferred: event.summary.deferred,
          tip: event.summary.tip,
          count: event.summary.count,
        };
      }
      return state;

    case 'RECEIPT_REVERTED':
      if (state.kind === 'pending') {
        return { kind: 'failed', reason: 'reverted', hash: event.hash, detail: '' };
      }
      // Same late-receipt handling for a reverted tx.
      if (
        state.kind === 'failed' &&
        state.reason === 'other' &&
        state.hash === event.hash
      ) {
        return { kind: 'failed', reason: 'reverted', hash: event.hash, detail: '' };
      }
      return state;

    case 'ERROR':
      if (state.kind === 'signing' || state.kind === 'pending' || state.kind === 'checking') {
        return { kind: 'failed', reason: event.kind, hash: event.hash, detail: event.detail };
      }
      return state;

    case 'RESET':
      return { kind: 'ready' };

    default:
      return state;
  }
}
