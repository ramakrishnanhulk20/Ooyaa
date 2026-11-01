import { describe, test, expect } from 'bun:test';
import type { Address, Hex, PublicClient, TransactionReceipt } from 'viem';
import { lastPaidRun, summarizeRunReceipt } from './lastPaidRun.js';

const PAYROLL = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const TX = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
const FROM_BLOCK = 1000n;

// Minimal fake log matching a PaydayRun event.
function fakeRunLog(blockNumber: bigint, period = 0n) {
  return { transactionHash: TX, blockNumber, address: PAYROLL, args: { period } };
}

// Fake receipt with one PaydayRun and one PayslipIssued for a given address.
function fakeReceipt(payrollAddr: Address = PAYROLL): TransactionReceipt {
  return {
    transactionHash: TX,
    blockNumber: 5000n,
    status: 'success',
    logs: [
      {
        address: payrollAddr,
        topics: ['0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex],
        data: '0x',
        blockNumber: 5000n,
        transactionHash: TX,
        transactionIndex: 0,
        blockHash: TX,
        logIndex: 0,
        removed: false,
      },
      {
        address: payrollAddr,
        topics: ['0xcafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe' as Hex],
        data: '0x',
        blockNumber: 5000n,
        transactionHash: TX,
        transactionIndex: 0,
        blockHash: TX,
        logIndex: 1,
        removed: false,
      },
    ],
  } as unknown as TransactionReceipt;
}

// Reusable fake client factory.
function makeClient(opts: {
  latestBlock?: bigint;
  logsMap?: Map<string, ReturnType<typeof fakeRunLog>[]>;
  shouldThrow?: boolean;
}): PublicClient {
  const latest = opts.latestBlock ?? 10_000n;
  const logsMap = opts.logsMap ?? new Map<string, ReturnType<typeof fakeRunLog>[]>();

  return {
    getBlockNumber: () => Promise.resolve(latest),
    getLogs: (args: { fromBlock: bigint; toBlock: bigint }) => {
      if (opts.shouldThrow) return Promise.reject(new Error('RPC error'));
      const key = `${args.fromBlock}-${args.toBlock}`;
      const v = logsMap.get(key) ?? [];
      return Promise.resolve(v as unknown as never[]);
    },
    getTransactionReceipt: () => Promise.resolve(fakeReceipt()),
  } as unknown as PublicClient;
}

describe('lastPaidRun', () => {
  test('run in the newest window: exactly one getLogs call', async () => {
    let callCount = 0;
    const client: PublicClient = {
      getBlockNumber: () => Promise.resolve(10_000n),
      getLogs: () => {
        callCount++;
        return Promise.resolve([fakeRunLog(9999n)] as unknown as never[]);
      },
      getTransactionReceipt: () => Promise.resolve(fakeReceipt()),
    } as unknown as PublicClient;

    const result = await lastPaidRun(client, PAYROLL, 0n, FROM_BLOCK);
    expect(result).not.toBeNull();
    expect(callCount).toBe(1);
  });

  test('run three windows back: windows are contiguous and never overlap', async () => {
    // With latest=30000 and window=10000:
    //   window 1: 21001-30000 (empty)
    //   window 2: 11001-21000 (empty)
    //   window 3: 1000-11000  (hit at FROM_BLOCK+500)
    const windows: Array<[bigint, bigint]> = [];
    const client: PublicClient = {
      getBlockNumber: () => Promise.resolve(30_000n),
      getLogs: (args: { fromBlock: bigint; toBlock: bigint }) => {
        windows.push([args.fromBlock, args.toBlock]);
        const logs = args.fromBlock <= FROM_BLOCK + 1000n
          ? [fakeRunLog(FROM_BLOCK + 500n)]
          : [];
        return Promise.resolve(logs as unknown as never[]);
      },
      getTransactionReceipt: () => Promise.resolve(fakeReceipt()),
    } as unknown as PublicClient;

    await lastPaidRun(client, PAYROLL, 0n, FROM_BLOCK);
    expect(windows.length).toBe(3);
    // Each window's lo - 1 equals the previous window's hi + 1 boundary.
    for (let i = 0; i + 1 < windows.length; i++) {
      expect(windows[i][0] - 1n).toBe(windows[i + 1][1]);
    }
  });

  test('the oldest window starts exactly at fromBlock', async () => {
    let lastFrom = -1n;
    const client: PublicClient = {
      getBlockNumber: () => Promise.resolve(2000n),
      getLogs: (args: { fromBlock: bigint }) => {
        lastFrom = args.fromBlock;
        return Promise.resolve([] as unknown as never[]);
      },
      getTransactionReceipt: () => Promise.resolve(fakeReceipt()),
    } as unknown as PublicClient;

    await lastPaidRun(client, PAYROLL, 0n, FROM_BLOCK);
    expect(lastFrom).toBe(FROM_BLOCK);
  });

  test('getLogs throws: lastPaidRun rejects with the same error', async () => {
    const client = makeClient({ shouldThrow: true });
    let caught: unknown;
    try {
      await lastPaidRun(client, PAYROLL, 0n, FROM_BLOCK);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('RPC error');
  });

  test('no run anywhere: returns null', async () => {
    const client = makeClient({ latestBlock: 2000n });
    const result = await lastPaidRun(client, PAYROLL, 0n, FROM_BLOCK);
    expect(result).toBeNull();
  });

  test('summarizeRunReceipt ignores PayslipIssued from a different address', () => {
    const receipt = fakeReceipt(OTHER);
    const result = summarizeRunReceipt(receipt, PAYROLL);
    // Receipt has logs only from OTHER, not PAYROLL: payslips must be empty.
    expect(result.payslips).toHaveLength(0);
    expect(result.txHash).toBe(TX);
  });
});
