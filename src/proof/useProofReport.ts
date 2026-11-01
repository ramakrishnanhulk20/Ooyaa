import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { prove } from './prove.js';
import { mainnetClient, testnetClient, archiveClient, LOG_SOURCES } from './clients.js';
import { LOCAL_RUNTIME } from '../generated/runtime.js';
import type { ProofReport } from './prove.js';
import type { CheckResult, Ledger } from './checks.js';
import type { PayrollHistory } from './history.js';
import type { Address } from 'viem';

export type ProofStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * TanStack Query v5 uses 'pending' where v4 used 'loading' / 'idle'.
 * This function normalises the raw query status to the ProofStatus the UI
 * expects, so the cast `status as ProofStatus` is no longer needed.
 */
export function toProofStatus(s: 'pending' | 'error' | 'success'): ProofStatus {
  if (s === 'pending') return 'loading';
  return s;
}

export type StreamedLedger = {
  payroll: Address;
  ledger: Ledger;
  history: PayrollHistory;
  employer: Address;
};

export function useProofReport() {
  const queryClient = useQueryClient();
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [progress, setProgress] = useState<string>('');
  const [streamedLedgers, setStreamedLedgers] = useState<StreamedLedger[]>([]);
  const [payrollCount, setPayrollCount] = useState<number | null>(null);
  // Refs accumulate during the query so callbacks are stable across re-renders.
  const checksRef = useRef<CheckResult[]>([]);
  const ledgersRef = useRef<StreamedLedger[]>([]);

  const reset = useCallback(() => {
    checksRef.current = [];
    ledgersRef.current = [];
    setChecks([]);
    setProgress('');
    setStreamedLedgers([]);
    setPayrollCount(null);
  }, []);

  const { data: report, status, error } = useQuery<ProofReport, Error>({
    queryKey: ['proofReport'],
    queryFn: async () => {
      checksRef.current = [];
      ledgersRef.current = [];
      setChecks([]);
      setProgress('');
      setStreamedLedgers([]);

      // Pass cached per-payroll histories to prove() so it can reuse them if
      // the cache has a recent enough read (handled by readHistory's prev arg).
      // prove() fetches a fresh block range and merges, so the cache is always
      // up to date after a proof run.
      return prove({
        mainnet: mainnetClient,
        testnet: testnetClient,
        archive: archiveClient,
        localRuntime: LOCAL_RUNTIME,
        onProgress: (msg) => setProgress(msg),
        onPayrolls: (ps) => setPayrollCount(ps.length),
        onCheck: (c) => {
          checksRef.current = [...checksRef.current, c];
          setChecks([...checksRef.current]);
        },
        onLedger: (l) => {
          // Cache the fetched history so useHistory() on /p/:address can reuse it.
          const histKey = ['history', l.payroll.toLowerCase()];
          queryClient.setQueryData(histKey, {
            history: l.history,
            sourceUsed: 'proof',
          });

          ledgersRef.current = [...ledgersRef.current, l];
          setStreamedLedgers([...ledgersRef.current]);
        },
        recentRunsOnly: 12,
        logSources: LOG_SOURCES,
        creationFromEvents: true,
      });
    },
    staleTime: 300_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  const rerun = useCallback(() => {
    reset();
    void queryClient.invalidateQueries({ queryKey: ['proofReport'] });
  }, [queryClient, reset]);

  return {
    report,
    checks,
    progress,
    streamedLedgers,
    payrollCount,
    status: toProofStatus(status),
    error: error ?? null,
    rerun,
  };
}
