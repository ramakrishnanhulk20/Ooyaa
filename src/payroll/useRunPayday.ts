import { useReducer, useCallback, useRef } from 'react';
import {
  useAccount,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { useModal } from 'connectkit';
import type { Address, WalletClient } from 'viem';
import { arc } from 'viem/chains';
import { payrollAbi } from '../proof/abi.js';
import { runReducer, INITIAL_STATE } from './runMachine.js';
import { classifyRunError } from './runErrors.js';
import { summarizeRunReceipt } from './lastPaidRun.js';
import { ARC_MAINNET } from '../deployments.js';

// Minimal ABI for the run() function only.
// Using the full payrollAbi with writeContract causes TS to hit instantiation
// depth limits. This fragment gives the same on-chain behaviour.
const RUN_ABI = [
  { type: 'function', name: 'run', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const;

const ARC_CHAIN_ID = ARC_MAINNET.chainId;
const DEAD = '0x000000000000000000000000000000000000dEaD' as Address;
// After 60 s of waiting, show a "still waiting" message but keep listening
// for up to 600 s in case Arc is slow. The late receipt transitions the state
// from failed back to paid (or reverted) when it finally arrives.
const RECEIPT_WARNING_MS = 60_000;
const RECEIPT_TIMEOUT_MS = 600_000;

export function useRunPayday(payroll: Address) {
  const [runState, dispatch] = useReducer(runReducer, INITIAL_STATE);
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });
  const { setOpen: openConnectModal } = useModal();
  const qc = useQueryClient();

  const inflight = useRef(false);

  const press = useCallback(async () => {
    if (inflight.current) return;
    if (runState.kind === 'signing' || runState.kind === 'pending') return;

    inflight.current = true;
    dispatch({ type: 'PRESS' });

    try {
      if (!publicClient) {
        dispatch({ type: 'ERROR', kind: 'other', detail: 'No RPC client available.' });
        return;
      }

      const simAccount = walletAddress ?? DEAD;

      try {
        await publicClient.simulateContract({
          address: payroll,
          abi: payrollAbi,
          functionName: 'run',
          account: simAccount,
        });
      } catch (err) {
        const c = classifyRunError(err);
        if (c.kind === 'reverted') {
          dispatch({ type: 'SIM_REVERT', name: c.name, detail: c.detail });
        } else {
          dispatch({ type: 'ERROR', kind: c.kind, detail: c.detail });
        }
        return;
      }

      if (!walletAddress) {
        dispatch({ type: 'NO_WALLET' });
        openConnectModal(true);
        return;
      }

      if (walletChainId !== ARC_CHAIN_ID) {
        dispatch({ type: 'WRONG_CHAIN' });
        return;
      }

      if (!walletClient) {
        dispatch({ type: 'ERROR', kind: 'other', detail: 'Wallet client not ready.' });
        return;
      }

      let gas: bigint;
      try {
        const estimate = await publicClient.estimateContractGas({
          address: payroll,
          abi: payrollAbi,
          functionName: 'run',
          account: walletAddress,
        });
        gas = estimate * 13n / 10n;
      } catch (err) {
        const c = classifyRunError(err);
        if (c.kind === 'reverted') {
          // A race: someone else ran payday between the simulation and the estimate.
          // The contract refused, not us; nothing was sent.
          dispatch({ type: 'SIM_REVERT', name: c.name, detail: c.detail });
        } else {
          dispatch({ type: 'ERROR', kind: c.kind, detail: c.detail });
        }
        return;
      }

      dispatch({ type: 'SIM_OK' });

      let hash: `0x${string}`;
      try {
        // Cast through WalletClient to avoid TS instantiation-depth issues
        // that arise when walletClient.chain is typed as never by wagmi.
        hash = await (walletClient as WalletClient).writeContract({
          address: payroll,
          abi: RUN_ABI,
          functionName: 'run',
          gas,
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        if (c.kind === 'cancelled') {
          dispatch({ type: 'REJECTED' });
        } else {
          dispatch({ type: 'ERROR', kind: c.kind, detail: c.detail });
        }
        return;
      }

      dispatch({ type: 'SIGNED', hash });

      // Show a warning after 60 s but keep the inner receipt wait alive for 600 s.
      const warningId = setTimeout(() => {
        dispatch({ type: 'ERROR', kind: 'other', hash, detail: 'Still waiting for Arc. Check the tx link.' });
      }, RECEIPT_WARNING_MS);

      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: RECEIPT_TIMEOUT_MS });
        clearTimeout(warningId);

        if (receipt.status === 'reverted') {
          dispatch({ type: 'RECEIPT_REVERTED', hash });
          return;
        }

        const summary = summarizeRunReceipt(receipt, payroll);
        dispatch({
          type: 'RECEIPT_OK',
          summary: {
            hash: receipt.transactionHash,
            period: summary.period,
            paid: summary.paid,
            deferred: summary.totalDeferred,
            tip: summary.tip,
            count: summary.payslips.length,
          },
        });

        void qc.invalidateQueries({ queryKey: ['payrollState', payroll] });
        void qc.invalidateQueries({ queryKey: ['lastPaidRun', payroll] });
      } catch (err) {
        clearTimeout(warningId);
        const c = classifyRunError(err);
        dispatch({ type: 'ERROR', kind: c.kind, hash, detail: c.detail });
      }
    } finally {
      inflight.current = false;
    }
  }, [
    runState.kind,
    walletAddress,
    walletChainId,
    walletClient,
    publicClient,
    payroll,
    openConnectModal,
    qc,
  ]);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { runState, press, reset };
}
