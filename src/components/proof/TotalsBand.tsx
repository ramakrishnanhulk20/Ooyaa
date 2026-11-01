import { useEffect, useRef, useState } from 'react';
import { getAddress } from 'viem';
import type { StreamedLedger } from '../../proof/useProofReport.js';
import { ARC_MAINNET } from '../../deployments.js';

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

type Totals = {
  totalIn: bigint;
  totalPaid: bigint;
  totalTips: bigint;
  runCount: number;
  payslipCount: number;
};

function sumLedgers(ledgers: StreamedLedger[]): Totals {
  let totalIn = 0n;
  let totalPaid = 0n;
  let totalTips = 0n;
  let runCount = 0;
  let payslipCount = 0;
  for (const l of ledgers) {
    totalIn += l.ledger.totals.totalIn;
    totalPaid += l.ledger.totals.totalPaid;
    totalTips += l.ledger.totals.totalTips;
    runCount += l.ledger.totals.runCount;
    payslipCount += l.ledger.totals.payslipCount;
  }
  return { totalIn, totalPaid, totalTips, runCount, payslipCount };
}

function useCountUp(target: number, active: boolean): number {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Never restart from a lower number when new ledgers arrive mid-stream.
  const floorRef = useRef(0);
  const [value, setValue] = useState(() => reducedMotion ? target : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (reducedMotion) return;
    // The displayed value is already at floorRef.current from the previous run.
    const from = floorRef.current;
    if (target <= from) return;
    const start = performance.now();
    const duration = 900;
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      const next = Math.round(from + eased * (target - from));
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        floorRef.current = target;
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, active, reducedMotion]);

  return reducedMotion ? target : value;
}

function BandItem({ label, value, active, isUsdc = false }: {
  label: string;
  value: number;
  active: boolean;
  isUsdc?: boolean;
}) {
  const animated = useCountUp(value, active);
  const display = isUsdc ? (animated / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) : animated.toLocaleString('en-US');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'center' }}>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        color: 'var(--ink-3)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: '"Fraunces Variable", Georgia, serif',
        fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
        fontWeight: 600,
        fontSize: '2.5rem',
        color: 'var(--ink)',
        lineHeight: 1,
      }}>
        {display}
        {isUsdc && <span style={{ fontSize: '1.25rem', marginLeft: '6px', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 400 }}>USDC</span>}
      </span>
    </div>
  );
}

function SkeletonBar() {
  return (
    <div style={{
      height: '24px',
      borderRadius: '4px',
      background: 'var(--rule)',
      opacity: 0.6,
      width: '80%',
      margin: '0 auto',
    }} />
  );
}

type Props = {
  ledgers: StreamedLedger[] | undefined;
  factory: string;
  loading: boolean;
  /** Total payrolls found by the factory (set as soon as enumerate finishes). */
  payrollCount: number | null;
};

export function TotalsBand({ ledgers, factory, loading, payrollCount }: Props) {
  const bandRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const totals = ledgers ? sumLedgers(ledgers) : null;

  return (
    <div
      ref={bandRef}
      style={{
        borderTop: '1px solid var(--rule)',
        borderBottom: '1px solid var(--rule)',
        padding: '40px 0',
      }}
    >
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 48px',
      }} className="totals-band-inner">
        {loading || !totals ? (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '32px',
              marginBottom: '16px',
            }} className="totals-band-grid">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  <SkeletonBar />
                  <SkeletonBar />
                </div>
              ))}
            </div>
            <p style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-3)',
              margin: 0,
              textAlign: 'center',
            }}>
              Waiting for the proof sheet to finish reading Arc.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '32px',
              marginBottom: '16px',
            }} className="totals-band-grid">
              <BandItem label="USDC IN" value={Number(totals.totalIn)} active={inView} isUsdc />
              <BandItem label="PAID TO PEOPLE" value={Number(totals.totalPaid)} active={inView} isUsdc />
              <BandItem label="TIPS TO RUNNERS" value={Number(totals.totalTips)} active={inView} isUsdc />
              <BandItem label="PAYDAYS RUN" value={totals.runCount} active={inView} />
              <BandItem label="PAYSLIPS" value={totals.payslipCount} active={inView} />
            </div>
            <p style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-3)',
              margin: 0,
              textAlign: 'center',
            }}>
              {loading && payrollCount !== null
                ? <>Read so far: {(ledgers ?? []).length} of {payrollCount} payroll{payrollCount === 1 ? '' : 's'} made by the factory{' '}</>
                : <>Across {(ledgers ?? []).length} payroll{(ledgers ?? []).length === 1 ? '' : 's'} made by the factory{' '}</>
              }
              <a
                href={`${ARC_MAINNET.explorer}/address/${factory ? getAddress(factory) : factory}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}
              >
                {factory ? shortAddr(getAddress(factory)) : ''}
              </a>
            </p>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 767px) {
          .totals-band-inner { padding: 0 20px !important; }
          .totals-band-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
