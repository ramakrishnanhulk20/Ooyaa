/**
 * Employer panel for /p/:address.
 * Shown only when the connected wallet matches the payroll's employer field.
 * Provides three actions: fund more, withdraw free balance, close the payroll.
 * Every action simulates first and explains the outcome before the wallet signs.
 */
import { useState, useRef, useCallback } from 'react';
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useReadContracts,
} from 'wagmi';
import { getAddress } from 'viem';
import type { Address, WalletClient } from 'viem';
import { arc } from 'viem/chains';
import { toast } from 'sonner';
import { payrollAbi, erc20Abi } from '../../proof/abi.js';
import { classifyRunError } from '../../payroll/runErrors.js';
import { formatUsdc } from '../../payroll/format.js';
import { ARC_MAINNET, USDC_ADDRESS } from '../../deployments.js';
import type { PayrollContractState } from '../../payroll/cardState.js';

// ABI fragments to avoid TS instantiation-depth limits on the full ABI.
const FUND_ABI = [
  {
    type: 'function',
    name: 'fund',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const WITHDRAW_ABI = [
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const CLOSE_ABI = [
  {
    type: 'function',
    name: 'close',
    inputs: [],
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

const ARC_CHAIN_ID = ARC_MAINNET.chainId;

// --- reusable sub-components ---

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.75rem',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      color: 'var(--ink-3)',
    }}>
      {children}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
      <Label>{label}</Label>
      <div style={{
        fontFamily: '"Fraunces Variable", Georgia, serif',
        fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
        fontWeight: 600,
        fontSize: '1.5rem',
        color: 'var(--ink)',
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.8125rem',
      color: 'var(--stamp)',
      marginTop: '6px',
    }}>
      {message}
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  const short = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  return (
    <a
      href={`${ARC_MAINNET.explorer}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--ink)',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.8125rem',
        textDecoration: 'underline',
      }}
    >
      {short}
    </a>
  );
}

// --- fund-more sub-panel ---

type FundPanelProps = {
  payroll: Address;
  periodTotal: bigint;
  onSuccess: () => void;
};

function FundPanel({ payroll, periodTotal, onSuccess }: FundPanelProps) {
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });

  const [rawAmount, setRawAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingHash, setPendingHash] = useState('');
  const inflight = useRef(false);

  // How many paydays the typed amount covers.
  function paydays(): number {
    if (periodTotal <= 0n) return 0;
    const parsed = parseFloat(rawAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    const units = BigInt(Math.round(parsed * 1_000_000));
    return Number(units / periodTotal);
  }

  const handleFund = useCallback(async () => {
    if (inflight.current || busy) return;
    const parsed = parseFloat(rawAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount above 0.');
      return;
    }
    const amount = BigInt(Math.round(parsed * 1_000_000));
    if (amount === 0n) {
      setError('Enter an amount above 0.');
      return;
    }

    if (!walletAddress) { setError('Connect your wallet first.'); return; }
    if (walletChainId !== ARC_CHAIN_ID) { setError('Switch to Arc first.'); return; }
    if (!publicClient) { setError('No RPC client available.'); return; }

    inflight.current = true;
    setBusy(true);
    setError('');
    setPendingHash('');

    try {
      // Check allowance; approve exact amount if needed.
      const allowance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [walletAddress, payroll],
      });

      if (allowance < amount) {
        // Simulate approve.
        try {
          await publicClient.simulateContract({
            address: USDC_ADDRESS,
            abi: APPROVE_ABI,
            functionName: 'approve',
            args: [payroll, amount],
            account: walletAddress,
          });
        } catch (err) {
          const c = classifyRunError(err);
          setError(c.detail);
          return;
        }

        let appHash: `0x${string}`;
        try {
          appHash = await (walletClient as WalletClient).writeContract({
            address: USDC_ADDRESS,
            abi: APPROVE_ABI,
            functionName: 'approve',
            args: [payroll, amount],
            chain: arc,
            account: walletAddress,
          });
        } catch (err) {
          const c = classifyRunError(err);
          setError(c.kind === 'cancelled' ? 'You cancelled. Nothing was sent.' : c.detail);
          return;
        }
        await publicClient.waitForTransactionReceipt({ hash: appHash, confirmations: 1, timeout: 120_000 });
      }

      // Simulate fund.
      try {
        await publicClient.simulateContract({
          address: payroll,
          abi: FUND_ABI,
          functionName: 'fund',
          args: [amount],
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        const msg = c.kind === 'reverted' && c.name === 'ZeroFundAmount'
          ? 'Fund more than 0.'
          : c.detail;
        setError(msg);
        return;
      }

      let hash: `0x${string}`;
      try {
        hash = await (walletClient as WalletClient).writeContract({
          address: payroll,
          abi: FUND_ABI,
          functionName: 'fund',
          args: [amount],
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        setError(c.kind === 'cancelled' ? 'You cancelled. Nothing was sent.' : c.detail);
        return;
      }

      setPendingHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });

      if (receipt.status === 'reverted') {
        setError('Transaction reverted. Nothing was sent.');
        return;
      }

      toast.success(
        <span>Funded {formatUsdc(amount)}. <TxLink hash={hash} /></span> as React.ReactNode,
      );
      setRawAmount('');
      setPendingHash('');
      onSuccess();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [rawAmount, walletAddress, walletChainId, publicClient, walletClient, payroll, onSuccess, busy]);

  const pd = paydays();

  return (
    <div>
      <div style={{ fontSize: '0.875rem', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', color: 'var(--ink-2)', marginBottom: '10px', fontWeight: 500 }}>
        Fund more
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <input
            type="number"
            min="0"
            step="0.000001"
            placeholder="USDC amount"
            value={rawAmount}
            onChange={e => { setRawAmount(e.target.value); setError(''); }}
            style={{
              height: '40px',
              borderRadius: '8px',
              border: '1px solid var(--rule)',
              background: 'var(--slip)',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              padding: '0 10px',
              width: '100%',
              boxSizing: 'border-box' as const,
              outline: 'none',
            }}
          />
          {pd > 0 && (
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '4px' }}>
              Covers {pd} more {pd === 1 ? 'payday' : 'paydays'}
            </div>
          )}
          {error && <ErrorLine message={error} />}
          {pendingHash && !error && (
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '4px' }}>
              Pending <TxLink hash={pendingHash} />
            </div>
          )}
        </div>
        <button
          onClick={() => { void handleFund(); }}
          disabled={busy}
          className="btn-primary"
          style={{
            height: '40px',
            padding: '0 20px',
            borderRadius: '8px',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            whiteSpace: 'nowrap' as const,
          }}
        >
          {busy ? 'Sending...' : 'Fund'}
        </button>
      </div>
    </div>
  );
}

// --- withdraw sub-panel ---

type WithdrawPanelProps = {
  payroll: Address;
  freeBalance: bigint;
  onSuccess: () => void;
};

function WithdrawPanel({ payroll, freeBalance, onSuccess }: WithdrawPanelProps) {
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });

  const [rawAmount, setRawAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingHash, setPendingHash] = useState('');
  const inflight = useRef(false);

  function setMax() {
    setRawAmount((Number(freeBalance) / 1_000_000).toFixed(6).replace(/\.?0+$/, ''));
    setError('');
  }

  const handleWithdraw = useCallback(async () => {
    if (inflight.current || busy) return;
    const parsed = parseFloat(rawAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount above 0.');
      return;
    }
    const amount = BigInt(Math.round(parsed * 1_000_000));
    if (amount === 0n) {
      setError('Enter an amount above 0.');
      return;
    }

    if (!walletAddress) { setError('Connect your wallet first.'); return; }
    if (walletChainId !== ARC_CHAIN_ID) { setError('Switch to Arc first.'); return; }
    if (!publicClient) { setError('No RPC client available.'); return; }

    inflight.current = true;
    setBusy(true);
    setError('');
    setPendingHash('');

    try {
      // Simulate to catch WithdrawExceedsFree and WithdrawZero before signing.
      try {
        await publicClient.simulateContract({
          address: payroll,
          abi: WITHDRAW_ABI,
          functionName: 'withdraw',
          args: [amount],
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        if (c.kind === 'reverted' && c.name === 'WithdrawExceedsFree') {
          setError(`You can withdraw at most ${formatUsdc(freeBalance)} without leaving a due payday unpaid.`);
        } else if (c.kind === 'reverted' && c.name === 'WithdrawZero') {
          setError('Enter an amount above 0.');
        } else {
          setError(c.detail);
        }
        return;
      }

      let hash: `0x${string}`;
      try {
        hash = await (walletClient as WalletClient).writeContract({
          address: payroll,
          abi: WITHDRAW_ABI,
          functionName: 'withdraw',
          args: [amount],
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        setError(c.kind === 'cancelled' ? 'You cancelled. Nothing was sent.' : c.detail);
        return;
      }

      setPendingHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });

      if (receipt.status === 'reverted') {
        setError('Transaction reverted. Nothing was sent.');
        return;
      }

      toast.success(
        <span>Withdrew {formatUsdc(amount)}. <TxLink hash={hash} /></span> as React.ReactNode,
      );
      setRawAmount('');
      setPendingHash('');
      onSuccess();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [rawAmount, freeBalance, walletAddress, walletChainId, publicClient, walletClient, payroll, onSuccess, busy]);

  const isFull = freeBalance > 0n;

  return (
    <div>
      <div style={{ fontSize: '0.875rem', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', color: 'var(--ink-2)', marginBottom: '10px', fontWeight: 500 }}>
        Withdraw
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
        <div style={{ flex: '1 1 160px', minWidth: 0, position: 'relative' as const }}>
          <input
            type="number"
            min="0"
            step="0.000001"
            placeholder="USDC amount"
            value={rawAmount}
            onChange={e => { setRawAmount(e.target.value); setError(''); }}
            style={{
              height: '40px',
              borderRadius: '8px',
              border: '1px solid var(--rule)',
              background: isFull ? 'var(--slip)' : 'var(--paper)',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              padding: '0 48px 0 10px',
              width: '100%',
              boxSizing: 'border-box' as const,
              outline: 'none',
            }}
            disabled={!isFull}
          />
          {isFull && (
            <button
              type="button"
              onClick={setMax}
              style={{
                position: 'absolute' as const,
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.75rem',
                color: 'var(--ink)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              Max
            </button>
          )}
          {error && <ErrorLine message={error} />}
          {pendingHash && !error && (
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '4px' }}>
              Pending <TxLink hash={pendingHash} />
            </div>
          )}
        </div>
        <button
          onClick={() => { void handleWithdraw(); }}
          disabled={busy || !isFull}
          className="btn-secondary"
          style={{
            height: '40px',
            padding: '0 20px',
            borderRadius: '8px',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            cursor: busy || !isFull ? 'not-allowed' : 'pointer',
            opacity: busy || !isFull ? 0.45 : 1,
            whiteSpace: 'nowrap' as const,
          }}
        >
          {busy ? 'Sending...' : 'Withdraw'}
        </button>
      </div>
    </div>
  );
}

// --- close sub-panel ---

type ClosePanelProps = {
  payroll: Address;
  onSuccess: () => void;
};

function ClosePanel({ payroll, onSuccess }: ClosePanelProps) {
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingHash, setPendingHash] = useState('');
  const inflight = useRef(false);

  const canClose = typed === 'close';

  const handleClose = useCallback(async () => {
    if (inflight.current || busy || !canClose) return;
    if (!walletAddress) { setError('Connect your wallet first.'); return; }
    if (walletChainId !== ARC_CHAIN_ID) { setError('Switch to Arc first.'); return; }
    if (!publicClient) { setError('No RPC client available.'); return; }

    inflight.current = true;
    setBusy(true);
    setError('');
    setPendingHash('');

    try {
      try {
        await publicClient.simulateContract({
          address: payroll,
          abi: CLOSE_ABI,
          functionName: 'close',
          args: [],
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        const msg = c.kind === 'reverted' && c.name === 'AlreadyClosed'
          ? 'This payroll is already closed.'
          : c.detail;
        setError(msg);
        return;
      }

      let hash: `0x${string}`;
      try {
        hash = await (walletClient as WalletClient).writeContract({
          address: payroll,
          abi: CLOSE_ABI,
          functionName: 'close',
          args: [],
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        setError(c.kind === 'cancelled' ? 'You cancelled. Nothing was sent.' : c.detail);
        return;
      }

      setPendingHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });

      if (receipt.status === 'reverted') {
        setError('Transaction reverted. Nothing was sent.');
        return;
      }

      toast.success(
        <span>Payroll closed. <TxLink hash={hash} /></span> as React.ReactNode,
      );
      setPendingHash('');
      setConfirmOpen(false);
      setTyped('');
      onSuccess();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [canClose, walletAddress, walletChainId, publicClient, walletClient, payroll, onSuccess, busy]);

  if (!confirmOpen) {
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        style={{
          background: 'none',
          border: 'none',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: '0.875rem',
          color: 'var(--ink-2)',
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline',
        }}
        className="link-underline"
      >
        Close this payroll
      </button>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--rule)',
      borderRadius: '8px',
      padding: '20px',
      background: 'var(--slip)',
    }}>
      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontSize: '0.9375rem',
        color: 'var(--ink-2)',
        margin: '0 0 16px',
        lineHeight: 1.5,
      }}>
        No new paydays will start after you close. Paydays already due stay payable, and you can still
        fund them. This cannot be undone.
      </p>
      <label style={{
        display: 'block',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem',
        color: 'var(--ink-3)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        marginBottom: '6px',
      }}>
        Type "close" to confirm
      </label>
      <input
        type="text"
        value={typed}
        onChange={e => { setTyped(e.target.value); setError(''); }}
        placeholder="close"
        style={{
          height: '40px',
          borderRadius: '8px',
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.9375rem',
          color: 'var(--ink)',
          padding: '0 10px',
          width: '200px',
          boxSizing: 'border-box' as const,
          outline: 'none',
          marginBottom: '12px',
          display: 'block',
        }}
      />
      {error && <ErrorLine message={error} />}
      {pendingHash && !error && (
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '12px' }}>
          Pending <TxLink hash={pendingHash} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => { void handleClose(); }}
          disabled={!canClose || busy}
          style={{
            height: '40px',
            padding: '0 20px',
            borderRadius: '8px',
            border: canClose ? '2px solid var(--stamp)' : '2px solid var(--rule)',
            background: 'transparent',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            color: canClose ? 'var(--stamp)' : 'var(--ink-3)',
            cursor: canClose && !busy ? 'pointer' : 'not-allowed',
            opacity: busy ? 0.6 : 1,
            transition: 'border-color 120ms ease, color 120ms ease',
          }}
        >
          {busy ? 'Sending...' : 'Close payroll'}
        </button>
        <button
          type="button"
          onClick={() => { setConfirmOpen(false); setTyped(''); setError(''); }}
          className="btn-secondary"
          style={{
            height: '40px',
            padding: '0 16px',
            borderRadius: '8px',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- main export ---

type Props = {
  payroll: Address;
  state: PayrollContractState;
  /** Called after any successful action so the parent can refetch state. */
  onSuccess: () => void;
};

/**
 * Reads balance, owed() and freeBalance() from the contract, then renders the
 * employer panel with fund, withdraw and close actions.
 */
export function EmployerPanel({ payroll, state, onSuccess }: Props) {
  const { address: walletAddress } = useAccount();

  // Only show this panel to the employer.
  if (!walletAddress) return null;
  const isEmployer = getAddress(state.employer) === getAddress(walletAddress);
  if (!isEmployer) return null;

  // This inner component splits out so the hooks below run unconditionally.
  return <EmployerPanelInner payroll={payroll} state={state} onSuccess={onSuccess} />;
}

function EmployerPanelInner({ payroll, state, onSuccess }: Props) {
  const payrollContract = { address: payroll, abi: payrollAbi, chainId: ARC_CHAIN_ID } as const;

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...payrollContract, functionName: 'owed' },
      { ...payrollContract, functionName: 'freeBalance' },
    ],
    query: { staleTime: 10_000 },
  });

  const owed = data?.[0].status === 'success' ? data[0].result : 0n;
  const free = data?.[1].status === 'success' ? data[1].result : 0n;
  const balance = state.balance;

  function handleSuccess() {
    void refetch();
    onSuccess();
  }

  return (
    <section
      style={{
        borderTop: '1px solid var(--rule)',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--slip)',
      }}
      data-testid="employer-panel"
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '40px 48px',
        }}
        className="employer-panel-container"
      >
        {/* Heading */}
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.75rem',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          marginBottom: '8px',
        }}>
          YOU RUN THIS PAYROLL
        </div>

        {/* Key figures */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: '40px',
          marginBottom: '36px',
        }}>
          <Figure label="BALANCE" value={formatUsdc(balance)} />
          <Figure label="OWED" value={formatUsdc(owed)} />
          <Figure label="FREE TO WITHDRAW" value={formatUsdc(free)} />
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '28px',
        }}>
          <FundPanel
            payroll={payroll}
            periodTotal={state.periodTotal}
            onSuccess={handleSuccess}
          />

          {!state.closed && (
            <WithdrawPanel
              payroll={payroll}
              freeBalance={free}
              onSuccess={handleSuccess}
            />
          )}

          {!state.closed && (
            <ClosePanel
              payroll={payroll}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .employer-panel-container { padding: 32px 20px !important; }
        }
      `}</style>
    </section>
  );
}
