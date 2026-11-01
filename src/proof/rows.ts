/**
 * Builds a flat ledger row list from a PayrollHistory for the proof page.
 * Each row maps one-to-one to a USDC transfer, keyed to the event that explains it.
 * Unconsumed inflows become 'direct'; unconsumed outflows become 'unexplained'.
 */
import type { Address, Hex } from 'viem';
import type { PayrollHistory } from './history.js';
import { periodDisplayLabel } from '../payroll/format.js';

export type LedgerRowKind =
  | 'funded'
  | 'payslip'
  | 'tip'
  | 'claimed'
  | 'withdrawn'
  | 'direct'
  | 'unexplained';

export type LedgerRow = {
  kind: LedgerRowKind;
  direction: 'in' | 'out';
  payroll: Address;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  /** Unix timestamp from history.blockTimes, undefined when not fetched. */
  time: bigint | undefined;
  /** Payment period for payslip and tip rows. */
  period: bigint | undefined;
  from: Address;
  to: Address;
  amount: bigint;
};

type ParsedEvent = PayrollHistory['events'][number];

function filterName<N extends ParsedEvent['eventName']>(
  events: ParsedEvent[],
  name: N,
): Extract<ParsedEvent, { eventName: N }>[] {
  return events.filter((e): e is Extract<ParsedEvent, { eventName: N }> => e.eventName === name);
}

function req<T>(v: T | undefined, label: string): T {
  if (v === undefined) throw new Error(`expected ${label} but got undefined`);
  return v;
}

/**
 * Builds ledger rows matching transfers to events, newest first.
 * employer is the address that funds the payroll (used only for display).
 */
export function buildLedgerRows(history: PayrollHistory, _employer: Address): LedgerRow[] {
  const events = history.events;
  const payrolls = filterName(events, 'PaydayRun');
  const payslips = filterName(events, 'PayslipIssued');
  const claimed = filterName(events, 'Claimed');
  const withdrawn = filterName(events, 'Withdrawn');
  const funded = filterName(events, 'Funded');

  // Per-tx consumed sets, parallel to history.usdcOut and history.usdcIn arrays.
  const outConsumed = new Map<number, boolean>();
  const inConsumed = new Map<number, boolean>();

  const rows: LedgerRow[] = [];

  function addRow(
    kind: LedgerRowKind,
    direction: 'in' | 'out',
    txHash: Hex,
    blockNumber: bigint,
    logIndex: number,
    from: Address,
    to: Address,
    amount: bigint,
    period?: bigint,
  ): void {
    rows.push({
      kind,
      direction,
      payroll: history.payroll,
      txHash,
      blockNumber,
      logIndex,
      time: history.blockTimes.get(blockNumber),
      period,
      from,
      to,
      amount,
    });
  }

  // Match out-transfers for payslips.
  for (const slip of payslips) {
    const payee = req(slip.args.payee, 'PayslipIssued.payee');
    const amount = req(slip.args.amount, 'PayslipIssued.amount');
    const period = req(slip.args.period, 'PayslipIssued.period');
    const txLow = slip.transactionHash.toLowerCase();
    const idx = history.usdcOut.findIndex(
      (t, i) => !outConsumed.get(i) && t.txHash.toLowerCase() === txLow && t.to.toLowerCase() === payee.toLowerCase() && t.value === amount,
    );
    if (idx !== -1) {
      outConsumed.set(idx, true);
      const t = history.usdcOut[idx];
      addRow('payslip', 'out', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value, period);
    }
  }

  // Match out-transfers for tips (from PaydayRun).
  for (const run of payrolls) {
    const tip = req(run.args.tip, 'PaydayRun.tip');
    if (tip === 0n) continue;
    const runner = req(run.args.runner, 'PaydayRun.runner');
    const period = req(run.args.period, 'PaydayRun.period');
    const txLow = run.transactionHash.toLowerCase();
    const idx = history.usdcOut.findIndex(
      (t, i) => !outConsumed.get(i) && t.txHash.toLowerCase() === txLow && t.to.toLowerCase() === runner.toLowerCase() && t.value === tip,
    );
    if (idx !== -1) {
      outConsumed.set(idx, true);
      const t = history.usdcOut[idx];
      addRow('tip', 'out', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value, period);
    }
  }

  // Match out-transfers for Claimed events.
  for (const c of claimed) {
    const payee = req(c.args.payee, 'Claimed.payee');
    const amount = req(c.args.amount, 'Claimed.amount');
    const txLow = c.transactionHash.toLowerCase();
    const idx = history.usdcOut.findIndex(
      (t, i) => !outConsumed.get(i) && t.txHash.toLowerCase() === txLow && t.to.toLowerCase() === payee.toLowerCase() && t.value === amount,
    );
    if (idx !== -1) {
      outConsumed.set(idx, true);
      const t = history.usdcOut[idx];
      addRow('claimed', 'out', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value);
    }
  }

  // Match out-transfers for Withdrawn events.
  for (const w of withdrawn) {
    const to = req(w.args.to, 'Withdrawn.to');
    const amount = req(w.args.amount, 'Withdrawn.amount');
    const txLow = w.transactionHash.toLowerCase();
    const idx = history.usdcOut.findIndex(
      (t, i) => !outConsumed.get(i) && t.txHash.toLowerCase() === txLow && t.to.toLowerCase() === to.toLowerCase() && t.value === amount,
    );
    if (idx !== -1) {
      outConsumed.set(idx, true);
      const t = history.usdcOut[idx];
      addRow('withdrawn', 'out', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value);
    }
  }

  // Unexplained: unconsumed out-transfers.
  for (let i = 0; i < history.usdcOut.length; i++) {
    if (!outConsumed.get(i)) {
      const t = history.usdcOut[i];
      addRow('unexplained', 'out', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value);
    }
  }

  // Match in-transfers for Funded events.
  for (const f of funded) {
    const from = req(f.args.from, 'Funded.from');
    const amount = req(f.args.amount, 'Funded.amount');
    const txLow = f.transactionHash.toLowerCase();
    const idx = history.usdcIn.findIndex(
      (t, i) => !inConsumed.get(i) && t.txHash.toLowerCase() === txLow && t.from.toLowerCase() === from.toLowerCase() && t.value === amount,
    );
    if (idx !== -1) {
      inConsumed.set(idx, true);
      const t = history.usdcIn[idx];
      addRow('funded', 'in', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value);
    }
  }

  // Direct deposits: unconsumed in-transfers.
  for (let i = 0; i < history.usdcIn.length; i++) {
    if (!inConsumed.get(i)) {
      const t = history.usdcIn[i];
      addRow('direct', 'in', t.txHash, t.blockNumber, t.logIndex, t.from, t.to, t.value);
    }
  }

  // Sort newest first: descending block, then descending log index.
  rows.sort((a, b) =>
    a.blockNumber !== b.blockNumber
      ? Number(b.blockNumber - a.blockNumber)
      : b.logIndex - a.logIndex,
  );

  return rows;
}

/**
 * Human-readable WHAT description for a ledger row.
 * Period labels use 1-based display numbers ("Period 0038" for index 37)
 * so every page shows the same number for the same period.
 */
export function describeRow(row: LedgerRow): string {
  const p = row.period !== undefined ? `, ${periodDisplayLabel(row.period)}` : '';
  switch (row.kind) {
    case 'payslip':    return `Payslip${p}`;
    case 'tip':        return `Tip to runner${p}`;
    case 'funded':     return 'Funded';
    case 'direct':     return 'Direct deposit';
    case 'claimed':    return 'Claimed';
    case 'withdrawn':  return 'Withdrawn';
    default:           return row.kind;
  }
}
