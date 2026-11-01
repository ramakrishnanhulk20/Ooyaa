import { useEffect, useRef, useState } from 'react';
import { Nav } from '../components/Nav.js';
import { ProofSheet, type ProofSheetHandle } from '../components/proof/ProofSheet.js';
import { TotalsBand } from '../components/proof/TotalsBand.js';
import { WalletList } from '../components/proof/WalletList.js';
import { LedgerTable } from '../components/proof/LedgerTable.js';
import { StudioFacts } from '../components/proof/StudioFacts.js';
import { useProofReport } from '../proof/useProofReport.js';
import { isVerified } from '../proof/mergeChecks.js';

function shortBlock(n: bigint): string {
  return n.toLocaleString('en-US');
}

function snapshotLine(block: bigint, ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Snapshot at block ${shortBlock(block)}, ${h}:${m} UTC, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

// The private RPC flag is set in .env as VITE_ARC_RPC_URL. When set, the
// browser uses the private node as the primary source. bun run prove always
// reads Arc's public node, so the two cross-check each other independently.
const PRIVATE_RPC_SET = Boolean(import.meta.env.VITE_ARC_RPC_URL);

function sourceAttributionLine(logSourceUsed: string | undefined): string {
  if (!logSourceUsed) return '';
  if (logSourceUsed === 'QuickNode') {
    return "Read through the site's QuickNode Arc node. bun run prove reads Arc's public node, so the two cross-check.";
  }
  if (PRIVATE_RPC_SET && logSourceUsed === 'Arc') {
    return "QuickNode refused, read through Arc's public node instead.";
  }
  return "Read through Arc's public node.";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copy command"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
        color: 'var(--ink-3)',
        fontSize: '0.875rem',
        lineHeight: 1,
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 7l4 4 6-7" stroke="var(--paid)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="4" y="1" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M1 4v8a1 1 0 001 1h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

export function ProofPage() {
  const { report, checks, progress, status, error, rerun, streamedLedgers, payrollCount } = useProofReport();
  const sheetRef = useRef<ProofSheetHandle>(null);
  const stampFiredRef = useRef(false);

  // After the proof query succeeds and all merged checks pass, stamp VERIFIED.
  useEffect(() => {
    if (stampFiredRef.current) return;
    if (status !== 'success') return;
    if (!isVerified(checks)) return;
    stampFiredRef.current = true;
    const t = setTimeout(() => {
      void sheetRef.current?.stampVerified();
    }, 300);
    return () => clearTimeout(t);
  }, [status, checks]);

  // Reset stamp flag on rerun.
  function handleRerun() {
    stampFiredRef.current = false;
    rerun();
  }

  const isLoading = status === 'loading' || status === 'idle';
  const isSuccess = status === 'success';

  // Sections 2-4 stream from onLedger and render as soon as the first payroll
  // finishes, before C8 completes. On success the final report ledgers are used
  // so all display values are consistent with the terminal checks.
  const displayLedgers = isSuccess && report
    ? report.ledgers.map(l => ({
        payroll: l.payroll,
        ledger: l.ledger,
        history: l.history,
        employer: l.state.employer,
      }))
    : streamedLedgers.length > 0
      ? streamedLedgers
      : undefined;

  const multiPayroll = (displayLedgers?.length ?? 0) > 1;
  const snapshotBlock = isSuccess && report ? report.snapshotBlock : undefined;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <Nav />
      <main>

        {/* 1. Header + proof sheet */}
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '64px 48px 80px',
          display: 'grid',
          gridTemplateColumns: '7fr 5fr',
          gap: '48px',
          alignItems: 'start',
        }} className="proof-header-grid">

          {/* Left: headline. min-width 0 prevents mono lines from blowing out the column. */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.75rem',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
              marginBottom: '20px',
            }}>
              PROOF, LIVE FROM ARC MAINNET
            </div>
            <h1 style={{
              fontFamily: '"Fraunces Variable", Georgia, serif',
              fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
              fontWeight: 600,
              fontSize: 'clamp(2.75rem, 6vw, 5rem)',
              lineHeight: 0.98,
              letterSpacing: '-0.025em',
              color: 'var(--ink)',
              margin: '0 0 20px',
            }}>
              Every cent, on the record.
            </h1>
            <p style={{
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontSize: '1.125rem',
              color: 'var(--ink-2)',
              margin: '0 0 20px',
              maxWidth: '46ch',
              lineHeight: 1.5,
            }}>
              This page reads Arc mainnet in your browser and runs the same eight checks as{' '}
              <code style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.95em' }}>bun run prove</code>.
              Nothing here is typed in by us.
            </p>

            {/* Snapshot line + source attribution.
                Both lines are reserved from first paint (minHeight) so the
                content below does not shift when they fill in. */}
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-3)',
              marginBottom: '2px',
              overflowWrap: 'anywhere',
              minWidth: 0,
              minHeight: '1.3em',
            }}>
              {isLoading
                ? 'Reading Arc mainnet...'
                : isSuccess && report
                  ? snapshotLine(report.snapshotBlock, report.snapshotTime)
                  : '\u00A0'}
            </div>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-3)',
              marginBottom: '10px',
              overflowWrap: 'anywhere',
              minWidth: 0,
              minHeight: '1.3em',
            }}>
              {isSuccess && report
                ? sourceAttributionLine(report.logSourceUsed)
                : '\u00A0'}
            </div>

            {/* Copy run command */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.8125rem',
                color: 'var(--ink-3)',
              }}>
                Run it yourself: bun run prove
              </span>
              <CopyButton text="bun run prove" />
            </div>
          </div>

          {/* Right: proof sheet. min-width 0 so it never blows past the grid. */}
          <div style={{ minWidth: 0 }}>
            <ProofSheet
              ref={sheetRef}
              checks={checks}
              progress={progress}
              status={status === 'idle' ? 'loading' : status}
              error={error}
              onRerun={handleRerun}
            />
          </div>
        </div>

        {/* 2. Totals band: streams from onLedger; shows skeleton while loading. */}
        <TotalsBand
          ledgers={displayLedgers}
          factory={report?.factory ?? ''}
          loading={isLoading && displayLedgers === undefined}
          payrollCount={payrollCount}
        />

        {/* 3. Who pressed the button: appears as soon as the first payroll streams. */}
        {displayLedgers && <WalletList ledgers={displayLedgers} />}

        {/* 4. Ledger: streams from onLedger; uses snapshot block from report when done. */}
        {displayLedgers && (
          <LedgerTable
            ledgers={displayLedgers}
            snapshotBlock={snapshotBlock}
            multiPayroll={multiPayroll}
          />
        )}

        {/* 5. Studio facts */}
        <StudioFacts checks={checks} />

      </main>

      <style>{`
        @media (max-width: 1023px) {
          .proof-header-grid {
            grid-template-columns: 1fr !important;
            padding: 40px 48px 60px !important;
          }
        }
        @media (max-width: 767px) {
          .proof-header-grid {
            padding: 32px 20px 48px !important;
          }
        }
      `}</style>
    </div>
  );
}
