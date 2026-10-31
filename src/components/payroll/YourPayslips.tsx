/**
 * C.3 -- "Your payslips" band.
 * Shows only when a wallet is connected and its address appears in the payee list
 * or in the ledger rows (covers historical payees no longer in the active list).
 * No signature is needed; all data comes from on-chain events already fetched.
 */
import { useAccount } from 'wagmi';
import { getAddress } from 'viem';
import type { Address } from 'viem';
import type { LedgerRow } from '../../proof/rows.js';
import { filterPayeeRows, buildPayeeCsv, downloadCsvFile } from './payslipUtils.js';
import { ClaimButton } from './ClaimButton.js';

type Props = {
  payroll: Address;
  rows: LedgerRow[];
  /** Claimable USDC amount from the contract (0n if nothing to claim). */
  claimable: bigint;
  /** Called after a successful claim so the parent can refetch state. */
  onClaimSuccess?: () => void;
};

function StatFigure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        color: 'var(--ink-3)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: '"Fraunces Variable", Georgia, serif',
        fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
        fontWeight: 600,
        fontSize: '1.75rem',
        color: 'var(--ink)',
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

function fmtUsdc(n: bigint): string {
  const s = (Number(n) / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
  return `${s} USDC`;
}

export function YourPayslips({ payroll, rows, claimable, onClaimSuccess }: Props) {
  const { address } = useAccount();

  if (!address) return null;

  const myRows = filterPayeeRows(rows, address);
  if (myRows.length === 0) return null;

  const totalPaid = myRows.reduce((sum, r) => sum + r.amount, 0n);

  function download() {
    if (!address) return;
    const csv = buildPayeeCsv(filterPayeeRows(rows, address), payroll);
    const name = `my-payslips-${getAddress(payroll).slice(0, 10)}.csv`;
    downloadCsvFile(csv, name);
  }

  return (
    <section style={{
      borderTop: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '48px 48px',
      }} className="your-payslips-container">
        <h2 style={{
          fontFamily: '"Fraunces Variable", Georgia, serif',
          fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
          fontWeight: 600,
          fontSize: '2rem',
          color: 'var(--ink)',
          margin: '0 0 28px',
          lineHeight: 1.1,
        }}>
          Your payslips.
        </h2>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: '40px',
          marginBottom: '28px',
          alignItems: 'flex-end',
        }}>
          <StatFigure label="PAYSLIPS" value={String(myRows.length)} />
          <StatFigure label="PAID TO YOU" value={fmtUsdc(totalPaid)} />
          {claimable > 0n && (
            <StatFigure label="HELD FOR CLAIM" value={fmtUsdc(claimable)} />
          )}
        </div>

        {/* Claim button: shown only when the connected wallet has held pay */}
        {claimable > 0n && (
          <ClaimButton
            payroll={payroll}
            claimable={claimable}
            onSuccess={onClaimSuccess ?? (() => {})}
          />
        )}

        <button
          onClick={download}
          className="btn-secondary"
          style={{
            height: '40px',
            padding: '0 20px',
            borderRadius: '8px',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontWeight: 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Download my payslips (CSV)
        </button>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .your-payslips-container { padding: 36px 20px !important; }
        }
      `}</style>
    </section>
  );
}
