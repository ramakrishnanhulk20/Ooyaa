/**
 * useHistory(payroll, fromBlock): shared React hook for all payroll history.
 * consumers on the browser (EveryPayslip, YourPayslips, the card's lastPaidRun,
 * and the proof page).
 *
 * All callers share a single react-query cache entry under
 * ['history', payroll.toLowerCase()]. On a refetch the hook reads the current
 * chain head, fetches only blocks after the cached horizon, and merges the result
 * so the full range is available without re-reading blocks already cached.
 *
 * staleTime: 60 s.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Address } from 'viem';
import { mainnetClient } from './clients.js';
import { readHistory } from './history.js';
import type { PayrollHistory } from './history.js';

export type UseHistoryResult = {
  history: PayrollHistory | undefined;
  sourceUsed: string | undefined;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: Error | null;
  refetch: () => void;
};

/**
 * Returns the cached history for a payroll and keeps it fresh with incremental
 * block fetches. fromBlock is the deployment block of the payroll.
 */
export function useHistory(payroll: Address, fromBlock: bigint): UseHistoryResult {
  const queryClient = useQueryClient();
  // Stable lower-case key so all components sharing the same payroll share one entry.
  const key = payroll.toLowerCase();

  const { data, status, error } = useQuery<{ history: PayrollHistory; sourceUsed: string }, Error>({
    queryKey: ['history', key],
    queryFn: async () => {
      // Read the current chain head to bound the fetch.
      const toBlock = await mainnetClient.getBlockNumber();

      // Check if the cache already has a history we can build on.
      const existing = queryClient.getQueryData<{ history: PayrollHistory; sourceUsed: string }>(['history', key]);
      const prev = existing?.history;

      return readHistory(payroll, fromBlock, toBlock, undefined, prev);
    },
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['history', key] });
  }, [queryClient, key]);

  return {
    history: data?.history,
    sourceUsed: data?.sourceUsed,
    status: status === 'pending' ? 'loading' : status,
    error: error ?? null,
    refetch,
  };
}
