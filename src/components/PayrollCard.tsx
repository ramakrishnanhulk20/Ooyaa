/**
 * General payroll card. Shows live state, the run button, and a link to the
 * payroll's own page. DemoPayrollCard is a thin wrapper that fixes the props
 * for the demo payroll; PayrollPage uses this directly.
 */
import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';

import type { Address } from 'viem';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSwitchChain } from 'wagmi';
import { toast } from 'sonner';
import { ARC_MAINNET } from '../deployments.js';
import { usePayrollState } from '../payroll/usePayrollState.js';
import { useChainClock } from '../payroll/useChainClock.js';
import { lastPaidRun } from '../payroll/lastPaidRun.js';
import { deriveCardState } from '../payroll/cardState.js';
import { useRunPayday } from '../payroll/useRunPayday.js';
import { Payslip } from './Payslip.js';
import type { PayslipHandle } from './Payslip.js';
import { formatUsdc, cadence, countdown, periodDisplayLabel } from '../payroll/format.js';
import type { StampKind } from './Stamp.js';

const EXPLORER = ARC_MAINNET.explorer;
const ARC_CHAIN_ID = ARC_MAINNET.chainId;

export type PayrollCardHandle = {
  stampAll: (kind: StampKind) => void;
  /**
   * Programmatically trigger the card's Run payday button (same simulate-first
   * flow as clicking it. Does nothing when the card is already busy (checking,
   * signing, or pending) so the hero button is safe to call without a guard.
   */
  press: () => void;
  /** Flash a 2px --ink outline that fades over 900 ms to indicate where the action landed. */
  highlight: () => void;
};

export type PayrollCardProps = {
  /** Payroll contract address on Arc mainnet. */
  payroll: Address;
  /** Block at which this payroll was created, for lastPaidRun lookback. */
  fromBlock: bigint;
  /** Label shown in the card header (e.g. "DEMO PAYROLL" or "PAYROLL"). */
  label: string;
  /** id forwarded to the run button element, used for scroll-and-focus. */
  id?: string;
  /**
   * Called when the user clicks a paid payslip in the stack.
   * Receives the paid period index (0-based contract index) and the tx hash.
   * On /p/:address the page opens the SlipDrawer; on the home page it navigates.
   */
  onSlipClick?: (periodIndex: bigint, txHash: `0x${string}`) => void;
};

const ROTATIONS = ['-1.5deg', '0deg', '+1.2deg'];

function Skeleton({ width, height = 16 }: { width: string | number; height?: number }) {
  return (
    <div
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: '4px',
        background: 'var(--rule)',
        opacity: 0.6,
      }}
    />
  );
}

export const PayrollCard = forwardRef<PayrollCardHandle, PayrollCardProps>(
  function PayrollCard({ payroll, fromBlock, label, id, onSlipClick }, ref) {
    const nowChain = useChainClock();
    const { state, payees, amounts, dueNow, nextPayday, isLoading, isError } = usePayrollState(payroll);
    const [slipsAnimate, setSlipsAnimate] = useState(false);
    const slipRefs = useRef<Array<PayslipHandle | null>>([]);
    const { runState, press, reset } = useRunPayday(payroll);
    const { switchChain } = useSwitchChain();
    const location = useLocation();

    // Keep a stable ref so event handlers don't close over a stale press.
    const pressRef = useRef(press);
    useEffect(() => { pressRef.current = press; }, [press]);

    const cardState = deriveCardState({ state, payees, dueNow, nextPayday, nowChain });

    // Trigger slip entrance animation after first data load.
    useEffect(() => {
      if (!isLoading && state !== undefined) {
        const t = setTimeout(() => setSlipsAnimate(true), 50);
        return () => clearTimeout(t);
      }
    }, [isLoading, state]);

    const paidPeriod = cardState.kind === 'idle' && cardState.lastPaidPeriod !== null
      ? cardState.lastPaidPeriod
      : null;

    const { data: paidRun } = useQuery({
      queryKey: ['lastPaidRun', payroll, paidPeriod !== null ? String(paidPeriod) : 'none'],
      queryFn: () => {
        if (paidPeriod === null) return null;
        // Use the default client (mainnetClient, QuickNode->Arc fallback).
        return lastPaidRun(undefined, payroll, paidPeriod, fromBlock);
      },
      enabled: paidPeriod !== null,
      retry: 4,
      staleTime: 60_000,
    });

    const stampedRef = useRef(false);
    useEffect(() => {
      if (runState.kind !== 'paid' || stampedRef.current) return;
      stampedRef.current = true;

      slipRefs.current.forEach((r, i) => {
        if (!r) return;
        setTimeout(() => { void r.stamp('paid'); }, i * 90);
      });

      const { period, paid, count, tip, hash } = runState;
      const msg = `${periodDisplayLabel(period)} paid: ${formatUsdc(paid)} to ${count} people, and your ${formatUsdc(tip)} tip.`;
      toast.success(msg, {
        description: (
          <a
            href={`${EXPLORER}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--paid)' }}
          >
            View on explorer
          </a>
        ),
        duration: 8000,
      });

      const t = setTimeout(() => {
        reset();
        stampedRef.current = false;
      }, 2500);
      return () => clearTimeout(t);
    }, [runState, reset]);

    useEffect(() => {
      if (runState.kind === 'ready') stampedRef.current = false;
    }, [runState.kind]);

    const alreadyPaidRef = useRef(false);
    useEffect(() => {
      if (runState.kind !== 'refused' || runState.reason !== 'already_paid' || alreadyPaidRef.current) return;
      alreadyPaidRef.current = true;

      slipRefs.current.forEach((r, i) => {
        if (!r) return;
        setTimeout(() => { void r.stamp('already'); }, i * 90);
      });

      const t = setTimeout(() => {
        slipRefs.current.forEach(r => r?.resetStamp());
        reset();
        alreadyPaidRef.current = false;
      }, 4000);
      return () => clearTimeout(t);
    }, [runState, reset]);

    useEffect(() => {
      if (runState.kind === 'ready') alreadyPaidRef.current = false;
    }, [runState.kind]);

    const cardDivRef = useRef<HTMLDivElement>(null);

    const stampAll = useCallback((kind: StampKind) => {
      slipRefs.current.forEach((r, i) => {
        if (!r) return;
        setTimeout(() => { void r.stamp(kind); }, i * 90);
      });
    }, []);

    // Highlight: pulse a 2px --ink outline that fades over 900 ms.
    const highlightCard = useCallback(() => {
      const el = cardDivRef.current;
      if (!el) return;
      el.style.outline = '2px solid var(--ink)';
      el.style.outlineOffset = '2px';
      el.style.transition = 'outline-color 900ms ease';
      // Defer the fade so the browser paints the outline first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.outlineColor = 'transparent';
          setTimeout(() => {
            el.style.outline = '';
            el.style.outlineOffset = '';
            el.style.transition = '';
          }, 920);
        });
      });
    }, []);

    // The handle's press: no-op when the card is already mid-run.
    const handlePress = useCallback(() => {
      const busy = runState.kind === 'checking'
        || runState.kind === 'signing'
        || runState.kind === 'pending';
      if (busy) return;
      void pressRef.current();
    }, [runState.kind]);

    useImperativeHandle(ref, () => ({
      stampAll,
      press: handlePress,
      highlight: highlightCard,
    }), [stampAll, handlePress, highlightCard]);

    const secsToNext = cardState.kind === 'idle'
      ? Number(cardState.nextAt) - Number(nowChain)
      : 0;

    function headerStatus() {
      if (cardState.kind === 'loading') return <Skeleton width={120} />;
      if (cardState.kind === 'closed') return 'Closed';
      if (cardState.kind === 'underfunded') return 'Out of funds';
      if (cardState.kind === 'due') {
        if (cardState.waiting === 1n) return 'Payday due';
        return `${String(cardState.waiting)} paydays waiting`;
      }
      if (secsToNext <= 0) return 'Payday due';
      return `Next payday in ${countdown(secsToNext)}`;
    }

    function infoLines() {
      if (cardState.kind === 'loading' || !state) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Skeleton width={180} />
            <Skeleton width={220} />
          </div>
        );
      }

      const payeeCount = Number(state.payeeCount);
      const per = state.periodTotal > 0n && payeeCount > 0
        ? state.periodTotal / BigInt(payeeCount)
        : 0n;
      const allSame = payeeCount > 0 && (state.periodTotal === per * BigInt(payeeCount));

      let line1: React.ReactNode;
      let line2: React.ReactNode;

      if (cardState.kind === 'underfunded') {
        line1 = `This payroll needs ${formatUsdc(cardState.shortfall)} more to pay the next payday`;
      } else if (cardState.kind === 'due' && cardState.partialNote) {
        line1 = `Funded for ${String(cardState.partialNote.funded)} of the ${String(cardState.partialNote.total)} owed paydays`;
      } else {
        line1 = `Funded for ${String(state.runway)} more paydays`;
      }

      if (allSame) {
        line2 = `${payeeCount} payees, ${formatUsdc(per)} each, ${cadence(state.periodLength)}`;
      } else {
        line2 = `${formatUsdc(state.periodTotal)} in total, ${cadence(state.periodLength)}`;
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>{line1}</span>
          <span>{line2}</span>
        </div>
      );
    }

    const slipsToRender: Array<{ payee: Address | null; amount: bigint; index: number }> = [];
    if (payees && state) {
      payees.slice(0, 3).forEach((p, i) => {
        slipsToRender.push({ payee: p, amount: amounts?.[i] ?? 0n, index: i });
      });
    } else if (isLoading) {
      slipsToRender.push({ payee: null, amount: 0n, index: 0 });
    }

    const extraPayees = (payees?.length ?? 0) > 3 ? (payees?.length ?? 0) - 3 : 0;

    // The paid period index from a just-run transaction.
    const justPaidPeriod = runState.kind === 'paid' ? runState.period : undefined;

    function slipStatusFor(index: number) {
      if (runState.kind === 'paid') {
        return { kind: 'paid' as const, txHash: runState.hash, explorer: EXPLORER };
      }
      if (cardState.kind === 'idle' && cardState.lastPaidPeriod !== null && paidRun) {
        return { kind: 'paid' as const, txHash: paidRun.txHash, explorer: EXPLORER };
      }
      if (cardState.kind === 'loading') {
        return { kind: 'due' as const, dueAt: 0n, nowChain };
      }
      if (cardState.kind === 'due') {
        return { kind: 'due' as const, dueAt: cardState.dueAt, nowChain };
      }
      void index;
      return { kind: 'due' as const, dueAt: state?.startTime ?? 0n, nowChain };
    }

    // Period index to pass to Payslip.
    // Due state: show the next unpaid period (nextUnpaid), the one about to be run.
    // Idle state: show the last paid period (lastPaidPeriod = nextUnpaid - 1).
    // Just-paid (runState): show the period that was just paid.
    function slipPeriodFor(): bigint {
      if (justPaidPeriod !== undefined) return justPaidPeriod;
      if (cardState.kind === 'idle' && paidPeriod !== null) return BigInt(paidPeriod);
      // Due or loading: nextUnpaid is the period being shown as due.
      return state?.nextUnpaid ?? 0n;
    }

    function runButton() {
      let buttonLabel = 'Run payday';
      let disabled = false;
      let secondary = false;
      let onClick: () => void = () => { void pressRef.current(); };

      if (runState.kind === 'checking') {
        buttonLabel = 'Checking with the contract...';
        disabled = true;
      } else if (runState.kind === 'wrong_chain') {
        buttonLabel = 'Switch to Arc';
        onClick = () => switchChain({ chainId: ARC_CHAIN_ID });
      } else if (runState.kind === 'signing') {
        buttonLabel = 'Waiting for your wallet...';
        disabled = true;
      } else if (runState.kind === 'pending') {
        const n = state ? Number(state.payeeCount) : 0;
        buttonLabel = `Paying ${n} people...`;
        disabled = true;
      } else if (runState.kind === 'paid') {
        buttonLabel = 'Run payday';
        disabled = true;
      } else if (cardState.kind === 'loading') {
        buttonLabel = 'Loading payroll...';
        disabled = true;
      } else if (cardState.kind === 'underfunded') {
        buttonLabel = 'Out of funds';
        disabled = true;
      } else if (cardState.kind === 'idle') {
        buttonLabel = 'Run payday again';
        secondary = true;
      }

      const isPending = runState.kind === 'pending';

      return (
        <div style={{ position: 'relative' }}>
          <button
            id={id}
            disabled={disabled}
            onClick={!disabled ? onClick : undefined}
            className={secondary ? 'btn-secondary' : ''}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '8px',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontWeight: 500,
              fontSize: '1rem',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.35 : 1,
              background: secondary ? 'transparent' : 'var(--ink)',
              color: secondary ? 'var(--ink)' : 'var(--paper)',
              border: secondary ? '1px solid var(--ink)' : 'none',
              overflow: 'hidden',
              position: 'relative',
              transition: 'background 120ms ease, transform 120ms ease',
            }}
            onMouseEnter={e => {
              if (!disabled && !secondary) {
                (e.currentTarget).style.background = '#1E2758';
                (e.currentTarget).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              if (!disabled && !secondary) {
                (e.currentTarget).style.background = 'var(--ink)';
                (e.currentTarget).style.transform = 'translateY(0)';
              }
            }}
          >
            {buttonLabel}
            {isPending && (
              <span
                className="btn-progress-bar"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: '2px',
                  width: '40%',
                  background: 'var(--paper)',
                  opacity: 0.5,
                  borderRadius: '1px',
                  animation: 'btn-sweep 900ms linear infinite',
                }}
              />
            )}
          </button>
        </div>
      );
    }

    function statusLine() {
      if (runState.kind === 'refused') {
        if (runState.reason === 'already_paid') {
          return 'Refused by the contract: this payday is already paid. Nothing was signed.';
        }
        if (runState.reason === 'underfunded') {
          const bal = state ? formatUsdc(state.balance) : '';
          const owed = state ? formatUsdc(state.owed) : '';
          return `This payroll owes ${owed} and holds ${bal}. Nothing was sent.`;
        }
        const name = 'detail' in runState ? runState.detail || 'unknown' : 'unknown';
        return `The contract would refuse this run (${name}). Nothing was sent.`;
      }
      if (runState.kind === 'needs_wallet') return 'Connect a wallet to run payday. You will sign once.';
      if (runState.kind === 'wrong_chain') return 'Your wallet is on another network.';
      if (runState.kind === 'signing') return 'Approve the transaction in your wallet.';
      if (runState.kind === 'pending') {
        const h = runState.hash;
        const short = `${h.slice(0, 6)}...${h.slice(-4)}`;
        return (
          <a
            href={`${EXPLORER}/tx/${h}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link-underline"
            style={{ color: 'var(--ink-2)', fontFamily: '"IBM Plex Mono", monospace' }}
          >
            tx {short}
          </a>
        );
      }
      if (runState.kind === 'paid') {
        const { period, paid, count, tip } = runState;
        return (
          <span style={{ color: 'var(--paid)' }}>
            {periodDisplayLabel(period)} paid: {formatUsdc(paid)} to {count} people, and your {formatUsdc(tip)} tip.
          </span>
        );
      }
      if (runState.kind === 'failed') {
        if (runState.reason === 'cancelled') {
          return 'You cancelled. Nothing was sent.';
        }
        if (runState.reason === 'reverted') {
          const h = runState.hash;
          const link = h
            ? (
              <a
                href={`${EXPLORER}/tx/${h}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline"
                style={{ color: 'var(--ink-2)' }}
              >
                tx {h.slice(0, 6)}...{h.slice(-4)}
              </a>
            )
            : null;
          return (
            <>
              Arc refused the run on chain, probably because it was paid a moment earlier. Only the gas was spent.{' '}
              {link}
            </>
          );
        }
        if (runState.reason === 'no_gas') {
          return 'Your wallet needs a little USDC on Arc for gas, about 0.004 USDC.';
        }
        return (
          <>
            Something went wrong: {(runState.detail || 'unknown').replace(/\.$/, '')}. Nothing was paid.{' '}
            <button
              onClick={reset}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--ink)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.8125rem',
                textDecoration: 'underline',
              }}
            >
              Try again
            </button>
          </>
        );
      }

      if (cardState.kind === 'loading' || !state) return null;
      if (cardState.kind === 'underfunded') {
        return 'The employer must top it up before the next run.';
      }
      if (cardState.kind === 'idle') {
        const pLabel = cardState.lastPaidPeriod !== null
          ? `${periodDisplayLabel(BigInt(cardState.lastPaidPeriod))} is paid.`
          : '';
        const timeStr = secsToNext > 0 ? ` Next payday in ${countdown(secsToNext)}.` : '';
        return `${pLabel}${timeStr}`;
      }
      if (cardState.kind === 'due') {
        const tip = formatUsdc(state.tipPerRun);
        if (cardState.waiting > 1n) {
          const closedLine = cardState.closedNote
            ? ' This payroll is closed. Paydays that already started can still be run.'
            : '';
          return `Nothing is skipped. Run one to pay the oldest waiting payday and keep the ${tip} tip.${closedLine}`;
        }
        const closedLine = cardState.closedNote
          ? ' This payroll is closed. Paydays that already started can still be run.'
          : '';
        return `Earn a ${tip} tip for running it.${closedLine}`;
      }
      return null;
    }

    const stackHeight = slipsToRender.length > 0
      ? 180 + (slipsToRender.length - 1) * 10
      : 180;

    const sl = statusLine();

    // Hide the "Every payslip" link when already on this payroll's page.
    const onPayrollPage = location.pathname.toLowerCase() === `/p/${payroll.toLowerCase()}`;

    return (
      <div
        ref={cardDivRef}
        style={{
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          padding: '28px',
          boxShadow: '0 24px 60px -32px rgba(18,25,63,.28)',
          position: 'relative',
        }}
      >
        {isError && (
          <div style={{
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '0.875rem',
            color: 'var(--stamp)',
            marginBottom: '12px',
          }}>
            Could not reach Arc. Retrying in 15 seconds.
          </div>
        )}

        {/* Header row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '8px',
        }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
          }}>
            {label}
          </span>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '1rem',
            color: 'var(--ink)',
          }}>
            {headerStatus()}
          </span>
        </div>

        {/* Info lines */}
        <div style={{
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: '0.9375rem',
          color: 'var(--ink-2)',
          marginBottom: '24px',
          lineHeight: 1.5,
        }}>
          {infoLines()}
        </div>

        {/* Slip stack */}
        <div
          style={{
            position: 'relative',
            height: `${stackHeight}px`,
            marginBottom: '24px',
          }}
          className="slip-stack"
        >
          {slipsToRender.map(({ payee, amount, index }) => {
            const slipStatus = slipStatusFor(index);
            const isPaid = slipStatus.kind === 'paid';
            const handleSlipClick = isPaid && onSlipClick
              ? () => {
                const period = slipPeriodFor();
                onSlipClick(period, slipStatus.txHash);
              }
              : undefined;
            return (
              <Payslip
                key={payee ?? `skeleton-${index}`}
                ref={el => { slipRefs.current[index] = el; }}
                period={slipPeriodFor()}
                payee={payee}
                amount={amount}
                status={slipStatus}
                rotation={ROTATIONS[index] ?? '0deg'}
                index={index}
                animate={slipsAnimate}
                onClick={handleSlipClick}
              />
            );
          })}
          {extraPayees > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '-20px',
              left: 0,
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
            }}>
              +{extraPayees} more payees
            </div>
          )}
        </div>

        {/* Run button */}
        {runButton()}

        {/* Status / hint line */}
        {sl && (
          <div style={{
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '0.875rem',
            color: 'var(--ink-3)',
            marginTop: '8px',
            lineHeight: 1.5,
          }}>
            {sl}
          </div>
        )}

        {/* Every payslip link, hidden when already on this payroll's own page. */}
        {!onPayrollPage && (
          <div style={{ marginTop: '16px' }}>
            <Link
              to={`/p/${payroll}`}
              className="every-payslip-link"
              style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: 'var(--ink)',
                textDecoration: 'none',
                borderBottom: '1px solid transparent',
                transition: 'border-color 200ms ease',
              }}
              onMouseEnter={e => { (e.currentTarget).style.borderBottomColor = 'var(--ink)'; }}
              onMouseLeave={e => { (e.currentTarget).style.borderBottomColor = 'transparent'; }}
            >
              Every payslip from this payroll
            </Link>
          </div>
        )}
      </div>
    );
  },
);
