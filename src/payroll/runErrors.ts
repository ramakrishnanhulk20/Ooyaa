import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  InsufficientFundsError,
} from 'viem';

/**
 * Maps factory.createPayroll revert error names to user-visible messages.
 * Covers all custom errors declared in PaydayFactory.sol.
 */
export const CREATE_ERROR_NAMES: Record<string, string> = {
  EmptyPayeeList:        'Add at least one payee.',
  TooManyPayees:         'At most 100 payees.',
  ZeroPayee:             'A payee address is empty.',
  DuplicatePayee:        'That payee is listed twice.',
  PayeeIsUsdc:           'A payee cannot be the USDC contract.',
  ZeroAmount:            'Every amount must be above 0.',
  AmountTooLarge:        'At most 1,000,000 USDC per payee.',
  StartTimeTooEarly:     'The first payday must be in the future. Pick a later time.',
  StartTimeTooLate:      'The first payday must be within 365 days.',
  PeriodLengthTooShort:  'Pick a pay period from 1 minute to 366 days.',
  PeriodLengthTooLong:   'Pick a pay period from 1 minute to 366 days.',
  TipTooLarge:           'The tip can be at most 10 USDC.',
  ZeroFundAmount:        'Fund more than 0.',
};

export type RunErrorKind = 'cancelled' | 'reverted' | 'no_gas' | 'other';

export type ClassifiedRunError = {
  kind: RunErrorKind;
  /** Decoded Solidity errorName, e.g. "NothingDue", or empty string. */
  name: string;
  /** At most 80 characters, no stack. */
  detail: string;
};

function cap(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

/**
 * Classifies any error thrown by simulateContract, estimateContractGas,
 * or writeContract into a user-visible category.
 *
 * Viem wraps wallet and RPC errors several layers deep:
 *   ContractFunctionExecutionError > TransactionExecutionError > <leaf>
 * Walking the cause chain instead of checking the outermost type ensures
 * cancel and no-gas are detected even when they arrive wrapped.
 * The walk order matters: check cancel first so a wallet that rejects
 * due to funds is not reported as no_gas.
 */
export function classifyRunError(err: unknown): ClassifiedRunError {
  if (err instanceof BaseError) {
    if (err.walk(e => e instanceof UserRejectedRequestError) instanceof UserRejectedRequestError) {
      return { kind: 'cancelled', name: '', detail: 'You cancelled. Nothing was sent.' };
    }

    if (err.walk(e => e instanceof InsufficientFundsError) instanceof InsufficientFundsError) {
      return { kind: 'no_gas', name: '', detail: 'Your wallet needs USDC on Arc for gas, about 0.004 USDC.' };
    }

    const revertNode = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertNode instanceof ContractFunctionRevertedError) {
      const name = revertNode.data?.errorName ?? '';
      return {
        kind: 'reverted',
        name,
        detail: cap(revertNode.shortMessage || name || 'reverted'),
      };
    }

    return {
      kind: 'other',
      name: '',
      detail: cap(err.shortMessage || err.message),
    };
  }

  if (err instanceof Error) {
    return { kind: 'other', name: '', detail: cap(err.message) };
  }

  return { kind: 'other', name: '', detail: 'Unknown error.' };
}
