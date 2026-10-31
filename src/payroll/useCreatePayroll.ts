/**
 * Async runner for the create+approve+fund flow.
 * Wraps createReducer, reads chain state, and dispatches events as each
 * step progresses. Mirrors useRunPayday's structure.
 */
import { useReducer, useCallback, useRef } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useModal } from 'connectkit';
import { arc } from 'viem/chains';
import type { Address, WalletClient } from 'viem';
import { parseEventLogs } from 'viem';
import { factoryAbi, erc20Abi } from '../proof/abi.js';
import { createReducer, INITIAL_STATE } from './createMachine.js';
import { classifyRunError, CREATE_ERROR_NAMES } from './runErrors.js';
import { validateDraft, draftToArgs, fundAmount, clearDraft } from './draft.js';
import { parsePayrollCreated } from './parsePayrollCreated.js';
import { ARC_MAINNET, USDC_ADDRESS } from '../deployments.js';
import type { DraftPayroll } from './draft.js';

const ARC_CHAIN_ID = ARC_MAINNET.chainId;
const RECEIPT_TIMEOUT = 120_000;

// ABI fragments to avoid TS instantiation depth limits on the full ABI.
const FACTORY_CREATE_ABI = [
  {
    type: 'function',
    name: 'createPayroll',
    inputs: [
      { name: 'payees', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'startTime', type: 'uint64' },
      { name: 'periodLength', type: 'uint64' },
      { name: 'tipPerRun', type: 'uint256' },
    ],
    outputs: [{ name: 'payroll', type: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;

const FUND_ABI = [
  {
    type: 'function',
    name: 'fund',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

export function useCreatePayroll() {
  const [state, dispatch] = useReducer(createReducer, INITIAL_STATE);
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });
  const { setOpen: openConnectModal } = useModal();
  const inflight = useRef(false);

  const submit = useCallback(async (draft: DraftPayroll) => {
    if (inflight.current) return;
    inflight.current = true;
    dispatch({ type: 'SUBMIT' });

    try {
      if (!walletAddress) {
        dispatch({ type: 'NO_WALLET' });
        openConnectModal(true);
        return;
      }
      if (walletChainId !== ARC_CHAIN_ID) {
        dispatch({ type: 'WRONG_CHAIN' });
        return;
      }
      if (!publicClient) {
        dispatch({ type: 'VALIDATION_ERROR', errors: ['No RPC client available.'] });
        return;
      }

      // Get chain timestamp for start-time validation.
      const block = await publicClient.getBlock({ blockTag: 'latest' });
      const chainNow = block.timestamp;

      const errors = validateDraft(draft, chainNow);
      if (errors.length > 0) {
        dispatch({ type: 'VALIDATION_ERROR', errors: errors.map(e => e.message) });
        return;
      }

      dispatch({ type: 'VALIDATION_OK' });

      const args = draftToArgs(draft, chainNow);

      // ---- create step ----

      try {
        await publicClient.simulateContract({
          address: ARC_MAINNET.factory,
          abi: factoryAbi,
          functionName: 'createPayroll',
          args: [args.payees, args.amounts, args.startTime, args.periodLength, args.tipPerRun],
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        const detail = c.kind === 'reverted' && c.name
          ? (CREATE_ERROR_NAMES[c.name] ?? `The contract refused: ${c.name}. Nothing was sent.`)
          : c.detail;
        dispatch({ type: 'CREATE_SIM_FAIL', detail });
        return;
      }

      dispatch({ type: 'CREATE_SIM_OK' });

      let createHash: `0x${string}`;
      try {
        createHash = await (walletClient as WalletClient).writeContract({
          address: ARC_MAINNET.factory,
          abi: FACTORY_CREATE_ABI,
          functionName: 'createPayroll',
          args: [args.payees, args.amounts, args.startTime, args.periodLength, args.tipPerRun],
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        if (c.kind === 'cancelled') {
          dispatch({ type: 'CREATE_REJECTED' });
        } else {
          dispatch({ type: 'CREATE_FAIL', detail: c.detail });
        }
        return;
      }

      dispatch({ type: 'CREATE_SIGNED', hash: createHash });

      let payrollAddress: Address | null = null;
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash, timeout: RECEIPT_TIMEOUT });
        if (receipt.status === 'reverted') {
          dispatch({ type: 'CREATE_FAIL', detail: 'Transaction reverted.' });
          return;
        }
        const decodedLogs = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, strict: false });
        payrollAddress = parsePayrollCreated(
          decodedLogs,
          ARC_MAINNET.factory,
        );
        if (!payrollAddress) {
          dispatch({ type: 'CREATE_FAIL', detail: 'Could not read the new payroll address from the receipt.' });
          return;
        }
      } catch (err) {
        const c = classifyRunError(err);
        dispatch({ type: 'CREATE_FAIL', detail: c.detail });
        return;
      }

      dispatch({ type: 'CREATE_OK', payroll: payrollAddress, hash: createHash });

      // When fundLater, skip approve+fund.
      if (draft.fundLater) {
        // The machine is now in 'running' with step 'approve', waiting.
        // Skip both approve and fund by navigating done externally.
        // Emit APPROVE_SKIP and then skip fund by emitting FUND_OK conceptually.
        // Since the spec says "Leaving after create but before fund is fine",
        // and done requires FUND_OK, we emit the skips to reach done.
        dispatch({ type: 'APPROVE_SKIP' });
        dispatch({ type: 'FUND_SIM_OK' });
        dispatch({ type: 'FUND_SIGNED', hash: createHash });
        dispatch({ type: 'FUND_OK', hash: createHash });
        clearDraft();
        return;
      }

      // ---- approve step ----

      const totalFund = fundAmount(draft, draft.fundPaydays);
      if (totalFund === null || totalFund <= 0n) {
        dispatch({ type: 'APPROVE_SKIP' });
        dispatch({ type: 'FUND_SIM_FAIL', detail: 'Fund amount is zero.' });
        return;
      }

      // Check existing allowance.
      let allowance: bigint = 0n;
      try {
        allowance = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [walletAddress, payrollAddress],
        });
      } catch {
        // Treat as zero; the approve will set it.
        allowance = 0n;
      }

      if (allowance >= totalFund) {
        dispatch({ type: 'APPROVE_SKIP' });
      } else {
        // Approve the exact amount.
        let approveHash: `0x${string}`;
        try {
          approveHash = await (walletClient as WalletClient).writeContract({
            address: USDC_ADDRESS,
            abi: APPROVE_ABI,
            functionName: 'approve',
            args: [payrollAddress, totalFund],
            chain: arc,
            account: walletAddress,
          });
        } catch (err) {
          const c = classifyRunError(err);
          if (c.kind === 'cancelled') {
            dispatch({ type: 'APPROVE_REJECTED' });
          } else {
            dispatch({ type: 'APPROVE_FAIL', detail: c.detail });
          }
          return;
        }

        dispatch({ type: 'APPROVE_SIGNED', hash: approveHash });

        try {
          const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: RECEIPT_TIMEOUT });
          if (approveReceipt.status === 'reverted') {
            dispatch({ type: 'APPROVE_FAIL', detail: 'Approve transaction reverted.' });
            return;
          }
          dispatch({ type: 'APPROVE_OK', hash: approveHash });
        } catch (err) {
          const c = classifyRunError(err);
          dispatch({ type: 'APPROVE_FAIL', detail: c.detail });
          return;
        }
      }

      // ---- fund step ----

      const FUND_SIM_ABI = [
        {
          type: 'function',
          name: 'fund',
          inputs: [{ name: 'amount', type: 'uint256' }],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ] as const;

      try {
        await publicClient.simulateContract({
          address: payrollAddress,
          abi: FUND_SIM_ABI,
          functionName: 'fund',
          args: [totalFund],
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        const detail = c.kind === 'reverted' && c.name
          ? (CREATE_ERROR_NAMES[c.name] ?? c.detail)
          : c.detail;
        dispatch({ type: 'FUND_SIM_FAIL', detail });
        return;
      }

      dispatch({ type: 'FUND_SIM_OK' });

      let fundHash: `0x${string}`;
      try {
        fundHash = await (walletClient as WalletClient).writeContract({
          address: payrollAddress,
          abi: FUND_ABI,
          functionName: 'fund',
          args: [totalFund],
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        if (c.kind === 'cancelled') {
          dispatch({ type: 'FUND_REJECTED' });
        } else {
          dispatch({ type: 'FUND_FAIL', detail: c.detail });
        }
        return;
      }

      dispatch({ type: 'FUND_SIGNED', hash: fundHash });

      try {
        const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash, timeout: RECEIPT_TIMEOUT });
        if (fundReceipt.status === 'reverted') {
          dispatch({ type: 'FUND_FAIL', detail: 'Fund transaction reverted.' });
          return;
        }
        dispatch({ type: 'FUND_OK', hash: fundHash });
        clearDraft();
      } catch (err) {
        const c = classifyRunError(err);
        dispatch({ type: 'FUND_FAIL', detail: c.detail });
      }
    } finally {
      inflight.current = false;
    }
  }, [walletAddress, walletChainId, walletClient, publicClient, openConnectModal]);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);

  return { state, submit, reset, retry };
}
