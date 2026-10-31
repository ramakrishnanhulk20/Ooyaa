import { type Address, getAddress } from 'viem';
import type { StreamedLedger } from '../../proof/useProofReport.js';
import { ARC_MAINNET } from '../../deployments.js';

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

type RunnerInfo = {
  address: Address;
  outside: boolean;
  runs: number;
};

function collectRunners(ledgers: StreamedLedger[]): RunnerInfo[] {
  const seen = new Map<string, RunnerInfo>();
  // Count PaydayRun events per runner across all ledger histories.
  for (const l of ledgers) {
    const outsideSet = new Set(l.ledger.outsideRunners.map(a => a.toLowerCase()));
    for (const ev of l.history.events) {
      if (ev.eventName !== 'PaydayRun') continue;
      const runner = (ev.args.runner as string | undefined) ?? '';
      if (!runner) continue;
      const low = runner.toLowerCase();
      const existing = seen.get(low);
      if (existing) {
        existing.runs += 1;
      } else {
        seen.set(low, { address: getAddress(runner), outside: outsideSet.has(low), runs: 1 });
      }
    }
  }
  // Outside runners first (most runs within each group), then ours.
  const all = [...seen.values()];
  all.sort((a, b) => {
    if (a.outside && !b.outside) return -1;
    if (!a.outside && b.outside) return 1;
    return b.runs - a.runs;
  });
  return all;
}

type Props = {
  ledgers: StreamedLedger[] | undefined;
};

export function WalletList({ ledgers }: Props) {
  if (!ledgers) return null;

  const runners = collectRunners(ledgers);
  const outsideCount = runners.filter(r => r.outside).length;
  const total = runners.length;

  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '64px 48px' }} className="wallet-list-section">
      <h2 style={{
        fontFamily: '"Fraunces Variable", Georgia, serif',
        fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
        fontWeight: 600,
        fontSize: '2rem',
        color: 'var(--ink)',
        margin: '0 0 8px',
        lineHeight: 1.1,
      }}>
        {total} wallet{total === 1 ? ' has' : 's have'} run payday.{' '}
        {outsideCount} of them {outsideCount === 1 ? 'is' : 'are'} not ours.
      </h2>
      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontSize: '1rem',
        color: 'var(--ink-2)',
        margin: '0 0 32px',
        maxWidth: '54ch',
        lineHeight: 1.5,
      }}>
        A wallet counts as ours when it is the employer or a payee of that payroll. Anyone else is outside, drawn by the tip.
      </p>

      {outsideCount === 0 ? (
        <p style={{
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: '1rem',
          color: 'var(--ink-2)',
          margin: 0,
        }}>
          None yet. Run one from the home page and your wallet will be the first.
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0',
        }} className="wallet-list-grid">
          {runners.map(r => (
            <div
              key={r.address}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 0',
                borderBottom: '1px solid var(--rule)',
              }}
            >
              <a
                href={`${ARC_MAINNET.explorer}/address/${getAddress(r.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.9375rem',
                  color: 'var(--ink)',
                  textDecoration: 'underline',
                }}
              >
                {shortAddr(getAddress(r.address))}
              </a>
              <span style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.75rem',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: r.outside ? 'var(--paid)' : 'var(--ink-3)',
              }}>
                {r.outside ? 'OUTSIDE' : 'OURS'}, {r.runs} {r.runs === 1 ? 'run' : 'runs'}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .wallet-list-section { padding: 48px 20px !important; }
          .wallet-list-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
