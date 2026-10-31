import { useRef, useState } from 'react';
import { Payslip } from '../components/Payslip.js';
import type { PayslipHandle } from '../components/Payslip.js';
import { Nav } from '../components/Nav.js';
import { Stamp, type StampHandle } from '../components/Stamp.js';
import { ARC_MAINNET } from '../deployments.js';

const EXPLORER = ARC_MAINNET.explorer;

// Example data from the spec: demo payroll first payee
const DEMO_PAYEE = '0x96E81DA285BB91B7D02eE3e6ad51Fa3cAf5daB75' as const;
const DEMO_AMOUNT = 10000n;
const DEMO_TX = '0x0692c42dd090bf022e41b9bb57d130ec6c1402615e0abb10d6ba9f1674c07fec' as const;
// Computed at module load time, not during render -- avoids purity lint for Date.now.
const NOW_CHAIN = BigInt(Math.floor(Date.now() / 1000));
const DUE_AT = NOW_CHAIN + 3600n;

const TOKENS = [
  { name: '--paper',  hex: '#F5F5F3', label: 'page' },
  { name: '--slip',   hex: '#FFFFFF', label: 'payslip paper' },
  { name: '--ink',    hex: '#12193F', label: 'headlines' },
  { name: '--ink-2',  hex: '#575A64', label: 'body' },
  { name: '--ink-3',  hex: '#8A8D97', label: 'captions' },
  { name: '--rule',   hex: '#D9D9D4', label: 'hairlines' },
  { name: '--stamp',  hex: '#D23A24', label: 'PAID stamp' },
  { name: '--paid',   hex: '#1A7F6B', label: 'status paid' },
  { name: '--held',   hex: '#5B6B8C', label: 'status held' },
];

/**
 * /lab: design reference page. Only rendered in DEV builds.
 * Shows type A/B, three payslip states, stamp controls, and token swatches.
 */
// Example ledger row data -- labelled EXAMPLE STATE in the lab, not from the network.
const EX_RUNNER = '0x4444444444444444444444444444444444444444';
const EX_PAYROLL = '0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A';
const EX_TX = '0x0692c42dd090bf022e41b9bb57d130ec6c1402615e0abb10d6ba9f1674c07fec';

export function LabPage() {
  const [animate] = useState(true);
  const dueRef = useRef<PayslipHandle>(null);
  const paidRef = useRef<PayslipHandle>(null);
  const heldRef = useRef<PayslipHandle>(null);
  const proofStampRef = useRef<StampHandle>(null);

  function stampPaid() {
    void dueRef.current?.stamp('paid');
    setTimeout(() => void paidRef.current?.stamp('paid'), 90);
    setTimeout(() => void heldRef.current?.stamp('paid'), 180);
  }

  function stampAlready() {
    void dueRef.current?.stamp('already');
    setTimeout(() => void paidRef.current?.stamp('already'), 90);
    setTimeout(() => void heldRef.current?.stamp('already'), 180);
  }

  function reset() {
    dueRef.current?.resetStamp();
    paidRef.current?.resetStamp();
    heldRef.current?.resetStamp();
  }

  const section: React.CSSProperties = {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '48px 48px',
  };

  const label: React.CSSProperties = {
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--ink-3)',
    marginBottom: '12px',
    display: 'block',
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <Nav />
      <main>

        {/* 1. Type A/B */}
        <div style={section}>
          <span style={label}>Type A/B</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div>
              <p style={{
                fontFamily: '"Fraunces Variable", Georgia, serif',
                fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
                fontWeight: 600,
                fontSize: 'clamp(3.5rem, 8vw, 7rem)',
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
                color: 'var(--ink)',
                margin: 0,
              }}>
                Payday that never misses.
              </p>
              <span style={{ ...label, marginTop: '8px' }}>A. Fraunces 600, opsz 144</span>
            </div>
            <div>
              <p style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontWeight: 400,
                fontSize: 'clamp(3.5rem, 8vw, 7rem)',
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
                color: 'var(--ink)',
                margin: 0,
              }}>
                Payday that never misses.
              </p>
              <span style={{ ...label, marginTop: '8px' }}>B. Instrument Serif 400</span>
            </div>
          </div>
        </div>

        {/* 2. Payslip states */}
        <div style={section}>
          <span style={label}>Payslip states</span>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Due */}
            <div style={{ width: '340px', position: 'relative', height: '200px' }}>
              <Payslip
                ref={dueRef}
                period={0n}
                payee={DEMO_PAYEE}
                amount={DEMO_AMOUNT}
                status={{ kind: 'due', dueAt: DUE_AT, nowChain: NOW_CHAIN }}
                rotation="-1.5deg"
                index={0}
                animate={animate}
              />
            </div>

            {/* Paid */}
            <div style={{ width: '340px', position: 'relative', height: '200px' }}>
              <Payslip
                ref={paidRef}
                period={0n}
                payee={DEMO_PAYEE}
                amount={DEMO_AMOUNT}
                status={{ kind: 'paid', txHash: DEMO_TX, explorer: EXPLORER }}
                rotation="0deg"
                index={0}
                animate={animate}
              />
            </div>

            {/* Held */}
            <div style={{ width: '340px', position: 'relative', height: '200px' }}>
              <Payslip
                ref={heldRef}
                period={0n}
                payee={DEMO_PAYEE}
                amount={DEMO_AMOUNT}
                status={{ kind: 'held' }}
                rotation="+1.2deg"
                index={0}
                animate={animate}
              />
              <span style={{ ...label, marginTop: '212px', display: 'block' }}>
                Example state: no payout has ever been held
              </span>
            </div>
          </div>
        </div>

        {/* 3. Stamp controls */}
        <div style={{ ...section, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={stampPaid}
            style={{
              height: '40px',
              padding: '0 16px',
              borderRadius: '8px',
              background: 'var(--ink)',
              color: 'var(--paper)',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontWeight: 500,
              fontSize: '0.875rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Stamp PAID
          </button>
          <button
            onClick={stampAlready}
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
            Stamp ALREADY PAID
          </button>
          <button
            onClick={reset}
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
            Reset
          </button>
        </div>

        {/* 4. Proof sheet states */}
        <div style={section}>
          <span style={label}>Proof sheet states</span>
          <span style={{ ...label, color: 'var(--stamp)', marginBottom: '20px' }}>EXAMPLE STATE</span>

          {/* Example check rows */}
          <div style={{
            background: 'var(--slip)',
            border: '1px solid var(--rule)',
            borderRadius: '8px',
            padding: '28px',
            maxWidth: '480px',
            marginBottom: '24px',
            position: 'relative',
          }}>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: '12px' }}>
              PROOF SHEET
            </div>

            {/* Pending row */}
            <div style={{ borderBottom: '1px solid var(--rule)', padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', width: '22px' }}>C1</span>
                <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.9375rem', color: 'var(--ink)' }}>local build</span>
              </div>
              <div style={{ height: '2px', position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
                <div className="btn-sweep" style={{ height: '100%', background: 'var(--rule)' }} />
              </div>
            </div>

            {/* PASS row */}
            <div style={{ borderBottom: '1px solid var(--rule)', padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', width: '22px' }}>C2</span>
                <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.9375rem', color: 'var(--ink)' }}>same code on mainnet and testnet</span>
              </div>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 500, fontSize: '0.75rem', color: 'var(--paid)', border: '1.5px solid var(--paid)', borderRadius: '4px', padding: '2px 6px', display: 'inline-block', transform: 'rotate(-4deg)' }}>PASS</span>
            </div>

            {/* FAIL row */}
            <div style={{ borderBottom: '1px solid var(--rule)', padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', width: '22px' }}>C3</span>
                <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.9375rem', color: 'var(--ink)' }}>verified source</span>
              </div>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 500, fontSize: '0.75rem', color: 'var(--slip)', background: 'var(--ink)', borderRadius: '4px', padding: '2px 6px', display: 'inline-block' }}>FAIL</span>
            </div>

            {/* SKIP row */}
            <div style={{ padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', width: '22px' }}>C4</span>
                <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.9375rem', color: 'var(--ink)' }}>made by the factory</span>
              </div>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 400, fontSize: '0.75rem', color: 'var(--ink-3)', border: '1px dashed var(--ink-3)', borderRadius: '4px', padding: '2px 6px', display: 'inline-block' }}>SKIP</span>
            </div>

            {/* VERIFIED stamp */}
            <Stamp ref={proofStampRef} kind="verified" />
          </div>

          {/* Play VERIFIED stamp button */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>
            <button
              onClick={() => void proofStampRef.current?.play('verified')}
              style={{
                height: '40px',
                padding: '0 16px',
                borderRadius: '8px',
                background: 'var(--ink)',
                color: 'var(--paper)',
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Stamp VERIFIED
            </button>
            <button
              onClick={() => proofStampRef.current?.reset()}
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
              Reset
            </button>
          </div>

          {/* Example ledger rows */}
          <span style={{ ...label, marginBottom: '12px' }}>Ledger row examples (table)</span>
          <div style={{
            background: 'var(--slip)',
            border: '1px solid var(--rule)',
            borderRadius: '8px',
            overflow: 'hidden',
            maxWidth: '900px',
            marginBottom: '24px',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  {['WHEN', 'WHAT', 'FROM', 'TO', 'AMOUNT', 'TX'].map(col => (
                    <th key={col} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-3)', padding: '12px 16px', fontWeight: 400, textAlign: col === 'AMOUNT' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* In row */}
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>10:00 UTC, 28 Oct</td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: 'var(--ink)', whiteSpace: 'nowrap' }}>Funded</td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}><a href={`${ARC_MAINNET.explorer}/address/${EX_RUNNER}`} style={{ color: 'var(--ink)', textDecoration: 'underline' }}>{EX_RUNNER.slice(0,6)}...{EX_RUNNER.slice(-4)}</a></td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}><a href={`${ARC_MAINNET.explorer}/address/${EX_PAYROLL}`} style={{ color: 'var(--ink)', textDecoration: 'underline' }}>{EX_PAYROLL.slice(0,6)}...{EX_PAYROLL.slice(-4)}</a></td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--paid)', whiteSpace: 'nowrap' }}>+1.00 USDC</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}><a href={`${ARC_MAINNET.explorer}/tx/${EX_TX}`} style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}>{EX_TX.slice(0,6)}...{EX_TX.slice(-4)}</a></td>
                </tr>
                {/* Out row */}
                <tr>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>10:01 UTC, 28 Oct</td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: 'var(--ink)', whiteSpace: 'nowrap' }}>Payslip, period 0001</td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}><a href={`${ARC_MAINNET.explorer}/address/${EX_PAYROLL}`} style={{ color: 'var(--ink)', textDecoration: 'underline' }}>{EX_PAYROLL.slice(0,6)}...{EX_PAYROLL.slice(-4)}</a></td>
                  <td style={{ padding: '10px 16px', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}><a href={`${ARC_MAINNET.explorer}/address/${EX_RUNNER}`} style={{ color: 'var(--ink)', textDecoration: 'underline' }}>{EX_RUNNER.slice(0,6)}...{EX_RUNNER.slice(-4)}</a></td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink)', whiteSpace: 'nowrap' }}>-0.01 USDC</td>
                  <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}><a href={`${ARC_MAINNET.explorer}/tx/${EX_TX}`} style={{ color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}>{EX_TX.slice(0,6)}...{EX_TX.slice(-4)}</a></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile card examples */}
          <span style={{ ...label, marginBottom: '12px' }}>Ledger row examples (mobile card)</span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { what: 'Funded', amount: '+1.00 USDC', dir: 'in' as const },
              { what: 'Payslip, period 0001', amount: '-0.01 USDC', dir: 'out' as const },
            ].map(row => (
              <div key={row.what} style={{ background: 'var(--slip)', border: '1px solid var(--rule)', borderRadius: '8px', padding: '14px 16px', minWidth: '260px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: 'var(--ink)', fontWeight: 500 }}>{row.what}</span>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: row.dir === 'in' ? 'var(--paid)' : 'var(--ink)' }}>{row.amount}</span>
                </div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '4px' }}>10:00 UTC, 28 Oct</div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'var(--ink-2)', marginBottom: '4px' }}>{EX_RUNNER.slice(0,6)}...{EX_RUNNER.slice(-4)} &rarr; {EX_PAYROLL.slice(0,6)}...{EX_PAYROLL.slice(-4)}</div>
                <a href={`${ARC_MAINNET.explorer}/tx/${EX_TX}`} style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink)', textDecoration: 'underline' }}>{EX_TX.slice(0,6)}...{EX_TX.slice(-4)}</a>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Token swatches */}
        <div style={section}>
          <span style={label}>Tokens</span>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {TOKENS.map(t => (
              <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '8px',
                  background: t.hex,
                  border: '1px solid var(--rule)',
                }} />
                <span style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.75rem',
                  color: 'var(--ink-2)',
                }}>
                  {t.name}
                </span>
                <span style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.75rem',
                  color: 'var(--ink-3)',
                }}>
                  {t.hex}
                </span>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
