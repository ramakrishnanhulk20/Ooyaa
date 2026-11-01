import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { StreamedLedger } from '../../proof/useProofReport.js';
import { buildLedgerRows, describeRow, type LedgerRow } from '../../proof/rows.js';
import { periodDisplayLabel } from '../../payroll/format.js';
import { type Address, getAddress } from 'viem';
import { ARC_MAINNET } from '../../deployments.js';

const PAGE = 25;

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function formatUtcTime(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Always include the date so the WHEN column is unambiguous across payslips.
  return `${h}:${m} UTC, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

// describeRow from rows.ts is the shared source of WHAT text across all pages.
// Both /proof and /p/:address now show the same period labels (1-based, "Period 0038").

function formatAmount(row: LedgerRow): string {
  const usdc = Number(row.amount) / 1_000_000;
  const sign = row.direction === 'in' ? '+' : '-';
  const s = usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return `${sign}${s} USDC`;
}

function addrLink(addr: Address, explorer: string): React.ReactNode {
  const cs = getAddress(addr);
  return (
    <a
      href={`${explorer}/address/${cs}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}
    >
      {shortAddr(cs)}
    </a>
  );
}

function txLink(txHash: string, explorer: string): React.ReactNode {
  return (
    <a
      href={`${explorer}/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}
    >
      {shortAddr(txHash)}
    </a>
  );
}

// CSV uses period_index (0-based contract value) and period_label (1-based display).
// "Period 0038 is contract period index 37."
function buildCsv(rows: LedgerRow[], snapshotBlock: bigint): string {
  const cols = ['when_utc', 'block', 'what', 'period_index', 'period_label', 'from', 'to', 'direction', 'amount_usdc', 'tx', 'payroll'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    const when = r.time ? formatUtcTime(r.time) : '';
    const block = r.blockNumber.toString();
    const what = describeRow(r);
    const periodIndex = r.period !== undefined ? r.period.toString() : '';
    const periodLabel = r.period !== undefined ? periodDisplayLabel(r.period) : '';
    const amountUsdc = (Number(r.amount) / 1_000_000).toFixed(6);
    lines.push([when, block, what, periodIndex, periodLabel, r.from, r.to, r.direction, amountUsdc, r.txHash, r.payroll].map(v => `"${v}"`).join(','));
  }
  void snapshotBlock;
  return lines.join('\n');
}

type Props = {
  ledgers: StreamedLedger[] | undefined;
  snapshotBlock: bigint | undefined;
  multiPayroll: boolean;
  /** When set, payslip rows become clickable and call this callback. */
  onPayslipClick?: (row: LedgerRow, triggerEl: HTMLElement) => void;
};

export function LedgerTable({ ledgers, snapshotBlock, multiPayroll, onPayslipClick }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const tableRef = useRef<HTMLDivElement>(null);

  const allRows: LedgerRow[] = [];
  if (ledgers) {
    for (const l of ledgers) {
      const rows = buildLedgerRows(l.history, l.employer);
      allRows.push(...rows);
    }
    allRows.sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? Number(b.blockNumber - a.blockNumber)
        : b.logIndex - a.logIndex,
    );
  }

  const visible = allRows.slice(0, visibleCount);

  function downloadCsv() {
    const csv = buildCsv(allRows, snapshotBlock ?? 0n);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ooyaa-ledger-${(snapshotBlock ?? 0n).toString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const explorer = ARC_MAINNET.explorer;

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!ledgers) return null;

  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 48px 64px' }} className="ledger-section">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{
            fontFamily: '"Fraunces Variable", Georgia, serif',
            fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
            fontWeight: 600,
            fontSize: '2rem',
            color: 'var(--ink)',
            margin: '0 0 4px',
            lineHeight: 1.1,
          }}>
            Every USDC movement.
          </h2>
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.8125rem',
            color: 'var(--ink-3)',
          }}>
            {allRows.length} rows, newest first.
          </div>
        </div>
        <button
          onClick={downloadCsv}
          className="btn-secondary"
          style={{
            height: '40px',
            padding: '0 16px',
            borderRadius: '8px',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Download CSV
        </button>
      </div>

      {/* Desktop table */}
      <div
        ref={tableRef}
        style={{
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
        }}
        className="ledger-table-wrap"
      >
        {/* Vertical stamp line */}
        <div style={{
          position: 'absolute',
          left: '56px',
          top: 0,
          bottom: 0,
          width: '1px',
          background: 'var(--stamp)',
          opacity: 0.35,
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        <table style={{ width: '100%', borderCollapse: 'collapse' }} className="ledger-table">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)' }}>
              {['WHEN', 'WHAT', 'FROM', 'TO', 'AMOUNT', 'TX', ...(multiPayroll ? ['PAYROLL'] : [])].map((col, ci) => (
                <th key={col} style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  // First column starts at 72px to clear the 56px stamp line.
                  padding: ci === 0 ? '12px 16px 12px 72px' : '12px 16px',
                  fontWeight: 400,
                  textAlign: col === 'AMOUNT' ? 'right' : 'left',
                  whiteSpace: 'nowrap',
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const isClickable = row.kind === 'payslip' && !!onPayslipClick;
              return (
              <motion.tr
                key={`${row.txHash}-${row.logIndex}`}
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                whileInView={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 0px -20px 0px' }}
                transition={{ duration: 0.25, delay: reducedMotion ? 0 : Math.min(i % PAGE, PAGE - 1) * 0.03 }}
                style={{ borderBottom: '1px solid var(--rule)', cursor: isClickable ? 'pointer' : 'default' }}
                whileHover={{ background: 'var(--paper)' }}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPayslipClick(row, e.currentTarget); } } : undefined}
                onClick={isClickable ? (e) => onPayslipClick(row, e.currentTarget) : undefined}
                className={isClickable ? 'ledger-payslip-row' : ''}
              >
                <td style={{ padding: '10px 16px 10px 72px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                  {row.time ? formatUtcTime(row.time) : `block ${row.blockNumber.toLocaleString()}`}
                </td>
                <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: row.kind === 'unexplained' ? 'var(--stamp)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                  {describeRow(row)}
                </td>
                <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{addrLink(row.from, explorer)}</td>
                <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{addrLink(row.to, explorer)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: row.direction === 'in' ? 'var(--paid)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                  {formatAmount(row)}
                </td>
                <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{txLink(row.txHash, explorer)}</td>
                {multiPayroll && (
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{addrLink(row.payroll, explorer)}</td>
                )}
                {isClickable && (
                  <td style={{ padding: '10px 8px 10px 0', width: '20px' }}>
                    <span className="row-chevron" aria-hidden="true" style={{ opacity: 0, transition: 'opacity 120ms', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--ink-3)' }}>&#8250;</span>
                  </td>
                )}
              </motion.tr>
              );
            })}
          </tbody>
        </table>

        {visibleCount < allRows.length && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--rule)', textAlign: 'center' }}>
            <button
              onClick={() => setVisibleCount(v => v + PAGE)}
              className="btn-secondary"
              style={{
                height: '36px',
                padding: '0 20px',
                borderRadius: '8px',
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Show {Math.min(PAGE, allRows.length - visibleCount)} more
            </button>
          </div>
        )}
      </div>

      {/* Mobile card list */}
      <div className="ledger-mobile-list" style={{ display: 'none' }}>
        {visible.map(row => {
          const isMobClickable = row.kind === 'payslip' && !!onPayslipClick;
          return (
          <div
            key={`mob-${row.txHash}-${row.logIndex}`}
            onClick={isMobClickable ? (e) => onPayslipClick(row, e.currentTarget) : undefined}
            style={{
              background: 'var(--slip)',
              border: '1px solid var(--rule)',
              borderRadius: '8px',
              padding: '14px 16px',
              marginBottom: '8px',
              cursor: isMobClickable ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: row.kind === 'unexplained' ? 'var(--stamp)' : 'var(--ink)', fontWeight: 500 }}>
                {describeRow(row)}
              </span>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: row.direction === 'in' ? 'var(--paid)' : 'var(--ink)' }}>
                {formatAmount(row)}
              </span>
            </div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '4px' }}>
              {row.time ? formatUtcTime(row.time) : `block ${row.blockNumber.toLocaleString()}`}
            </div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-2)', marginBottom: '4px' }}>
              {shortAddr(row.from)} &rarr; {shortAddr(row.to)}
            </div>
            <div>{txLink(row.txHash, explorer)}</div>
          </div>
          );
        })}
        {visibleCount < allRows.length && (
          <button
            onClick={() => setVisibleCount(v => v + PAGE)}
            className="btn-secondary"
            style={{
              width: '100%',
              height: '40px',
              borderRadius: '8px',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            Show {Math.min(PAGE, allRows.length - visibleCount)} more
          </button>
        )}
      </div>

      <style>{`
        .ledger-payslip-row:hover .row-chevron,
        .ledger-payslip-row:focus-within .row-chevron { opacity: 1 !important; }
        @media (max-width: 767px) {
          .ledger-section { padding: 0 20px 48px !important; }
          .ledger-table-wrap { display: none !important; }
          .ledger-mobile-list { display: block !important; }
        }
      `}</style>
    </section>
  );
}
