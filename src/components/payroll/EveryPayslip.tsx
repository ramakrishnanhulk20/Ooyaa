/**
 * C.4 -- "Every payslip" section for a single payroll.
 * Shows filter chips (All / Payslips / Tips / Funding), a download CSV button,
 * and a table of payslip rows clickable to open the slip drawer.
 * History comes from useHistory() so every consumer on this page shares one fetch.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Address } from 'viem';
import type { LedgerRow } from '../../proof/rows.js';
import type { PayrollHistory } from '../../proof/history.js';
import { buildLedgerRows, describeRow } from '../../proof/rows.js';
import { useHistory } from '../../proof/useHistory.js';
import { buildAllCsv, downloadCsvFile } from './payslipUtils.js';
import type { DrawerRow } from './SlipDrawer.js';
import { ARC_MAINNET } from '../../deployments.js';

export type FilterKind = 'all' | 'payslips' | 'tips' | 'funding';

const FILTER_LABELS: Record<FilterKind, string> = {
  all: 'ALL',
  payslips: 'PAYSLIPS',
  tips: 'TIPS',
  funding: 'FUNDING',
};

function applyFilter(rows: LedgerRow[], filter: FilterKind): LedgerRow[] {
  if (filter === 'all') return rows;
  if (filter === 'payslips') return rows.filter(r => r.kind === 'payslip');
  if (filter === 'tips') return rows.filter(r => r.kind === 'tip');
  if (filter === 'funding') return rows.filter(r => r.kind === 'funded' || r.kind === 'direct');
  return rows;
}

type Props = {
  payroll: Address;
  employer: Address;
  fromBlock: bigint;
  onPayslipClick: (row: DrawerRow, triggerEl: HTMLElement) => void;
  onHistoryLoaded: (history: PayrollHistory) => void;
};

export function EveryPayslip({ payroll, employer, fromBlock, onPayslipClick, onHistoryLoaded }: Props) {
  const [filter, setFilter] = useState<FilterKind>('all');
  const loadedRef = useRef<string | null>(null);

  const { history, status } = useHistory(payroll, fromBlock);

  // Notify parent once history is loaded, using a stable key to avoid re-notifying
  // on re-renders with the same data.
  const historyKey = history ? `${payroll}-${history.toBlock}` : null;
  useEffect(() => {
    if (!history || loadedRef.current === historyKey) return;
    loadedRef.current = historyKey;
    onHistoryLoaded(history);
  }, [history, historyKey, onHistoryLoaded]);

  const allRows = history ? buildLedgerRows(history, employer) : [];
  const filteredRows = applyFilter(allRows, filter);

  const payslipCount = allRows.filter(r => r.kind === 'payslip').length;

  function downloadCsv() {
    const csv = buildAllCsv(filteredRows);
    const label = filter === 'all' ? 'all' : filter;
    downloadCsvFile(csv, `ooyaa-payroll-${payroll.slice(0, 10)}-${label}.csv`);
  }

  // Wrap LedgerTable's payslip click to cast the row type.
  const handlePayslipClick = useCallback((row: LedgerRow, el: HTMLElement) => {
    if (row.kind !== 'payslip') return;
    onPayslipClick(row as DrawerRow, el);
  }, [onPayslipClick]);



  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 48px 0' }} className="every-payslip-section">
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap' as const,
        gap: '12px',
      }}>
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
            Every payslip.
          </h2>
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.8125rem',
            color: 'var(--ink-3)',
          }}>
            {status === 'loading'
              ? 'Loading...'
              : filter === 'all'
                ? `${allRows.length} rows, newest first.`
                : `${filteredRows.length} of ${allRows.length} rows, newest first.`}
          </div>
        </div>
        <button
          onClick={downloadCsv}
          disabled={status === 'loading'}
          className="btn-secondary"
          style={{
            height: '40px',
            padding: '0 16px',
            borderRadius: '8px',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            opacity: status === 'loading' ? 0.35 : 1,
          }}
        >
          {status === 'loading' ? 'Download CSV' : `Download CSV (${filteredRows.length} rows)`}
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
        {(['all', 'payslips', 'tips', 'funding'] as FilterKind[]).map(f => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: '1px solid var(--rule)',
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--paper)' : 'var(--ink-3)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.75rem',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {FILTER_LABELS[f]}
              {f === 'payslips' && payslipCount > 0 ? ` (${payslipCount})` : ''}
            </button>
          );
        })}
      </div>

      {/* Table -- render with the filtered rows via a filtered synthetic ledger */}
      {status === 'error' && (
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.875rem',
          color: 'var(--stamp)',
          padding: '24px 0',
        }}>
          Could not load ledger. Refresh to try again.
        </div>
      )}

      {status !== 'error' && (
        <FilteredLedgerTable
          allRows={allRows}
          filter={filter}
          payroll={payroll}
          employer={employer}
          history={history}
          onPayslipClick={handlePayslipClick}
        />
      )}

      <style>{`
        @media (max-width: 767px) {
          .every-payslip-section { padding: 36px 20px 0 !important; }
        }
      `}</style>
    </section>
  );
}

// FilteredLedgerTable wraps LedgerTable but intercepts its internal row building
// to show only the currently-filtered rows. Since LedgerTable builds rows from
// the ledger's history, the simplest approach is to pass a synthetic ledger whose
// events are pre-filtered.  Instead, we render our own table wrapper to avoid
// duplicating the complex table markup. We just pass LedgerTable the full ledger
// but add a filter chip note -- LedgerTable's "all rows" will include all kinds.
// The filter is only meaningful for the CSV download and the chip count display.
// For the actual table rendering with clickable payslip rows we always pass the
// full history and let LedgerTable show all rows when filter === 'all'.
// When filter != 'all', we need to pass a filtered-down ledger. The cleanest
// approach: create a minimal wrapper that builds filtered rows and passes them
// to a stripped-down table component.

type FilteredProps = {
  allRows: LedgerRow[];
  filter: FilterKind;
  payroll: Address;
  employer: Address;
  history: PayrollHistory | undefined;
  onPayslipClick: (row: LedgerRow, el: HTMLElement) => void;
};

// Reuse LedgerTable directly; it will build all rows from the ledger. Since we
// want filtering to work, we synthesise a filtered history by replacing the
// events. LedgerTable calls buildLedgerRows(history, employer) internally, so we
// need to splice the history. However that is invasive. Instead, just let
// LedgerTable render all rows and use filter chips solely to drive the CSV
// download and the chip counts. The spec chip behaviour is: chips filter the
// visible table. So we MUST control visible rows. We achieve this by passing
// a filtered streamedLedgers where the history.events only contain matching events.
// But history.events is read-only. The cleanest way: build a separate simple table
// component using the already-built filteredRows, not LedgerTable.
// Using LedgerTable as-is gives us the correct animated design; we just need to
// feed it a synthetic StreamedLedger whose history produces the right rows.
// The trick: create a fake history whose `events`, `usdcIn`, `usdcOut` etc are
// sliced down to the filter. This is complex; instead, accept LedgerTable shows
// all rows, and the chips only highlight which type is being focused. The spec
// says "Filter chips: All, Payslips, Tips, Funding" so they must actually filter.
// Final approach: skip the LedgerTable component for the payroll page and use a
// purpose-built compact table that operates on filteredRows directly. This avoids
// invasive changes to the shared LedgerTable used on the proof page.
function FilteredLedgerTable({ allRows, filter, payroll, employer, history, onPayslipClick }: FilteredProps) {
  void employer;
  void history;

  const filteredRows = applyFilter(allRows, filter);

  // Delegate to LedgerTable with a synthetic ledger built from filteredRows.
  // Since LedgerTable's internals call buildLedgerRows, we need to pre-build.
  // Easiest: render LedgerTable with a carefully-crafted synthetic ledger.
  // BUT: LedgerTable maps through `ledgers` and calls buildLedgerRows for each.
  // So the only way to make it show filtered rows is to not use LedgerTable.
  // We implement a compact table here using the same visual style.

  return (
    <PayrollLedgerTable
      rows={filteredRows}
      payroll={payroll}
      onPayslipClick={onPayslipClick}
    />
  );
}

// A compact ledger table for a single payroll, shares visual DNA with LedgerTable
// but is purpose-built so filter chips actually control the visible rows.
const PAGE = 25;

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fmtTime(ts: bigint | undefined, blockNum: bigint): string {
  if (!ts) return `block ${blockNum.toLocaleString('en-US')}`;
  const d = new Date(Number(ts) * 1000);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const sameDay =
    d.getUTCFullYear() === today.getUTCFullYear() &&
    d.getUTCMonth() === today.getUTCMonth() &&
    d.getUTCDate() === today.getUTCDate();
  const day = sameDay ? '' : `, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  return `${h}:${m} UTC${day}`;
}

function fmtAmt(row: LedgerRow): string {
  const usdc = Number(row.amount) / 1_000_000;
  const sign = row.direction === 'in' ? '+' : '-';
  const s = usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return `${sign}${s}`;
}

type TableProps = {
  rows: LedgerRow[];
  payroll: Address;
  onPayslipClick: (row: LedgerRow, el: HTMLElement) => void;
};

function PayrollLedgerTable({ rows, payroll, onPayslipClick }: TableProps) {
  void payroll;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const visible = rows.slice(0, visibleCount);
  const explorer = ARC_MAINNET.explorer;

  if (rows.length === 0) {
    return (
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.875rem',
        color: 'var(--ink-3)',
        padding: '24px 0 48px',
      }}>
        No rows yet.
      </div>
    );
  }

  return (
    <div>
      {/* Desktop table */}
      <div style={{
        background: 'var(--slip)',
        border: '1px solid var(--rule)',
        borderRadius: '8px',
        overflow: 'hidden',
      }} className="payroll-table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)' }}>
              {['WHEN', 'WHAT', 'FROM', 'TO', 'AMOUNT', 'TX'].map((col) => (
                <th key={col} style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  padding: '12px 16px',
                  fontWeight: 400,
                  textAlign: col === 'AMOUNT' ? 'right' : 'left',
                  whiteSpace: 'nowrap' as const,
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => {
              const isPayslip = row.kind === 'payslip';
              return (
                <tr
                  key={`${row.txHash}-${row.logIndex}`}
                  onClick={isPayslip ? (e) => onPayslipClick(row, e.currentTarget) : undefined}
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    cursor: isPayslip ? 'pointer' : 'default',
                  }}
                  className={isPayslip ? 'payslip-row' : ''}
                >
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                    {fmtTime(row.time, row.blockNumber)}
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: row.kind === 'unexplained' ? 'var(--stamp)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                    {describeRow(row)}
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <a href={`${explorer}/address/${row.from}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}>
                      {shortAddr(row.from)}
                    </a>
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <a href={`${explorer}/address/${row.to}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}>
                      {shortAddr(row.to)}
                    </a>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: row.direction === 'in' ? 'var(--paid)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                    {fmtAmt(row)} USDC
                  </td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                    <a href={`${explorer}/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}>
                      {shortAddr(row.txHash)}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleCount < rows.length && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--rule)', textAlign: 'center' }}>
            <button
              onClick={() => setVisibleCount(v => v + PAGE)}
              className="btn-secondary"
              style={{ height: '36px', padding: '0 20px', borderRadius: '8px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Show {Math.min(PAGE, rows.length - visibleCount)} more
            </button>
          </div>
        )}
      </div>

      {/* Mobile card list */}
      <div className="payroll-mobile-list" style={{ display: 'none' }}>
        {visible.map(row => {
          const isPayslip = row.kind === 'payslip';
          return (
            <div
              key={`mob-${row.txHash}-${row.logIndex}`}
              onClick={isPayslip ? (e) => onPayslipClick(row, e.currentTarget) : undefined}
              style={{
                background: 'var(--slip)',
                border: '1px solid var(--rule)',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '8px',
                cursor: isPayslip ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: row.kind === 'unexplained' ? 'var(--stamp)' : 'var(--ink)', fontWeight: 500 }}>
                  {describeRow(row)}
                </span>
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: row.direction === 'in' ? 'var(--paid)' : 'var(--ink)' }}>
                  {fmtAmt(row)} USDC
                </span>
              </div>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '4px' }}>
                {fmtTime(row.time, row.blockNumber)}
              </div>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-2)', marginBottom: '4px' }}>
                {shortAddr(row.from)} &rarr; {shortAddr(row.to)}
              </div>
              <div>
                <a href={`${explorer}/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textDecoration: 'underline' }}>
                  {shortAddr(row.txHash)}
                </a>
              </div>
            </div>
          );
        })}
        {visibleCount < rows.length && (
          <button
            onClick={() => setVisibleCount(v => v + PAGE)}
            className="btn-secondary"
            style={{ width: '100%', height: '40px', borderRadius: '8px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer', marginTop: '4px' }}
          >
            Show {Math.min(PAGE, rows.length - visibleCount)} more
          </button>
        )}
      </div>

      <style>{`
        .payslip-row:hover { background: var(--paper); }
        @media (max-width: 767px) {
          .payroll-table-wrap { display: none !important; }
          .payroll-mobile-list { display: block !important; }
        }
      `}</style>
    </div>
  );
}
