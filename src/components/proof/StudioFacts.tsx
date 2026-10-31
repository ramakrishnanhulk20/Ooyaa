import type { CheckResult } from '../../proof/checks.js';
import { ARC_MAINNET, ARC_TESTNET } from '../../deployments.js';
import buildFacts from '../../generated/build-facts.json';

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

type Props = {
  checks: CheckResult[];
};

export function StudioFacts({ checks }: Props) {
  const c2 = checks.find(c => c.id === 'C2');
  const c3 = checks.find(c => c.id === 'C3');
  const generatedDate = new Date(buildFacts.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const addresses = [
    { label: 'Mainnet factory', addr: ARC_MAINNET.factory, explorer: ARC_MAINNET.explorer },
    { label: 'Demo payroll', addr: ARC_MAINNET.demoPayroll, explorer: ARC_MAINNET.explorer },
    { label: 'Testnet factory', addr: ARC_TESTNET.factory, explorer: ARC_TESTNET.explorer },
  ];

  // When failed > 0, style the count like a FAIL mark.
  function failStyle(failed: number): React.CSSProperties {
    return failed > 0 ? {
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.8125rem',
      color: 'var(--slip)',
      background: 'var(--ink)',
      borderRadius: '4px',
      padding: '2px 6px',
      display: 'inline-block',
    } : {};
  }

  return (
    <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 48px 96px' }} className="studio-facts-section">
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '64px',
        alignItems: 'start',
      }} className="studio-facts-grid">
        {/* Left: built in Arc Studio */}
        <div>
          <h2 style={{
            fontFamily: '"Fraunces Variable", Georgia, serif',
            fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
            fontWeight: 600,
            fontSize: '2rem',
            color: 'var(--ink)',
            margin: '0 0 16px',
            lineHeight: 1.1,
          }}>
            Built in Arc Studio.
          </h2>
          <p style={{
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '1rem',
            color: 'var(--ink-2)',
            margin: '0 0 24px',
            lineHeight: 1.6,
            maxWidth: '42ch',
          }}>
            Studio wrote and tested every contract and every screen on this site. The bytecode on Arc mainnet is byte for byte the code Studio deployed to testnet.
          </p>
          <a
            href="https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              textDecoration: 'underline',
            }}
          >
            Open the Studio project
          </a>

          {/* Address list */}
          <div style={{ marginTop: '32px' }}>
            {addresses.map(({ label, addr, explorer }) => (
              <div key={label} style={{ marginBottom: '12px' }}>
                <div style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  marginBottom: '2px',
                }}>
                  {label}
                </div>
                <a
                  href={`${explorer}/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.875rem',
                    color: 'var(--ink)',
                    textDecoration: 'underline',
                  }}
                >
                  {shortAddr(addr)}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Right: fact rows */}
        <div>
          {/* Foundry unit and invariant row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
            gap: '16px',
          }}>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-2)',
              minWidth: 0,
            }}>
              Foundry unit and invariant tests
            </span>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink)',
              flexShrink: 0,
            }}>
              {buildFacts.foundry.passed} passing
              {buildFacts.foundry.failed > 0 && (
                <>, <span style={failStyle(buildFacts.foundry.failed)}>{buildFacts.foundry.failed} failing</span></>
              )}
            </span>
          </div>

          {/* Fork tests row */}
          <div style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
          }}>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-2)',
              display: 'block',
            }}>
              Real-USDC fork tests: {buildFacts.fork.tests}, run against Arc state with Arc's Foundry, not counted here.
            </span>
          </div>

          {/* App tests row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
            gap: '16px',
          }}>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-2)',
              minWidth: 0,
            }}>
              App tests
            </span>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink)',
              flexShrink: 0,
            }}>
              {buildFacts.app.passed} passing
              {buildFacts.app.failed > 0 && (
                <>, <span style={failStyle(buildFacts.app.failed)}>{buildFacts.app.failed} failing</span></>
              )}
            </span>
          </div>

          {/* Counted date */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
            gap: '16px',
          }}>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
              Counted
            </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink)', flexShrink: 0 }}>
              {generatedDate} by bun run facts
            </span>
          </div>

          {/* Live checks from the proof run */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
            gap: '16px',
          }}>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
              Mainnet code equals testnet deploy
            </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink)', flexShrink: 0 }}>
              {c2 ? c2.status : 'running...'}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
            gap: '16px',
          }}>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)' }}>
              Source verified
            </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink)', flexShrink: 0 }}>
              {c3 ? c3.status : 'running...'}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .studio-facts-section { padding: 0 20px 64px !important; }
          .studio-facts-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
