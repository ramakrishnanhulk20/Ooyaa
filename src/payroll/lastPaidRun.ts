import type { Address, AbiEvent, PublicClient, Hex, TransactionReceipt } from 'viem';
import { parseEventLogs } from 'viem';
import { payrollAbi } from '../proof/abi.js';
import { mainnetClient as defaultMainnetClient } from '../proof/clients.js';

export type PaidRunResult = {
  txHash: Hex;
  blockNumber: bigint;
  payslips: Array<{ payee: Address; amount: bigint }>;
  deferred: Array<{ payee: Address; amount: bigint }>;
  period: bigint;
  paid: bigint;
  totalDeferred: bigint;
  tip: bigint;
};

const WINDOW = 10_000n;

const paydayRunEvent = payrollAbi.find(
  e => e.type === 'event' && e.name === 'PaydayRun',
) as AbiEvent;

// Summarises a confirmed receipt into PaidRunResult.
// Filters to logs whose address matches the payroll (case-insensitive)
// so a multi-payroll tx does not bleed through.
export function summarizeRunReceipt(
  receipt: TransactionReceipt,
  payroll: Address,
): PaidRunResult {
  const payrollLow = payroll.toLowerCase();
  const payrollLogs = receipt.logs.filter(
    l => l.address.toLowerCase() === payrollLow,
  );

  const parsed = parseEventLogs({ abi: payrollAbi, logs: payrollLogs, strict: false });

  const run = parsed.find(e => e.eventName === 'PaydayRun');
  const slips = parsed.filter(e => e.eventName === 'PayslipIssued');
  const deferredEvs = parsed.filter(e => e.eventName === 'PayoutDeferred');

  const payslips = slips
    .map(e => {
      const payee = (e.args as { payee?: Address }).payee;
      const amount = (e.args as { amount?: bigint }).amount;
      return payee !== undefined && amount !== undefined ? { payee, amount } : null;
    })
    .filter((s): s is { payee: Address; amount: bigint } => s !== null);

  const deferred = deferredEvs
    .map(e => {
      const payee = (e.args as { payee?: Address }).payee;
      const amount = (e.args as { amount?: bigint }).amount;
      return payee !== undefined && amount !== undefined ? { payee, amount } : null;
    })
    .filter((s): s is { payee: Address; amount: bigint } => s !== null);

  const runArgs = run ? (run.args as {
    period?: bigint; paid?: bigint; deferred?: bigint; tip?: bigint;
  }) : {};

  return {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    payslips,
    deferred,
    period: runArgs.period ?? 0n,
    paid: runArgs.paid ?? 0n,
    totalDeferred: runArgs.deferred ?? 0n,
    tip: runArgs.tip ?? 0n,
  };
}

// Searches backwards in 10,000-block windows, newest first.
// Errors from the client propagate to the caller -- no swallowing.
// client defaults to mainnetClient (QuickNode->Arc fallback) so callers do not
// need to wire up their own transport.
export async function lastPaidRun(
  client: PublicClient = defaultMainnetClient,
  payroll: Address,
  period: bigint,
  fromBlock: bigint,
): Promise<PaidRunResult | null> {
  const latest = await client.getBlockNumber();

  let hi = latest;
  while (hi >= fromBlock) {
    const lo = hi - WINDOW + 1n < fromBlock ? fromBlock : hi - WINDOW + 1n;

    const logs = await client.getLogs({
      address: payroll,
      event: paydayRunEvent,
      args: { period } as Record<string, unknown>,
      fromBlock: lo,
      toBlock: hi,
    });

    if (logs.length > 0) {
      const log = logs[0] as { transactionHash: Hex };
      const receipt = await client.getTransactionReceipt({
        hash: log.transactionHash,
      });
      return summarizeRunReceipt(receipt, payroll);
    }

    if (lo <= fromBlock) break;
    hi = lo - 1n;
  }

  return null;
}
