/**
 * /p/:address -- the page for any payroll made by Ooyaa's factory.
 * Sections A (guards), B (header + card), B.2 (employer panel),
 * C.3 (Your payslips with claim button), C.4 (Every payslip),
 * and C.5 (slip drawer + ?slip= link) are all here.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { isAddress, getAddress } from 'viem';
import type { Address } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Nav } from '../components/Nav.js';
import { PayrollCard } from '../components/PayrollCard.js';
import type { PayrollCardHandle } from '../components/PayrollCard.js';
import { usePayrollState } from '../payroll/usePayrollState.js';
import { shortAddress, formatUsdc, cadence } from '../payroll/format.js';
import { factoryAbi, payrollAbi } from '../proof/abi.js';
import { creationBlockOf } from '../proof/creation.js';
import { ARC_MAINNET } from '../deployments.js';
import { mainnetClient, LOG_SOURCES } from '../proof/clients.js';
import { YourPayslips } from '../components/payroll/YourPayslips.js';
import { EveryPayslip } from '../components/payroll/EveryPayslip.js';
import { SlipDrawer, parseSlipParam } from '../components/payroll/SlipDrawer.js';
import type { DrawerRow } from '../components/payroll/SlipDrawer.js';
import type { PayrollHistory } from '../proof/history.js';
import type { LedgerRow } from '../proof/rows.js';
import { buildLedgerRows } from '../proof/rows.js';
import { EmployerPanel } from '../components/payroll/EmployerPanel.js';

// Use the first log source's chunk size for creation block lookups.
const CREATION_CHUNK = LOG_SOURCES[0]?.chunk ?? 10_000n;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copy address"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
        color: 'var(--ink-3)',
        fontSize: '0.875rem',
        lineHeight: 1,
      }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 7l4 4 6-7" stroke="var(--paid)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="4" y="1" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M1 4v8a1 1 0 001 1h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

function GuardMessage({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '96px 48px',
      textAlign: 'center',
    }} className="guard-container">
      <h2 style={{
        fontFamily: '"Fraunces Variable", Georgia, serif',
        fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
        fontWeight: 600,
        fontSize: '2rem',
        color: 'var(--ink)',
        margin: '0 0 16px',
        lineHeight: 1.1,
      }}>
        {title}
      </h2>
      <div style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontSize: '1rem',
        color: 'var(--ink-2)',
        lineHeight: 1.6,
      }}>
        {body}
      </div>
    </div>
  );
}

function PayrollSkeleton() {
  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '64px 48px',
      display: 'grid',
      gridTemplateColumns: '7fr 5fr',
      gap: '48px',
    }} className="payroll-header-grid">
      <div>
        <div style={{ width: '80px', height: '12px', borderRadius: '4px', background: 'var(--rule)', opacity: 0.6, marginBottom: '20px' }} />
        <div style={{ width: '60%', height: '48px', borderRadius: '4px', background: 'var(--rule)', opacity: 0.6, marginBottom: '16px' }} />
        <div style={{ width: '80%', height: '18px', borderRadius: '4px', background: 'var(--rule)', opacity: 0.6, marginBottom: '8px' }} />
        <div style={{ width: '60%', height: '14px', borderRadius: '4px', background: 'var(--rule)', opacity: 0.6 }} />
      </div>
      <div style={{
        background: 'var(--slip)',
        border: '1px solid var(--rule)',
        borderRadius: '8px',
        padding: '28px',
        boxShadow: '0 24px 60px -32px rgba(18,25,63,.28)',
      }}>
        <div style={{ width: '100%', height: '300px', borderRadius: '4px', background: 'var(--rule)', opacity: 0.4 }} />
      </div>
    </div>
  );
}

function PayrollHeader({
  payroll,
  creationBlock,
  onSlipClick,
}: {
  payroll: Address;
  creationBlock: bigint | null;
  onSlipClick: (periodIndex: bigint, txHash: `0x${string}`) => void;
}) {
  const { state, isLoading } = usePayrollState(payroll);
  const cardRef = useRef<PayrollCardHandle>(null);
  void creationBlock;

  function subLine(): string {
    if (!state || isLoading) return '';
    const payeeCount = Number(state.payeeCount);
    const per = state.periodTotal > 0n && payeeCount > 0
      ? state.periodTotal / BigInt(payeeCount)
      : 0n;
    const allSame = payeeCount > 0 && state.periodTotal === per * BigInt(payeeCount);

    let amounts_part: string;
    if (allSame) {
      amounts_part = `${payeeCount} payees, ${formatUsdc(per)} each, ${cadence(state.periodLength)}`;
    } else {
      amounts_part = `${payeeCount} payees, ${formatUsdc(state.periodTotal)} per payday, ${cadence(state.periodLength)}`;
    }
    return `${amounts_part}. ${formatUsdc(state.tipPerRun)} tip for whoever runs it.`;
  }

  const employer = state?.employer
    ? shortAddress(getAddress(state.employer))
    : null;

  const explorerBase = ARC_MAINNET.explorer;

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '64px 48px 80px',
        display: 'grid',
        gridTemplateColumns: '7fr 5fr',
        gap: '48px',
        alignItems: 'start',
      }}
      className="payroll-header-grid"
    >
      {/* Left column */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.75rem',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          marginBottom: '20px',
        }}>
          PAYROLL
        </div>

        <h1 style={{
          fontFamily: '"Fraunces Variable", Georgia, serif',
          fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
          fontWeight: 600,
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          margin: '0 0 16px',
          overflowWrap: 'anywhere',
        }}>
          {payroll.toLowerCase() === ARC_MAINNET.demoPayroll.toLowerCase()
            ? 'Demo payroll'
            : 'Payroll'}
        </h1>

        {!isLoading && state && (
          <p style={{
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '1.125rem',
            color: 'var(--ink-2)',
            margin: '0 0 20px',
            lineHeight: 1.5,
          }}>
            {subLine()}
          </p>
        )}

        {/* Employer + contract address line */}
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.8125rem',
          color: 'var(--ink-3)',
          display: 'flex',
          flexWrap: 'wrap' as const,
          alignItems: 'center',
          gap: '4px',
          minWidth: 0,
        }}>
          {employer && (
            <>
              <span>Employer</span>
              <a
                href={`${explorerBase}/address/${state?.employer ? getAddress(state.employer) : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ink-3)', textDecoration: 'underline', wordBreak: 'break-all' }}
              >
                {employer}
              </a>
              <span style={{ margin: '0 0 0 2px' }}>, contract</span>
              <a
                href={`${explorerBase}/address/${getAddress(payroll)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ink-3)', textDecoration: 'underline', wordBreak: 'break-all' }}
              >
                {shortAddress(getAddress(payroll))}
              </a>
              <CopyButton text={getAddress(payroll)} />
            </>
          )}
        </div>
      </div>

      {/* Right column: the live card */}
      <div style={{ minWidth: 0 }}>
        <PayrollCard
          ref={cardRef}
          payroll={payroll}
          fromBlock={creationBlock ?? ARC_MAINNET.factoryBlock}
          label="PAYROLL"
          onSlipClick={onSlipClick}
        />
      </div>
    </div>
  );
}

export function PayrollPage() {
  const { address: rawAddress } = useParams<{ address: string }>();

  // Guard 1: not a valid address.
  if (!rawAddress || !isAddress(rawAddress)) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
        <Nav />
        <GuardMessage
          title="That is not an address."
          body={
            <Link to={`/p/${ARC_MAINNET.demoPayroll}`} className="link-underline" style={{ color: 'var(--ink-2)' }}>
              Go to the demo payroll
            </Link>
          }
        />
      </div>
    );
  }

  const payroll = getAddress(rawAddress);

  return <PayrollPageInner payroll={payroll} />;
}

/**
 * Rendered only after the address guard passes so hooks run unconditionally.
 */
function PayrollPageInner({ payroll }: { payroll: Address }) {
  const explorerBase = ARC_MAINNET.explorer;
  const [searchParams] = useSearchParams();
  const { address: connectedAddress } = useAccount();
  const qc = useQueryClient();

  // Drawer state for the slip drawer (C.5).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<DrawerRow | null>(null);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);

  // payrollHistory is set via the handleHistoryLoaded callback (not an effect),
  // so setState is called from user/async code, not from within useEffect.
  const [payrollHistory, setPayrollHistory] = useState<PayrollHistory | null>(null);
  const [allRows, setAllRows] = useState<LedgerRow[]>([]);

  // Guard 2: isPayroll check against the factory.
  const { data: isPayrollResult, isLoading: isPayrollLoading } = useReadContract({
    address: ARC_MAINNET.factory,
    abi: factoryAbi,
    functionName: 'isPayroll',
    args: [payroll],
    chainId: ARC_MAINNET.chainId,
    query: { staleTime: 300_000 },
  });

  // Creation block from factory events.
  const { data: creationBlock, isLoading: isCreationLoading } = useQuery({
    queryKey: ['creationBlock', payroll],
    queryFn: async () => {
      const head = await mainnetClient.getBlockNumber();
      return creationBlockOf(
        mainnetClient,
        payroll,
        ARC_MAINNET.factory,
        ARC_MAINNET.factoryBlock,
        head,
        CREATION_CHUNK,
      );
    },
    enabled: isPayrollResult === true,
    staleTime: Infinity,
  });

  // No separate chainHead query: useHistory() resolves the chain head internally.

  // payroll state for startTime + periodLength (needed for due date in drawer).
  const { state: payrollContractState } = usePayrollState(payroll);

  // Claimable balance for the connected wallet.
  const { data: claimableData, refetch: refetchClaimable } = useReadContract({
    address: payroll,
    abi: payrollAbi,
    functionName: 'claimable',
    args: [connectedAddress ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_MAINNET.chainId,
    query: {
      enabled: !!connectedAddress,
      staleTime: 15_000,
      refetchInterval: 30_000,
    },
  });
  const claimable = typeof claimableData === 'bigint' ? claimableData : 0n;

  // Refetch state after any employer/payee action.
  const handleActionSuccess = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['payrollState', payroll] });
    void refetchClaimable();
  }, [qc, payroll, refetchClaimable]);

  const openDrawer = useCallback((row: DrawerRow, triggerEl: HTMLElement | null) => {
    setDrawerRow(row);
    drawerTriggerRef.current = triggerEl;
    setDrawerOpen(true);
  }, []);

  // Opens the drawer when a paid slip in the card stack is clicked.
  const handleCardSlipClick = useCallback((periodIndex: bigint, txHash: `0x${string}`) => {
    const row = allRows.find(
      r => r.kind === 'payslip' &&
        r.txHash.toLowerCase() === txHash.toLowerCase() &&
        r.period === periodIndex,
    ) as DrawerRow | undefined;
    if (row) {
      openDrawer(row, null);
    } else {
      // History may not be loaded yet; open by tx hash with logIndex 0 as fallback.
      const fallback = allRows.find(
        r => r.kind === 'payslip' && r.txHash.toLowerCase() === txHash.toLowerCase(),
      ) as DrawerRow | undefined;
      if (fallback) openDrawer(fallback, null);
    }
  }, [allRows, openDrawer]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    drawerTriggerRef.current?.focus();
    drawerTriggerRef.current = null;
  }, []);

  // Called by EveryPayslip when the history fetch completes.
  // This runs as a React Query callback, not inside a useEffect body,
  // so calling setState here is fine.
  const handleHistoryLoaded = useCallback((history: PayrollHistory) => {
    setPayrollHistory(history);
    const empAddr = payrollContractState?.employer;
    if (empAddr) {
      const emp = getAddress(empAddr);
      setAllRows(buildLedgerRows(history, emp));
    }
  }, [payrollContractState?.employer]);

  // ?created=1 toast: fires once when the page is reached after a successful create.
  const createdToastFired = useRef(false);
  useEffect(() => {
    if (createdToastFired.current) return;
    if (searchParams.get('created') !== '1') return;
    // Wait until state is loaded so we can show the first payday time.
    const startTime = payrollContractState?.startTime;
    if (!startTime) return;
    createdToastFired.current = true;
    const d = new Date(Number(startTime) * 1000);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = d.getUTCHours().toString().padStart(2,'0');
    const m = d.getUTCMinutes().toString().padStart(2,'0');
    const dateStr = `${h}:${m} UTC, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
    setTimeout(() => toast.success(`Payroll created. First payday ${dateStr}.`), 300);
  }, [searchParams, payrollContractState?.startTime]);

  // ?slip= deep link: fire in a microtask so the effect itself is not a synchronous
  // setState call -- openDrawer is called after the effect exits.
  const slipParamHandled = useRef(false);
  useEffect(() => {
    if (slipParamHandled.current || allRows.length === 0) return;
    const slipParam = searchParams.get('slip');
    if (!slipParam) return;
    const parsed = parseSlipParam(slipParam);
    if (!parsed) return;
    const row = allRows.find(
      r => r.kind === 'payslip' &&
        r.txHash.toLowerCase() === parsed.txHash.toLowerCase() &&
        r.logIndex === parsed.logIndex,
    );
    if (!row) return;
    slipParamHandled.current = true;
    // setTimeout defers the setState call out of the synchronous effect body.
    setTimeout(() => openDrawer(row as DrawerRow, null), 0);
  }, [allRows, searchParams, openDrawer]);

  if (isPayrollLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
        <Nav />
        <PayrollSkeleton />
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 48px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.8125rem',
          color: 'var(--ink-3)',
        }}>
          Reading Arc mainnet...
        </div>
      </div>
    );
  }

  if (isPayrollResult === false) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
        <Nav />
        <GuardMessage
          title="This address is not a payroll made by Ooyaa's factory."
          body={
            <>
              <p style={{ margin: '0 0 12px' }}>
                Ooyaa only shows payrolls it can prove. Check it on the explorer:
              </p>
              <a
                href={`${explorerBase}/address/${payroll}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline"
                style={{ color: 'var(--ink-2)', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}
              >
                {payroll}
              </a>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <Nav />
      {(isPayrollLoading || isCreationLoading) ? (
        <PayrollSkeleton />
      ) : (
        <PayrollHeader payroll={payroll} creationBlock={creationBlock ?? null} onSlipClick={handleCardSlipClick} />
      )}

      {/* B.2: Employer panel -- EmployerPanel renders null unless the connected
            wallet matches the employer, so no condition needed here. */}
      {payrollContractState && (
        <EmployerPanel
          payroll={payroll}
          state={payrollContractState}
          onSuccess={handleActionSuccess}
        />
      )}

      {/* C.3: Your payslips (only for connected payees) */}
      <YourPayslips
        payroll={payroll}
        rows={allRows}
        claimable={claimable}
        onClaimSuccess={handleActionSuccess}
      />

      {/* C.4: Every payslip (with filter chips and row click to open drawer) */}
      {creationBlock !== undefined && (
        <EveryPayslip
          payroll={payroll}
          employer={(payrollContractState?.employer ? getAddress(payrollContractState.employer) : payroll)}
          fromBlock={creationBlock ?? ARC_MAINNET.factoryBlock}
          onPayslipClick={(row, el) => openDrawer(row, el)}
          onHistoryLoaded={handleHistoryLoaded}
        />
      )}

      {/* Bottom padding after the table */}
      <div style={{ height: '80px' }} />

      {/* C.5: Slip drawer */}
      <SlipDrawer
        payroll={payroll}
        startTime={payrollContractState?.startTime ?? 0n}
        periodLength={payrollContractState?.periodLength ?? 0n}
        history={payrollHistory}
        isOpen={drawerOpen}
        row={drawerRow}
        onClose={closeDrawer}
      />

      <style>{`
        @media (max-width: 1023px) {
          .payroll-header-grid {
            grid-template-columns: 1fr !important;
            padding: 40px 48px 60px !important;
          }
        }
        @media (max-width: 767px) {
          .payroll-header-grid {
            padding: 32px 20px 48px !important;
          }
          .guard-container {
            padding: 64px 20px !important;
          }
          .slip-drawer-panel {
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
