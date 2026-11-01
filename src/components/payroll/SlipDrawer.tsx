/**
 * C.5: the right-side payslip drawer.
 * Opens when a payslip row is clicked or when ?slip=<txHash>-<logIndex> is in the URL.
 * 440px wide on desktop, full-screen under 768px.
 * Focus is trapped while open and returns to the triggering row on close.
 */
import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { Payslip } from '../Payslip.js';
import type { PayslipHandle } from '../Payslip.js';
import { shortAddress } from '../../payroll/format.js';
import type { LedgerRow } from '../../proof/rows.js';
import type { PayrollHistory } from '../../proof/history.js';
import { ARC_MAINNET } from '../../deployments.js';

export type DrawerRow = LedgerRow & { kind: 'payslip' };

export type SlipDrawerHandle = {
  open: (row: DrawerRow, triggerEl: HTMLElement | null) => void;
  close: () => void;
};

type Props = {
  payroll: Address;
  /** startTime and periodLength from the contract, used to compute the due date. */
  startTime: bigint;
  periodLength: bigint;
  history: PayrollHistory | null;
  isOpen: boolean;
  row: DrawerRow | null;
  onClose: () => void;
};

function fmtUtcFull(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${h}:${m} UTC, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.8125rem',
      color: 'var(--ink-2)',
      marginBottom: '8px',
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap' as const,
    }}>
      <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

export function SlipDrawer({ payroll, startTime, periodLength, history, isOpen, row, onClose }: Props) {
  const payslipRef = useRef<PayslipHandle>(null);
  const stampedRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Stamp PAID once, 150 ms after the drawer settles (280 ms slide + 150 ms).
  useEffect(() => {
    if (!isOpen || !row || stampedRef.current) return;
    const t = setTimeout(() => {
      stampedRef.current = true;
      void payslipRef.current?.stamp('paid');
    }, 430);
    return () => clearTimeout(t);
  }, [isOpen, row]);

  // Reset stamp flag when drawer closes so it plays again on next open.
  useEffect(() => {
    if (!isOpen) stampedRef.current = false;
  }, [isOpen]);

  // Focus the close button when the drawer opens.
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Trap focus inside the drawer.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab') return;
    const el = drawerRef.current;
    if (!el) return;
    const focusable = Array.from(
      el.querySelectorAll<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])'),
    ).filter(el2 => !el2.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const explorer = ARC_MAINNET.explorer;

  // Find the PaydayRun event for this row's tx to get runner and tip.
  let runner: Address | null = null;
  let tipAmount: bigint | null = null;
  if (history && row) {
    const runEvent = history.events.find(
      e => e.eventName === 'PaydayRun' && e.transactionHash.toLowerCase() === row.txHash.toLowerCase(),
    );
    if (runEvent && runEvent.eventName === 'PaydayRun') {
      runner = (runEvent.args.runner as Address) ?? null;
      tipAmount = (runEvent.args.tip as bigint) ?? null;
    }
  }

  // Due date: startTime + period * periodLength
  // Period index i becomes payable at startTime + i * periodLength (0-based contract index).
  const dueTs = row && periodLength > 0n
    ? startTime + row.period! * periodLength
    : null;

  // ?slip= link: /p/<payroll>?slip=<txHash>-<logIndex>
  function slipParam(r: DrawerRow): string {
    return `${r.txHash}-${r.logIndex}`;
  }

  function copyLink() {
    if (!row) return;
    const url = `${window.location.origin}/p/${getAddress(payroll)}?slip=${slipParam(row)}`;
    void navigator.clipboard.writeText(url);
  }

  const EASING = [0.2, 0.8, 0.2, 1] as const;

  return (
    <AnimatePresence>
      {isOpen && row && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: EASING }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(18,25,63,.32)',
              zIndex: 40,
            }}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Payslip details"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: EASING }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '440px',
              background: 'var(--paper)',
              zIndex: 50,
              overflowY: 'auto' as const,
              display: 'flex',
              flexDirection: 'column' as const,
              boxShadow: '-8px 0 40px rgba(18,25,63,.18)',
            }}
            className="slip-drawer-panel"
          >
            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 20px 0' }}>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                aria-label="Close payslip"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '12px',
                  color: 'var(--ink-3)',
                  lineHeight: 1,
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Slip rendering area */}
            <div style={{ padding: '24px', position: 'relative', minHeight: '280px' }}>
              <Payslip
                ref={payslipRef}
                period={row.period!}
                payee={row.to}
                amount={row.amount}
                status={{ kind: 'paid', txHash: row.txHash, explorer }}
                rotation="0deg"
                index={0}
                animate={true}
              />
            </div>

            {/* Detail lines */}
            <div style={{ padding: '0 24px 24px', flex: 1 }}>
              {dueTs !== null && (
                <DetailLine label="Due" value={fmtUtcFull(dueTs)} />
              )}
              {row.time !== undefined && (
                <DetailLine label="Paid" value={fmtUtcFull(row.time)} />
              )}
              <DetailLine label="Block" value={row.blockNumber.toLocaleString('en-US')} />
              {runner && (
                <DetailLine label="Run by" value={shortAddress(getAddress(runner))} />
              )}
              {tipAmount !== null && tipAmount > 0n && (
                <DetailLine
                  label="Tip"
                  value={`${(Number(tipAmount) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`}
                />
              )}

              {/* Links */}
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
                <a
                  href={`${explorer}/tx/${row.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline"
                  style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.8125rem',
                    color: 'var(--ink)',
                  }}
                >
                  Open on explorer
                </a>
                <button
                  onClick={copyLink}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.8125rem',
                    color: 'var(--ink)',
                    textAlign: 'left',
                    textDecoration: 'underline',
                  }}
                >
                  Copy link to this payslip
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Parse a ?slip= param into txHash and logIndex.
export function parseSlipParam(param: string): { txHash: Hex; logIndex: number } | null {
  const lastDash = param.lastIndexOf('-');
  if (lastDash < 0) return null;
  const txHash = param.slice(0, lastDash) as Hex;
  const logIndex = parseInt(param.slice(lastDash + 1), 10);
  if (!txHash.startsWith('0x') || isNaN(logIndex)) return null;
  return { txHash, logIndex };
}

// Re-exported for use in PayrollPage.
export type { SlipDrawerHandle as _DrawerHandle };
