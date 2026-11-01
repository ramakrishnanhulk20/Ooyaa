/**
 * The create payroll form (left column of /new).
 * Manages the DraftPayroll state, persists to localStorage, validates inline,
 * and submits via useCreatePayroll. No validation fires until the first submit
 * attempt, then all errors appear immediately on every keystroke.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { Link } from 'react-router-dom';
import type { DraftPayroll, DraftError } from '../../payroll/draft.js';
import {
  validateDraft,
  fundAmount,
  draftToArgs,
  PERIOD_OPTIONS,
  loadDraft,
  saveDraft,
} from '../../payroll/draft.js';
import { formatUsdc } from '../../payroll/format.js';
import { useCreatePayroll } from '../../payroll/useCreatePayroll.js';
import { StepList } from './StepList.js';
import { ARC_MAINNET } from '../../deployments.js';
import { factoryAbi } from '../../proof/abi.js';

const DEAD = '0x000000000000000000000000000000000000dEaD' as const;
const ARC_CHAIN_ID = ARC_MAINNET.chainId;

// Input styles used throughout the form.
const inputStyle: React.CSSProperties = {
  height: '44px',
  borderRadius: '8px',
  border: '1px solid var(--rule)',
  background: 'var(--slip)',
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  fontSize: '0.9375rem',
  color: 'var(--ink)',
  padding: '0 12px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 120ms ease',
};

function FieldError({ message }: { message: string }) {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.8125rem',
      color: 'var(--stamp)',
      marginTop: '4px',
    }}>
      {message}
    </div>
  );
}

function errorsFor(errors: DraftError[], field: DraftError['field'], index?: number): string[] {
  return errors
    .filter(e => e.field === field && (index === undefined || ('index' in e && e.index === index)))
    .map(e => e.message)
    // Deduplicate: the duplicate-payee rule adds two errors for the same pair; show each row once.
    .filter((m, i, a) => a.indexOf(m) === i);
}

type Props = {
  onDraftChange: (draft: DraftPayroll) => void;
  onDone: (payroll: string) => void;
};

export function CreateForm({ onDraftChange, onDone }: Props) {
  const [draft, setDraftState] = useState<DraftPayroll>(loadDraft);
  const [submitted, setSubmitted] = useState(false);
  const { address: walletAddress } = useAccount();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });

  // Live gas estimate for createPayroll with the current draft args.
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const gasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chain timestamp polled on mount and every 30 s so start-time validation
  // uses the actual block clock rather than the browser clock.
  const [chainNow, setChainNow] = useState<bigint>(0n);
  const chainNowRef = useRef<bigint>(0n);
  useEffect(() => {
    let cancelled = false;
    async function fetchNow() {
      if (!publicClient) return;
      try {
        const block = await publicClient.getBlock({ blockTag: 'latest' });
        if (!cancelled) {
          chainNowRef.current = block.timestamp;
          setChainNow(block.timestamp);
        }
      } catch {
        // Network unavailable; keep the current value.
      }
    }
    void fetchNow();
    const id = setInterval(() => { void fetchNow(); }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [publicClient]);

  // Derive errors during render when the user has already tried submitting.
  // Avoids calling setState inside a useEffect.
  const fieldErrors: DraftError[] = submitted ? validateDraft(draft, chainNow) : [];

  const { state, submit, retry } = useCreatePayroll();

  // Persist draft on every change and notify parent.
  const setDraft = useCallback((update: DraftPayroll | ((prev: DraftPayroll) => DraftPayroll)) => {
    setDraftState(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      saveDraft(next);
      onDraftChange(next);
      return next;
    });
  }, [onDraftChange]);

  // Notify parent on first render.
  useEffect(() => { onDraftChange(draft); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft is valid only when chainNow is known and all fields pass.
  // chainNow > 0n ensures the start-time bounds are actually checked.
  const draftIsValid = chainNow > 0n && validateDraft(draft, chainNow).length === 0;

  // Re-estimate gas 600 ms after the draft changes (debounced).
  // Only runs when the draft is valid and chainNow is known.
  useEffect(() => {
    if (!draftIsValid || !publicClient) return;
    if (gasTimerRef.current) clearTimeout(gasTimerRef.current);
    gasTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          // Use the most recent polled chain timestamp so draftToArgs computes
          // a valid startTime without a round trip.
          const now = chainNowRef.current > 0n
            ? chainNowRef.current
            : BigInt(Math.floor(Date.now() / 1000));
          const args = draftToArgs(draft, now);
          const account = walletAddress ?? DEAD;
          const gasUnits = await publicClient.estimateContractGas({
            address: ARC_MAINNET.factory,
            abi: factoryAbi,
            functionName: 'createPayroll',
            args: [args.payees, args.amounts, args.startTime, args.periodLength, args.tipPerRun],
            account,
          });
          // Gas price from the client; 0n if unavailable.
          const gasPrice = await publicClient.getGasPrice().catch(() => 0n);
          // Gas is priced in native USDC (18-decimal Arc token): cost = gas * gasPrice / 1e18.
          // Convert to 6-decimal USDC display: divide the 18-decimal amount by 1e12.
          const costWei = gasUnits * gasPrice;
          const costUsdc6 = costWei / 1_000_000_000_000n;
          const whole = costUsdc6 / 1_000_000n;
          const frac = (costUsdc6 % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
          const formatted = frac ? `${whole.toString()}.${frac}` : whole.toString();
          setGasEstimate(`Gas to create this payroll: about ${formatted} USDC (live estimate). Allowing and funding cost a few thousandths more.`);
        } catch {
          setGasEstimate(null);
        }
      })();
    }, 600);
    return () => { if (gasTimerRef.current) clearTimeout(gasTimerRef.current); };
  }, [draftIsValid, draft, walletAddress, publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate when done.
  useEffect(() => {
    if (state.kind === 'done') {
      onDone(state.payroll);
    }
  }, [state.kind, state.kind === 'done' ? (state as { payroll: string }).payroll : null, onDone]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    // fieldErrors is derived during render after setSubmitted(true) fires.
    const errs = validateDraft(draft, 0n);
    if (errs.length > 0) return;
    void submit(draft);
  }

  function addPayee() {
    setDraft(d => ({ ...d, payees: [...d.payees, { address: '', amountUsdc: '' }] }));
  }

  function removePayee(i: number) {
    setDraft(d => ({ ...d, payees: d.payees.filter((_, j) => j !== i) }));
  }

  function setPayeeAddress(i: number, v: string) {
    setDraft(d => ({
      ...d,
      payees: d.payees.map((p, j) => j === i ? { ...p, address: v } : p),
    }));
  }

  function setPayeeAmount(i: number, v: string) {
    setDraft(d => ({
      ...d,
      payees: d.payees.map((p, j) => j === i ? { ...p, amountUsdc: v } : p),
    }));
  }

  function fillMyWallet(i: number) {
    if (walletAddress) setPayeeAddress(i, walletAddress);
  }

  const generalErrors = errorsFor(fieldErrors, 'general');
  const periodErrors = errorsFor(fieldErrors, 'period');
  const startErrors = errorsFor(fieldErrors, 'startTime');
  const tipErrors = errorsFor(fieldErrors, 'tip');
  const fundErrors = errorsFor(fieldErrors, 'fund');

  const totalFund = fundAmount(draft, draft.fundPaydays);

  // Validation errors from the machine (from the onchain simulation).
  const machineErrors: string[] = [];
  if (state.kind === 'validation_error') {
    machineErrors.push(...state.errors);
  }
  const isSubmitting = state.kind === 'validating' || state.kind === 'running';
  const skipApprove = state.kind === 'running' ? state.skipApprove : false;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Section: Payees */}
      <section style={{ marginBottom: '32px' }}>
        <label style={{
          display: 'block',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          marginBottom: '12px',
        }}>
          Payees
        </label>

        {draft.payees.map((p, i) => {
          const addrErrs = errorsFor(fieldErrors, 'payee_address', i);
          const amtErrs = errorsFor(fieldErrors, 'payee_amount', i);
          return (
            <div key={i} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 55%' }}>
                  <input
                    type="text"
                    placeholder="0x address"
                    value={p.address}
                    onChange={e => setPayeeAddress(i, e.target.value)}
                    style={{ ...inputStyle, borderColor: addrErrs.length ? 'var(--stamp)' : undefined, fontFamily: '"IBM Plex Mono", monospace' }}
                    onFocus={e => { e.currentTarget.style.borderColor = addrErrs.length ? 'var(--stamp)' : 'var(--ink)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = addrErrs.length ? 'var(--stamp)' : 'var(--rule)'; }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '3px', gap: '6px' }}>
                    {walletAddress && (
                      <button
                        type="button"
                        onClick={() => fillMyWallet(i)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.8125rem', color: 'var(--ink-3)', textDecoration: 'underline' }}
                      >
                        Use my wallet
                      </button>
                    )}
                  </div>
                  {addrErrs.map((m, k) => <FieldError key={k} message={m} />)}
                </div>
                <div style={{ flex: '1 1 30%' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="0.01"
                      value={p.amountUsdc}
                      onChange={e => setPayeeAmount(i, e.target.value)}
                      style={{ ...inputStyle, borderColor: amtErrs.length ? 'var(--stamp)' : undefined, paddingRight: '52px' }}
                      onFocus={e => { e.currentTarget.style.borderColor = amtErrs.length ? 'var(--stamp)' : 'var(--ink)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = amtErrs.length ? 'var(--stamp)' : 'var(--rule)'; }}
                    />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-3)', pointerEvents: 'none' }}>
                      USDC
                    </span>
                  </div>
                  {amtErrs.map((m, k) => <FieldError key={k} message={m} />)}
                </div>
                {draft.payees.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePayee(i)}
                    aria-label="Remove payee"
                    style={{ flexShrink: 0, height: '44px', width: '44px', borderRadius: '8px', border: '1px solid var(--rule)', background: 'var(--slip)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {generalErrors.map((m, k) => <FieldError key={k} message={m} />)}

        {draft.payees.length < 100 && (
          <button
            type="button"
            onClick={addPayee}
            className="add-payee-btn"
            style={{ background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '0.9375rem', color: 'var(--ink)', textDecoration: 'underline' }}
          >
            Add a payee
          </button>
        )}
      </section>

      {/* Section: Pay every */}
      <section style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: '12px' }}>
          Pay every
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.seconds}
              type="button"
              onClick={() => setDraft(d => ({ ...d, periodSeconds: opt.seconds }))}
              style={{
                height: '40px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: draft.periodSeconds === opt.seconds ? 'var(--ink)' : 'var(--rule)',
                background: draft.periodSeconds === opt.seconds ? 'var(--ink)' : 'var(--slip)',
                color: draft.periodSeconds === opt.seconds ? 'var(--paper)' : 'var(--ink)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                transition: 'background 120ms, border-color 120ms, color 120ms',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {periodErrors.map((m, k) => <FieldError key={k} message={m} />)}
      </section>

      {/* Section: First payday */}
      <section style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: '12px' }}>
          First payday
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {([
            { kind: 'in_2m', label: 'In 2 minutes' },
            { kind: 'in_1h', label: 'In 1 hour' },
            { kind: 'pick', label: 'Pick a time (UTC)' },
          ] as const).map(opt => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => setDraft(d => ({ ...d, firstPayday: opt.kind }))}
              style={{
                height: '40px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: draft.firstPayday === opt.kind ? 'var(--ink)' : 'var(--rule)',
                background: draft.firstPayday === opt.kind ? 'var(--ink)' : 'var(--slip)',
                color: draft.firstPayday === opt.kind ? 'var(--paper)' : 'var(--ink)',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                transition: 'background 120ms, border-color 120ms, color 120ms',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {draft.firstPayday === 'pick' && (
          <input
            type="datetime-local"
            value={draft.pickDatetime}
            onChange={e => setDraft(d => ({ ...d, pickDatetime: e.target.value }))}
            style={inputStyle}
          />
        )}
        {startErrors.map((m, k) => <FieldError key={k} message={m} />)}
      </section>

      {/* Section: Tip */}
      <section style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: '4px' }}>
          Tip for whoever runs it
        </label>
        <div style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.8125rem', color: 'var(--ink-3)', marginBottom: '10px' }}>
          Paid to anyone who presses Run payday. It is why strangers run it for you.
        </div>
        <div style={{ position: 'relative', maxWidth: '180px' }}>
          <input
            type="text"
            value={draft.tipUsdc}
            onChange={e => setDraft(d => ({ ...d, tipUsdc: e.target.value }))}
            style={{ ...inputStyle, paddingRight: '52px' }}
            onFocus={e => { e.currentTarget.style.borderColor = tipErrors.length ? 'var(--stamp)' : 'var(--ink)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = tipErrors.length ? 'var(--stamp)' : 'var(--rule)'; }}
          />
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-3)', pointerEvents: 'none' }}>
            USDC
          </span>
        </div>
        {tipErrors.map((m, k) => <FieldError key={k} message={m} />)}
      </section>

      {/* Section: Fund now */}
      <section style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: '10px' }}>
          Fund now
        </label>
        {!draft.fundLater && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink-2)', flexShrink: 0 }}>
                Put in USDC for
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={draft.fundPaydays}
                onChange={e => setDraft(d => ({ ...d, fundPaydays: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                style={{
                  ...inputStyle,
                  width: '80px',
                  flexShrink: 0,
                  color: 'var(--ink)',
                }}
              />
              <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink-2)' }}>
                paydays{totalFund !== null ? ` (${formatUsdc(totalFund)})` : ''}
              </span>
            </div>
            {fundErrors.map((m, k) => <FieldError key={k} message={m} />)}
          </>
        )}
        <label className="fund-later-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink-2)', marginTop: draft.fundLater ? '0' : '8px' }}>
          <input
            type="checkbox"
            checked={draft.fundLater}
            onChange={e => setDraft(d => ({ ...d, fundLater: e.target.checked }))}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          Fund later (nothing is paid until you add USDC)
        </label>
      </section>

      {/* Summary box */}
      <section style={{ marginBottom: '24px', background: 'var(--slip)', border: '1px solid var(--rule)', borderRadius: '8px', padding: '16px 20px' }}>
        <p style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink-2)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {draft.fundLater
            ? <>You will confirm 1 wallet prompt: create the payroll.</>
            : <>You will confirm 3 wallet prompts: create the payroll, approve {totalFund !== null ? formatUsdc(totalFund) : 'USDC'}, fund it.</>
          }
        </p>
        <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {draftIsValid && gasEstimate ? gasEstimate : 'The gas estimate appears when the form is valid.'}
        </p>
        <p style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 }}>
          Payee addresses and amounts are public on Arc. Anyone can see who you pay and how much.
        </p>
      </section>

      {/* Machine-level errors */}
      {machineErrors.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {machineErrors.map((m, k) => <FieldError key={k} message={m} />)}
        </div>
      )}

      {state.kind === 'needs_wallet' && (
        <div style={{ marginBottom: '16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink-2)' }}>
          Connect a wallet to continue.
        </div>
      )}

      {state.kind === 'wrong_chain' && (
        <div style={{ marginBottom: '16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--stamp)' }}>
          Switch to Arc to continue.
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          width: '100%',
          height: '48px',
          borderRadius: '8px',
          border: 'none',
          background: isSubmitting ? 'rgba(18,25,63,0.35)' : 'var(--ink)',
          color: 'var(--paper)',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '1rem',
          cursor: isSubmitting ? 'not-allowed' : 'pointer',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={e => { if (!isSubmitting) e.currentTarget.style.background = '#1E2758'; }}
        onMouseLeave={e => { if (!isSubmitting) e.currentTarget.style.background = 'var(--ink)'; }}
      >
        {state.kind === 'validating' ? 'Checking...' : 'Create payroll'}
      </button>

      {/* Step list */}
      <StepList
        state={state}
        onRetry={retry}
        skipApprove={skipApprove}
        fundLater={draft.fundLater}
      />

      {/* Fund later note */}
      {draft.fundLater && (
        <div style={{ marginTop: '16px', fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.875rem', color: 'var(--ink-3)' }}>
          You can fund on the payroll page after creating. See{' '}
          <Link to={`/p/${''}`} style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}>
            the demo payroll
          </Link>
          {' '}for an example.
        </div>
      )}
    </form>
  );
}
