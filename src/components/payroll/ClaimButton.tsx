/**
 * "Claim <amount> USDC" button for payees with held pay on a payroll.
 * Simulates claim() before asking the wallet to sign, per the Turn 14 pattern.
 * Shown only when claimable > 0n.
 */
import { useCallback, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { arc } from 'viem/chains';
import type { Address, WalletClient } from 'viem';
import { toast } from 'sonner';
import { payrollAbi } from '../../proof/abi.js';
import { classifyRunError } from '../../payroll/runErrors.js';
import { formatUsdc } from '../../payroll/format.js';
import { ARC_MAINNET } from '../../deployments.js';

const ARC_CHAIN_ID = ARC_MAINNET.chainId;

const CLAIM_ABI = [
  { type: 'function', name: 'claim', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const;

type Props = {
  payroll: Address;
  claimable: bigint;
  onSuccess: () => void;
};

export function ClaimButton({ payroll, claimable, onSuccess }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { address: walletAddress, chainId: walletChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });
  const inflight = useRef(false);
  const qc = useQueryClient();

  const claim = useCallback(async () => {
    if (inflight.current) return;
    setError(null);

    if (!walletAddress || walletChainId !== ARC_CHAIN_ID || !publicClient || !walletClient) {
      setError('Switch to Arc (chain 5042) to claim.');
      return;
    }

    inflight.current = true;

    try {
      setBusy('Simulating claim...');
      try {
        await publicClient.simulateContract({
          address: payroll,
          abi: payrollAbi,
          functionName: 'claim',
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        setError(c.name === 'NothingToClaim' ? 'Nothing to claim.' : c.detail);
        return;
      }

      setBusy('Waiting for your wallet...');
      let hash: `0x${string}`;
      try {
        hash = await (walletClient as WalletClient).writeContract({
          address: payroll,
          abi: CLAIM_ABI,
          functionName: 'claim',
          chain: arc,
          account: walletAddress,
        });
      } catch (err) {
        const c = classifyRunError(err);
        setError(c.kind === 'cancelled' ? 'You cancelled. Nothing was sent.' : c.detail);
        return;
      }

      setBusy('Confirming...');
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
      if (receipt.status === 'reverted') {
        setError('The transaction was reverted on chain. Nothing was claimed.');
        return;
      }

      const short = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
      toast.success(
        `Claimed ${formatUsdc(claimable)}.`,
        {
          description: (
            <a
              href={`${ARC_MAINNET.explorer}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink)', textDecoration: 'underline', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem' }}
            >
              tx {short}
            </a>
          ),
        },
      );
      void qc.invalidateQueries({ queryKey: ['payrollState', payroll] });
      onSuccess();
    } finally {
      setBusy(null);
      inflight.current = false;
    }
  }, [walletAddress, walletChainId, publicClient, walletClient, payroll, claimable, onSuccess, qc]);

  if (claimable <= 0n) return null;

  return (
    <div style={{ marginTop: '16px' }}>
      <button
        onClick={() => void claim()}
        disabled={!!busy}
        className="btn-primary"
        style={{
          height: '44px',
          padding: '0 24px',
          borderRadius: '8px',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '0.9375rem',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
        data-testid="claim-button"
      >
        {busy ? busy : `Claim ${formatUsdc(claimable)}`}
      </button>
      {error && (
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--stamp)', marginTop: '6px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
