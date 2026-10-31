/**
 * /new -- the create-your-own-payroll page.
 * Left: label, h1, sub and the form.
 * Right (desktop): sticky DraftPreview card.
 * Mobile: form first, then a collapsed "Preview" disclosure.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useAccount, useReadContract } from 'wagmi';
import { getAddress } from 'viem';
import { Nav } from '../components/Nav.js';
import { CreateForm } from '../components/create/CreateForm.js';
import { DraftPreview } from '../components/create/DraftPreview.js';
import { loadDraft } from '../payroll/draft.js';
import type { DraftPayroll } from '../payroll/draft.js';
import { factoryAbi } from '../proof/abi.js';
import { shortAddress } from '../payroll/format.js';
import { ARC_MAINNET } from '../deployments.js';

/**
 * "Your payrolls" section above the form.
 * Calls factory.payrollsCreatedBy for the connected wallet and lists up to 20
 * as short addresses linked to their payroll pages.
 * Renders nothing when the wallet is disconnected or has no payrolls.
 */
function YourPayrolls() {
  const { address } = useAccount();

  const { data, isLoading } = useReadContract({
    address: ARC_MAINNET.factory,
    abi: factoryAbi,
    functionName: 'payrollsCreatedBy',
    args: [
      (address ?? '0x0000000000000000000000000000000000000000'),
      0n,
      20n,
    ],
    chainId: ARC_MAINNET.chainId,
    query: {
      enabled: !!address,
      staleTime: 30_000,
    },
  });

  if (!address || isLoading || !data || data.length === 0) return null;

  return (
    <div style={{ marginBottom: '40px' }}>
      <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: '12px' }}>
        Your payrolls
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
        {data.map(addr => {
          const checksummed = getAddress(addr);
          return (
            <Link
              key={checksummed}
              to={`/p/${checksummed}`}
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.875rem',
                color: 'var(--ink)',
                textDecoration: 'underline',
                padding: '6px 12px',
                background: 'var(--slip)',
                border: '1px solid var(--rule)',
                borderRadius: '8px',
              }}
              className="your-payroll-chip"
            >
              {shortAddress(checksummed)}
            </Link>
          );
        })}
      </div>
      <style>{`
        .your-payroll-chip:hover { border-color: var(--ink) !important; }
      `}</style>
    </div>
  );
}

export function NewPayrollPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DraftPayroll>(loadDraft);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleDraftChange = useCallback((d: DraftPayroll) => setDraft(d), []);

  const handleDone = useCallback((payroll: string) => {
    void navigate(`/p/${payroll}?created=1`);
  }, [navigate]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <Nav />

      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '64px 48px 96px',
          display: 'grid',
          gridTemplateColumns: '7fr 5fr',
          gap: '64px',
          alignItems: 'start',
        }}
        className="new-payroll-grid"
      >
        {/* Left: form column */}
        <div>
          {/* Your payrolls: above the form when the wallet has created any */}
          <YourPayrolls />

          {/* Label */}
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            marginBottom: '20px',
          }}>
            NEW PAYROLL
          </div>

          {/* h1 */}
          <h1 style={{
            fontFamily: '"Fraunces Variable", Georgia, serif',
            fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
            fontWeight: 600,
            fontSize: 'clamp(2.5rem, 5vw, 4rem)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            margin: '0 0 16px',
          }}>
            Create your own payroll.
          </h1>

          {/* Sub */}
          <p style={{
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '1.125rem',
            color: 'var(--ink-2)',
            margin: '0 0 40px',
            lineHeight: 1.5,
            maxWidth: '44ch',
          }}>
            Two minutes, a few cents of USDC. Anyone can run payday for you, and you can watch it happen.
          </p>

          {/* Mobile preview disclosure */}
          <div className="new-payroll-mobile-preview">
            <button
              type="button"
              onClick={() => setPreviewOpen(o => !o)}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '8px',
                border: '1px solid var(--rule)',
                background: 'var(--slip)',
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '0.9375rem',
                color: 'var(--ink)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                marginBottom: previewOpen ? '20px' : '28px',
              }}
            >
              <span>Preview payslip</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                style={{ transform: previewOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}
              >
                <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {previewOpen && (
              <div style={{ marginBottom: '28px' }}>
                <DraftPreview draft={draft} />
              </div>
            )}
          </div>

          <CreateForm onDraftChange={handleDraftChange} onDone={handleDone} />
        </div>

        {/* Right: sticky draft preview (desktop only) */}
        <div
          className="new-payroll-draft-col"
          style={{ position: 'sticky', top: '96px' }}
        >
          <DraftPreview draft={draft} />
        </div>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .new-payroll-grid {
            grid-template-columns: 1fr !important;
            padding: 40px 48px 72px !important;
          }
          .new-payroll-draft-col { display: none !important; }
          .new-payroll-mobile-preview { display: block !important; }
        }
        @media (max-width: 767px) {
          .new-payroll-grid { padding: 32px 20px 64px !important; }
        }
        @media (min-width: 1024px) {
          .new-payroll-mobile-preview { display: none !important; }
        }
      `}</style>
    </div>
  );
}
