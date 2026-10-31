import { useRef, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import { Stamp } from './Stamp.js';
import type { StampHandle, StampKind } from './Stamp.js';
import { shortAddress, formatUsdc, periodLabel, utcTime } from '../payroll/format.js';
import type { Address, Hex } from 'viem';

export type SlipStatus =
  | { kind: 'due'; dueAt: bigint; nowChain: bigint }
  | { kind: 'paid'; txHash: Hex; explorer: string }
  | { kind: 'held' };

export type PayslipProps = {
  period: bigint;
  /** null renders a skeleton frame with no text (R3: loading placeholder) */
  payee: Address | null;
  amount: bigint;
  status: SlipStatus;
  /** CSS rotation string, e.g. "-1.5deg" */
  rotation: string;
  /** Stack index for entrance animation delay */
  index: number;
  /** Whether entrance animation has been triggered */
  animate: boolean;
  /** Optional: called when the user clicks the payslip card. */
  onClick?: () => void;
};

export type PayslipHandle = {
  stamp: (kind: StampKind) => Promise<void>;
  resetStamp: () => void;
};

const EASING = [0.16, 1, 0.3, 1] as const;

export const Payslip = forwardRef<PayslipHandle, PayslipProps>(
  function Payslip({ period, payee, amount, status, rotation, index, animate, onClick }, ref) {
    const stampRef = useRef<StampHandle>(null);

    const slip = useImperativeHandle(ref, () => ({
      stamp: async (kind: StampKind) => {
        await stampRef.current?.play(kind);
      },
      resetStamp: () => stampRef.current?.reset(),
    }));
    void slip;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const targetRotation = reducedMotion ? 0 : Number(rotation.replace('deg', ''));
    const entranceDelay = 0.3 + index * 0.09;

    const initial = reducedMotion
      ? { opacity: 1, y: 0, rotate: targetRotation }
      : { opacity: 0, y: 32, rotate: 0 };
    const animateState = animate
      ? { opacity: 1, y: 0, rotate: targetRotation }
      : initial;

    // R3: when no payee is provided, render skeleton bars instead of address/amount text.
    const isSkeleton = payee === null;

    return (
      <motion.div
        initial={initial}
        animate={animateState}
        transition={reducedMotion ? { duration: 0 } : {
          duration: 0.6,
          delay: entranceDelay,
          ease: EASING,
        }}
        whileHover={{ y: reducedMotion ? 0 : -4, transition: { duration: 0.16, ease: 'easeOut' } }}
        style={{
          position: 'absolute',
          top: `${index * 10}px`,
          left: `${index * 6}px`,
          width: '100%',
        }}
      >
        <div
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onClick={onClick}
          onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
          style={{
            background: 'var(--slip)',
            border: '1px solid var(--rule)',
            borderRadius: '8px',
            boxShadow: '0 18px 40px -24px rgba(18,25,63,.25)',
            padding: '20px 24px 20px 32px',
            position: 'relative',
            overflow: 'hidden',
            cursor: onClick ? 'pointer' : undefined,
            transition: 'box-shadow 160ms ease, transform 160ms ease',
          }}
          onMouseEnter={onClick ? (e) => {
            (e.currentTarget).style.boxShadow = '0 24px 48px -20px rgba(18,25,63,.38)';
            (e.currentTarget).style.transform = 'translateY(-2px)';
          } : undefined}
          onMouseLeave={onClick ? (e) => {
            (e.currentTarget).style.boxShadow = '0 18px 40px -24px rgba(18,25,63,.25)';
            (e.currentTarget).style.transform = '';
          } : undefined}
        >
          {/* Left perforation strip */}
          <div
            className="perf-mask"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '20px',
              height: '100%',
              background: 'var(--rule)',
              opacity: 0.6,
            }}
          />

          {/* Top row: period label + "OOYAA" */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
            }}>
              {isSkeleton
                ? (
                  <span style={{
                    display: 'inline-block', width: '130px', height: '8px',
                    borderRadius: '2px', background: 'var(--rule)', opacity: 0.6,
                  }} />
                )
                : periodLabel(Number(period) + 1)
              }
            </span>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
            }}>
              OOYAA
            </span>
          </div>

          {/* Middle: address + amount */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              marginBottom: '4px',
              minHeight: '1.4em',
            }}>
              {isSkeleton
                ? (
                  <span style={{
                    display: 'inline-block', width: '40%', height: '8px',
                    borderRadius: '2px', background: 'var(--rule)', opacity: 0.6,
                  }} />
                )
                : shortAddress(payee)
              }
            </div>
            <div style={{
              fontFamily: '"Fraunces Variable", Georgia, serif',
              fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
              fontWeight: 600,
              fontSize: '2.5rem',
              color: 'var(--ink)',
              lineHeight: 1,
              minHeight: '2.5rem',
            }}>
              {isSkeleton
                ? (
                  <span style={{
                    display: 'inline-block', width: '60%', height: '8px',
                    borderRadius: '2px', background: 'var(--rule)', opacity: 0.6,
                    marginTop: '16px',
                  }} />
                )
                : formatUsdc(amount)
              }
            </div>
          </div>

          {/* Bottom row: status */}
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.8125rem',
            minHeight: '1.2em',
          }}>
            {isSkeleton
              ? null
              : status.kind === 'due'
                ? (
                  <span style={{ color: 'var(--ink-2)' }}>
                    Due {utcTime(status.dueAt, status.nowChain)}
                  </span>
                )
                : status.kind === 'paid'
                  ? (
                    <a
                      href={`${status.explorer}/tx/${status.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--paid)', textDecoration: 'none' }}
                      className="link-underline"
                    >
                      Paid, tx {shortAddress(status.txHash)}
                    </a>
                  )
                  : (
                    <span style={{ color: 'var(--held)' }}>Held for claim</span>
                  )
            }
          </div>

          {/* Stamp overlay */}
          <Stamp ref={stampRef} kind="paid" />
        </div>
      </motion.div>
    );
  },
);
