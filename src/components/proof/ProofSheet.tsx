import { useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import type { CheckResult, CheckStatus } from '../../proof/checks.js';

// Eight check ids in the canonical order prove() produces them.
const CHECK_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'] as const;
const CHECK_TITLES: Record<string, string> = {
  C1: 'local build',
  C2: 'same code on mainnet and testnet',
  C3: 'verified source',
  C4: 'made by the factory',
  C5: 'paid exactly once, in order',
  C6: 'every payslip is a real USDC transfer',
  C7: 'every cent accounted for',
  C8: 'a second run is refused',
};

export type ProofSheetHandle = {
  stampVerified: () => Promise<void>;
};

type Props = {
  checks: CheckResult[];
  progress: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: Error | null;
  onRerun: () => void;
};

function StatusMark({ status }: { status: CheckStatus }) {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const variants = reducedMotion
    ? { hidden: { opacity: 0, scale: 1 }, visible: { opacity: 1, scale: 1 } }
    : {
        hidden: { opacity: 0, scale: 1.4 },
        visible: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const } },
      };

  if (status === 'PASS') {
    return (
      <motion.span
        initial="hidden"
        animate="visible"
        variants={variants}
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 500,
          fontSize: '0.75rem',
          color: 'var(--paid)',
          border: '1.5px solid var(--paid)',
          borderRadius: '4px',
          padding: '2px 6px',
          transform: 'rotate(-4deg)',
          display: 'inline-block',
          whiteSpace: 'nowrap',
        }}
      >
        PASS
      </motion.span>
    );
  }
  if (status === 'FAIL') {
    return (
      <motion.span
        initial="hidden"
        animate="visible"
        variants={variants}
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 500,
          fontSize: '0.75rem',
          color: 'var(--slip)',
          background: 'var(--ink)',
          borderRadius: '4px',
          padding: '2px 6px',
          display: 'inline-block',
          whiteSpace: 'nowrap',
        }}
      >
        FAIL
      </motion.span>
    );
  }
  // SKIP
  return (
    <motion.span
      initial="hidden"
      animate="visible"
      variants={variants}
      style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontWeight: 400,
        fontSize: '0.75rem',
        color: 'var(--ink-3)',
        border: '1px dashed var(--ink-3)',
        borderRadius: '4px',
        padding: '2px 6px',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      SKIP
    </motion.span>
  );
}

function CheckRow({ check, pending }: { check: CheckResult | null; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const id = check?.id ?? '';
  const title = check ? (CHECK_TITLES[check.id] ?? check.title) : (CHECK_TITLES[id] ?? id);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => check && setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '14px 0',
          background: 'none',
          border: 'none',
          cursor: check ? 'pointer' : 'default',
          textAlign: 'left',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.75rem',
            color: 'var(--ink-3)',
            flexShrink: 0,
            width: '22px',
          }}>
            {check?.id ?? id}
          </span>
          <span style={{
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.9375rem',
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </span>
        </div>
        <div style={{ flexShrink: 0 }}>
          {check ? <StatusMark status={check.status} /> : null}
        </div>
      </button>

      {/* Pending sweep bar */}
      {pending && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2px',
          overflow: 'hidden',
          borderRadius: '1px',
        }}>
          <div className="btn-sweep" style={{
            height: '100%',
            background: 'var(--rule)',
          }} />
        </div>
      )}

      {/* Expandable detail lines */}
      <AnimatePresence initial={false}>
        {open && check && check.lines.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingBottom: '12px' }}>
              {check.lines.map((line, i) => (
                <div key={i} style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-2)',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                  minWidth: 0,
                }}>
                  {line}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const ProofSheet = forwardRef<ProofSheetHandle, Props>(
  function ProofSheet({ checks, progress, status, error, onRerun }, ref) {
    const stampControls = useAnimation();
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stampVerified = useCallback(async () => {
      if (reducedMotion) {
        await stampControls.start({ opacity: 1, scale: 1, transition: { duration: 0 } });
        return;
      }
      await stampControls.start({
        opacity: 1,
        scale: 1,
        transition: { duration: 0.14, ease: [0.2, 0.9, 0.3, 1.2] as const },
      });
    }, [stampControls, reducedMotion]);

    useImperativeHandle(ref, () => ({ stampVerified }), [stampVerified]);

    const checksMap = new Map(checks.map(c => [c.id, c]));
    const allDone = checks.length === 8;
    const passed = checks.filter(c => c.status === 'PASS').length;
    const failed = checks.filter(c => c.status === 'FAIL').length;
    const skipped = checks.filter(c => c.status === 'SKIP').length;
    const allPassed = allDone && failed === 0 && skipped === 0;

    const sheetRef = useRef<HTMLDivElement>(null);

    return (
      <div
        ref={sheetRef}
        className="proof-sheet-card"
        style={{
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          padding: '28px',
          boxShadow: '0 24px 60px -32px rgba(18,25,63,.28)',
          position: 'relative',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Label */}
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.75rem',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          marginBottom: '8px',
        }}>
          PROOF SHEET
        </div>

        {/* Progress message while running */}
        {status === 'loading' && progress && (
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.75rem',
            color: 'var(--ink-3)',
            marginBottom: '16px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            Check {Math.min(checks.length + 1, 8)} of 8 &mdash; {progress}
          </div>
        )}

        {/* Error state */}
        {status === 'error' && error && (
          <div style={{ padding: '16px 0' }}>
            <p style={{
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontSize: '0.9375rem',
              color: 'var(--stamp)',
              margin: '0 0 12px',
            }}>
              Could not finish reading Arc mainnet: {error.message.slice(0, 120)}. This page never shows cached or made-up numbers, so it shows none.
            </p>
            <button
              onClick={onRerun}
              style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: 'var(--ink)',
                background: 'none',
                border: '1px solid var(--rule)',
                borderRadius: '8px',
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Check rows */}
        <div>
          {CHECK_IDS.map((id, idx) => {
            const check = checksMap.get(id) ?? null;
            const pending = !check && status === 'loading';
            const isLast = idx === CHECK_IDS.length - 1;
            return (
              <div
                key={id}
                style={{ borderBottom: isLast ? 'none' : '1px solid var(--rule)' }}
              >
                <CheckRow check={check} pending={pending} />
              </div>
            );
          })}
        </div>

        {/* Footer when all done */}
        {allDone && (
          <div style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-3)',
            }}>
              {passed} passed, {failed} failed, {skipped} skipped
            </span>
            <button
              onClick={onRerun}
              style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '0.875rem',
                color: 'var(--ink)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Run again
            </button>
          </div>
        )}

        {/* VERIFIED stamp: sits in the gap between C7 and C8 titles and their marks. */}
        <motion.div
          animate={stampControls}
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.6 }}
          style={{
            position: 'absolute',
            right: '112px',
            bottom: '64px',
            pointerEvents: 'none',
            zIndex: 10,
            display: allPassed ? 'block' : 'none',
          }}
        >
          <span style={{
            display: 'inline-block',
            border: '2px double var(--stamp)',
            color: 'var(--stamp)',
            fontFamily: '"IBM Plex Mono", monospace',
            fontWeight: 600,
            fontSize: '0.875rem',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.12em',
            padding: '6px 12px',
            borderRadius: '4px',
            transform: 'rotate(-10deg)',
            userSelect: 'none' as const,
            whiteSpace: 'nowrap',
          }}>
            VERIFIED
          </span>
        </motion.div>

        <style>{`
          @media (max-width: 767px) {
            .proof-sheet-card { padding: 20px !important; }
          }
        `}</style>
      </div>
    );
  },
);
