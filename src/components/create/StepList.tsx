/**
 * The step list shown under the submit button: 1 Create, 2 Allow USDC, 3 Fund.
 * Reflects the current createMachine state.
 */
import type { CreateState, CreateStep } from '../../payroll/createMachine.js';
import { ARC_MAINNET } from '../../deployments.js';

type Props = {
  state: CreateState;
  onRetry: () => void;
  skipApprove?: boolean;
  fundLater?: boolean;
};

function stepIndex(step: CreateStep): number {
  if (step === 'create') return 0;
  if (step === 'approve') return 1;
  return 2;
}

type VisualStatus = 'waiting' | 'active-waiting' | 'signing' | 'pending' | 'done' | 'failed' | 'skipped';

function stepVisual(
  step: CreateStep,
  state: CreateState,
  skipApprove: boolean,
  fundLater: boolean,
): VisualStatus {
  if (state.kind !== 'running') return 'waiting';
  const current = stepIndex(state.step);
  const mine = stepIndex(step);

  if (mine < current) {
    // Completed or skipped.
    if (step === 'approve' && skipApprove) return 'skipped';
    if (step === 'fund' && fundLater) return 'skipped';
    return 'done';
  }
  if (mine > current) return 'waiting';

  // Current step.
  const ss = state.stepStatus;
  if (ss.kind === 'waiting') return 'active-waiting';
  if (ss.kind === 'signing') return 'signing';
  if (ss.kind === 'pending') return 'pending';
  if (ss.kind === 'done') return 'done';
  if (ss.kind === 'failed') return 'failed';
  return 'waiting';
}

function StatusDot({ visual }: { visual: VisualStatus }) {
  if (visual === 'done') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="8" fill="var(--paid)" />
        <path d="M5 9l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (visual === 'skipped') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="8" stroke="var(--rule)" strokeWidth="1.5" />
        <path d="M6 9h6M10 6l3 3-3 3" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (visual === 'failed') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="8" fill="var(--stamp)" />
        <path d="M6 6l6 6M12 6l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (visual === 'active-waiting' || visual === 'signing' || visual === 'pending') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="8" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 2" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="8" stroke="var(--rule)" strokeWidth="1.5" />
    </svg>
  );
}

function txLink(hash: string): React.ReactNode {
  const short = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  return (
    <a
      href={`${ARC_MAINNET.explorer}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--ink)', textDecoration: 'underline', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem' }}
    >
      {short}
    </a>
  );
}

export function StepList({ state, onRetry, skipApprove = false, fundLater = false }: Props) {
  if (state.kind === 'idle' || state.kind === 'validation_error' || state.kind === 'needs_wallet' || state.kind === 'wrong_chain' || state.kind === 'done') {
    return null;
  }

  const steps: { step: CreateStep; label: string }[] = [
    { step: 'create', label: 'Create payroll' },
    { step: 'approve', label: fundLater ? 'Allow USDC (skipped)' : 'Allow USDC' },
    { step: 'fund', label: fundLater ? 'Fund (skipped)' : 'Fund' },
  ];

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {steps.map(({ step, label }, n) => {
        const visual = state.kind === 'running'
          ? stepVisual(step, state, skipApprove, fundLater)
          : 'waiting';
        const isCurrent = state.kind === 'running' && state.step === step;
        const ss = isCurrent ? state.stepStatus : null;

        let subText: React.ReactNode = null;
        if (ss) {
          if (ss.kind === 'signing') subText = 'Sign in your wallet...';
          if (ss.kind === 'pending') subText = <>Pending, tx {txLink(ss.hash)}</>;
          if (ss.kind === 'failed') {
            subText = (
              <span>
                {ss.detail}{' '}
                {ss.resumable && (
                  <button
                    onClick={onRetry}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textDecoration: 'underline' }}
                  >
                    Try again
                  </button>
                )}
              </span>
            );
          }
        }
        // Show pending tx for earlier completed steps too.
        if (visual === 'done' && state.kind === 'running') {
          const prevSs = step === 'create' ? null : null; // no stored hash for earlier steps in state
          void prevSs;
        }

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flexShrink: 0, paddingTop: '2px' }}>
              <StatusDot visual={visual} />
            </div>
            <div>
              <span style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontSize: '0.9375rem',
                color: visual === 'done' ? 'var(--paid)' : visual === 'failed' ? 'var(--stamp)' : visual === 'waiting' ? 'var(--ink-3)' : 'var(--ink)',
                fontWeight: visual === 'active-waiting' || visual === 'signing' || visual === 'pending' ? 500 : 400,
              }}>
                {n + 1}. {label}
              </span>
              {subText && (
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: visual === 'failed' ? 'var(--stamp)' : 'var(--ink-2)', marginTop: '2px' }}>
                  {subText}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
