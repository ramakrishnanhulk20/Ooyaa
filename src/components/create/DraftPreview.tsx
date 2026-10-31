/**
 * The DRAFT card shown in the right column of /new.
 * Shows up to 3 payslips with the typed payee addresses and amounts, plus
 * a schedule line and funded-for count. Updates on every keystroke; changed
 * values fade 150 ms so the user can see what changed.
 */
// No useState needed -- FadeValue is a pure span.
import { Link } from 'react-router-dom';
import type { DraftPayroll } from '../../payroll/draft.js';
import { parseUsdcInput, fundAmount, PERIOD_OPTIONS } from '../../payroll/draft.js';
import { shortAddress, formatUsdc, cadence } from '../../payroll/format.js';
import { isAddress, getAddress } from 'viem';
import { ARC_MAINNET } from '../../deployments.js';

type Props = {
  draft: DraftPayroll;
};

function periodLabel(n: number): string {
  return `PAYSLIP, PERIOD ${String(n).padStart(4, '0')}`;
}

// FadeValue: CSS animation restart via key prop on each value change.
function FadeValue({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <span
      key={value}
      className="fade-value"
      style={{ fontFamily: mono ? '"IBM Plex Mono", monospace' : 'inherit' }}
    >
      {value}
    </span>
  );
}

function DraftPayslip({
  address,
  amountUsdc,
  index,
}: {
  address: string;
  amountUsdc: string;
  index: number;
}) {
  const rotations = ['-1.5deg', '0deg', '1.2deg'];
  const rotation = rotations[index % 3];
  const offsetTop = index * 10;
  const offsetLeft = index * 6;

  const displayAddr = isAddress(address.trim()) ? shortAddress(getAddress(address.trim())) : (address.trim() || '0x...');
  const units = parseUsdcInput(amountUsdc.trim());
  const displayAmount = units !== null && units > 0n ? formatUsdc(units) : '...';

  return (
    <div
      style={{
        position: 'absolute',
        top: `${offsetTop}px`,
        left: `${offsetLeft}px`,
        width: '100%',
        transform: `rotate(${rotation})`,
      }}
    >
      <div
        style={{
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          boxShadow: '0 18px 40px -24px rgba(18,25,63,.25)',
          padding: '20px 24px 20px 32px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Left perforation strip */}
        <div
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

        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
            {periodLabel(1)}
          </span>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
            OOYAA
          </span>
        </div>

        {/* Address and amount */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.9375rem', color: 'var(--ink)', marginBottom: '4px' }}>
            <FadeValue value={displayAddr} mono />
          </div>
          <div style={{ fontFamily: '"Fraunces Variable", Georgia, serif', fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0', fontWeight: 600, fontSize: '2.5rem', color: 'var(--ink)', lineHeight: 1 }}>
            <FadeValue value={displayAmount} />
          </div>
        </div>

        {/* Status row */}
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
          Draft
        </div>
      </div>
    </div>
  );
}

export function DraftPreview({ draft }: Props) {
  const visiblePayees = draft.payees.slice(0, 3);
  const extraCount = draft.payees.length > 3 ? draft.payees.length - 3 : 0;
  const stackHeight = 200 + visiblePayees.length * 10;

  const periodOpt = PERIOD_OPTIONS.find(o => o.seconds === draft.periodSeconds);
  const cadenceText = periodOpt ? cadence(BigInt(draft.periodSeconds)) : 'every 2 minutes';

  const totalFund = fundAmount(draft, draft.fundPaydays);
  const fundedLine = draft.fundLater
    ? 'Not funding yet'
    : totalFund !== null
      ? `Funded for ${draft.fundPaydays} payday${draft.fundPaydays !== 1 ? 's' : ''}`
      : 'Enter amounts to see funding';

  return (
    <div
      style={{
        background: 'var(--slip)',
        border: '1px solid var(--rule)',
        borderRadius: '8px',
        padding: '28px',
        boxShadow: '0 24px 60px -32px rgba(18,25,63,.28)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
          DRAFT
        </span>
        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.875rem', color: 'var(--ink-3)' }}>
          <FadeValue value={cadenceText} />
        </span>
      </div>

      {/* Funded line */}
      <div style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink-2)', marginBottom: '24px' }}>
        <FadeValue value={fundedLine} />
      </div>

      {/* Payslip stack */}
      <div style={{ position: 'relative', height: `${stackHeight}px`, marginBottom: extraCount > 0 ? '12px' : '0' }}>
        {visiblePayees.map((p, i) => (
          <DraftPayslip
            key={i}
            address={p.address}
            amountUsdc={p.amountUsdc}
            index={i}
          />
        ))}
      </div>

      {extraCount > 0 && (
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginTop: '8px' }}>
          +{extraCount} more {extraCount === 1 ? 'payee' : 'payees'}
        </div>
      )}

      {/* Link to demo payroll */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--rule)' }}>
        <Link
          to={`/p/${ARC_MAINNET.demoPayroll}`}
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.875rem', color: 'var(--ink-3)', textDecoration: 'none' }}
          className="link-underline"
        >
          See a live example
        </Link>
      </div>
    </div>
  );
}
