import { describe, test, expect } from 'bun:test';
import { buildLedgerRows, describeRow } from './rows.js';
import { summarizeLedger } from './checks.js';
import type { PayrollHistory } from './history.js';
import type { Address, Hex } from 'viem';

const PAYROLL = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;
const EMPLOYER = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' as Address;
const PAYEE1 = '0x1111111111111111111111111111111111111111' as Address;
const PAYEE2 = '0x2222222222222222222222222222222222222222' as Address;
const PAYEE3 = '0x3333333333333333333333333333333333333333' as Address;
const RUNNER = '0x4444444444444444444444444444444444444444' as Address;
const TX_RUN = '0xaaaa000000000000000000000000000000000000000000000000000000000001' as Hex;
const TX_FUND = '0xbbbb000000000000000000000000000000000000000000000000000000000002' as Hex;
const TX_DIRECT = '0xcccc000000000000000000000000000000000000000000000000000000000003' as Hex;

// Zero hash used as a placeholder for blockHash and topic padding in fixtures.
const ZH = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

type AnyEvent = PayrollHistory['events'][number];

/**
 * Wraps a partial event object with the topic placeholder so fixture construction
 * doesn't need to supply real topic hashes (which are always decoded at runtime).
 */
function ev(partial: Omit<AnyEvent, 'topics'> & { topics?: Hex[] }): AnyEvent {
  return { ...partial, topics: (partial.topics ?? [ZH, ZH, ZH]) } as AnyEvent;
}

function makeHistory(opts: {
  withRun?: boolean;
  withFund?: boolean;
  withDirect?: boolean;
}): PayrollHistory {
  const { withRun = false, withFund = false, withDirect = false } = opts;

  const events: AnyEvent[] = [];
  const usdcOut: PayrollHistory['usdcOut'] = [];
  const usdcIn: PayrollHistory['usdcIn'] = [];

  if (withRun) {
    events.push(ev({ eventName: 'PaydayRun', args: { period: 0n, runner: RUNNER, paid: 3000n, deferred: 0n, tip: 500n }, transactionHash: TX_RUN, blockNumber: 100n, logIndex: 0, address: PAYROLL, blockHash: ZH, data: '0x', removed: false, transactionIndex: 0 }));
    events.push(ev({ eventName: 'PayslipIssued', args: { period: 0n, payee: PAYEE1, amount: 1000n }, transactionHash: TX_RUN, blockNumber: 100n, logIndex: 1, address: PAYROLL, blockHash: ZH, data: '0x', removed: false, transactionIndex: 0 }));
    events.push(ev({ eventName: 'PayslipIssued', args: { period: 0n, payee: PAYEE2, amount: 1000n }, transactionHash: TX_RUN, blockNumber: 100n, logIndex: 2, address: PAYROLL, blockHash: ZH, data: '0x', removed: false, transactionIndex: 0 }));
    events.push(ev({ eventName: 'PayslipIssued', args: { period: 0n, payee: PAYEE3, amount: 1000n }, transactionHash: TX_RUN, blockNumber: 100n, logIndex: 3, address: PAYROLL, blockHash: ZH, data: '0x', removed: false, transactionIndex: 0 }));
    usdcOut.push({ txHash: TX_RUN, blockNumber: 100n, logIndex: 10, from: PAYROLL, to: PAYEE1, value: 1000n });
    usdcOut.push({ txHash: TX_RUN, blockNumber: 100n, logIndex: 11, from: PAYROLL, to: PAYEE2, value: 1000n });
    usdcOut.push({ txHash: TX_RUN, blockNumber: 100n, logIndex: 12, from: PAYROLL, to: PAYEE3, value: 1000n });
    usdcOut.push({ txHash: TX_RUN, blockNumber: 100n, logIndex: 13, from: PAYROLL, to: RUNNER, value: 500n });
  }

  if (withFund) {
    events.push(ev({ eventName: 'Funded', args: { from: EMPLOYER, amount: 10000n }, transactionHash: TX_FUND, blockNumber: 50n, logIndex: 0, address: PAYROLL, blockHash: ZH, data: '0x', removed: false, transactionIndex: 0 }));
    usdcIn.push({ txHash: TX_FUND, blockNumber: 50n, logIndex: 5, from: EMPLOYER, to: PAYROLL, value: 10000n });
  }

  if (withDirect) {
    usdcIn.push({ txHash: TX_DIRECT, blockNumber: 60n, logIndex: 5, from: RUNNER, to: PAYROLL, value: 200n });
  }

  return {
    payroll: PAYROLL,
    fromBlock: 1n,
    toBlock: 200n,
    events,
    rawLogCount: events.length,
    usdcOut,
    usdcIn,
    blockTimes: new Map([[100n, 1700000000n], [50n, 1699000000n], [60n, 1699100000n]]),
  };
}

describe('buildLedgerRows', () => {
  test('one run with 3 payslips and a tip gives 4 out rows with correct kinds, periods and amounts', () => {
    const rows = buildLedgerRows(makeHistory({ withRun: true }), EMPLOYER);
    const outRows = rows.filter(r => r.direction === 'out');
    expect(outRows).toHaveLength(4);

    const slips = outRows.filter(r => r.kind === 'payslip');
    const tips = outRows.filter(r => r.kind === 'tip');
    expect(slips).toHaveLength(3);
    expect(tips).toHaveLength(1);
    for (const s of slips) {
      expect(s.period).toBe(0n);
      expect(s.amount).toBe(1000n);
    }
    expect(tips[0].period).toBe(0n);
    expect(tips[0].amount).toBe(500n);
  });

  test('Funded gives 1 in row', () => {
    const rows = buildLedgerRows(makeHistory({ withFund: true }), EMPLOYER);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('funded');
    expect(rows[0].direction).toBe('in');
    expect(rows[0].amount).toBe(10000n);
  });

  test('a plain transfer in gives a direct row', () => {
    const rows = buildLedgerRows(makeHistory({ withDirect: true }), EMPLOYER);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('direct');
    expect(rows[0].direction).toBe('in');
    expect(rows[0].amount).toBe(200n);
  });

  test('describeRow uses 1-based period display label', () => {
    const rows = buildLedgerRows(makeHistory({ withRun: true }), EMPLOYER);
    const slip = rows.find(r => r.kind === 'payslip')!;
    const tip = rows.find(r => r.kind === 'tip')!;
    // period index 0 -> "Period 0001"
    expect(describeRow(slip)).toBe('Payslip, Period 0001');
    expect(describeRow(tip)).toBe('Tip to runner, Period 0001');
  });

  test('row sums equal summarizeLedger totals for a full fixture', () => {
    const history = makeHistory({ withRun: true, withFund: true, withDirect: true });
    const totalIn = history.usdcIn.reduce((s, t) => s + t.value, 0n);
    const totalOut = history.usdcOut.reduce((s, t) => s + t.value, 0n);
    const balanceAfter = totalIn - totalOut;
    const state = { employer: EMPLOYER, startTime: 0n, periodLength: 3600n };
    const ledger = summarizeLedger(history, 0n, balanceAfter, state);
    const rows = buildLedgerRows(history, EMPLOYER);

    const totalPaidRows = rows.filter(r => r.kind === 'payslip').reduce((s, r) => s + r.amount, 0n);
    const totalTipsRows = rows.filter(r => r.kind === 'tip').reduce((s, r) => s + r.amount, 0n);
    const totalFundedRows = rows.filter(r => r.kind === 'funded').reduce((s, r) => s + r.amount, 0n);
    const directRows = rows.filter(r => r.kind === 'direct').reduce((s, r) => s + r.amount, 0n);

    expect(totalPaidRows).toBe(ledger.totals.totalPaid);
    expect(totalTipsRows).toBe(ledger.totals.totalTips);
    expect(totalFundedRows).toBe(ledger.totals.totalFunded);
    expect(directRows).toBe(ledger.totals.directDeposits);
  });
});
