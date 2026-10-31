/**
 * Tests for getLogsChunked concurrency control, source-fallback behaviour,
 * and mergeHistory deduplication.
 */
import { describe, test, expect } from 'bun:test';
import { getLogsChunked, mergeHistory } from './history.js';
import type { PublicClient } from 'viem';
import type { PayrollHistory } from './history.js';
import type { Address, Hex } from 'viem';

// Builds a mock PublicClient whose getLogs records concurrency.
function makeMockClient(
  windowCount: number,
  onCall: (inFlight: number) => void,
): PublicClient {
  let inFlight = 0;
  // Each call simulates async work and reports peak concurrency.
  const getLogs = async (_opts: unknown): Promise<[]> => {
    inFlight++;
    onCall(inFlight);
    // Yield so parallel calls actually overlap.
    await new Promise<void>(r => setTimeout(r, 0));
    inFlight--;
    return [];
  };
  return { getLogs } as unknown as PublicClient;
}

describe('getLogsChunked concurrency', () => {
  test('with parallel 6 and 13 windows, at most 6 requests are ever in flight', async () => {
    const from = 0n;
    const to = 129_999n;
    let peakConcurrency = 0;
    const client = makeMockClient(13, (inFlight) => {
      if (inFlight > peakConcurrency) peakConcurrency = inFlight;
    });

    await getLogsChunked(client, {}, from, to, undefined, 6);

    expect(peakConcurrency).toBeLessThanOrEqual(6);
  });

  test('with default parallel 2 and 6 windows, at most 2 are in flight', async () => {
    const from = 0n;
    const to = 59_999n;
    let peakConcurrency = 0;
    const client = makeMockClient(6, (inFlight) => {
      if (inFlight > peakConcurrency) peakConcurrency = inFlight;
    });

    await getLogsChunked(client, {}, from, to, undefined);

    expect(peakConcurrency).toBeLessThanOrEqual(2);
  });

  test('with parallel 8 and 24 windows, at most 8 are in flight', async () => {
    const from = 0n;
    const to = 239_999n;
    let peakConcurrency = 0;
    const client = makeMockClient(24, (inFlight) => {
      if (inFlight > peakConcurrency) peakConcurrency = inFlight;
    });

    await getLogsChunked(client, {}, from, to, undefined, 8);

    expect(peakConcurrency).toBeLessThanOrEqual(8);
  });
});

// The fallback loop lives in prove.ts and uses fetchPayrollHistory per source.
// We test the same pattern here with a thin mock so the test stays fast.
function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number })?.code;
  return code === -32005 || msg.includes('rate limit') || msg.includes('too many requests');
}

type FetchResult = { rows: string[]; sourceIndex: number };

// Mirrors the source-iteration loop in prove.ts without going through withRetry.
async function fetchWithFallback(
  sources: Array<{ fetch: () => Promise<string[]> }>,
): Promise<FetchResult> {
  for (let i = 0; i < sources.length; i++) {
    try {
      const rows = await sources[i].fetch();
      return { rows, sourceIndex: i };
    } catch (err) {
      if (isRateLimit(err)) throw err;
      if (i < sources.length - 1) continue;
      throw err;
    }
  }
  throw new Error('no sources');
}

describe('log source fallback', () => {
  test('when the first source throws a non-rate-limit error, the second source rows are returned', async () => {
    const result = await fetchWithFallback([
      { fetch: () => Promise.reject(new Error('node offline')) },
      { fetch: () => Promise.resolve(['row1', 'row2']) },
    ]);

    expect(result.sourceIndex).toBe(1);
    expect(result.rows).toEqual(['row1', 'row2']);
  });

  test('a rate-limit error from source 0 propagates and source 1 is not tried', async () => {
    const rateLimitErr = Object.assign(new Error('rate limit exceeded'), { code: -32005 });
    let source1Called = false;

    let threw: unknown;
    try {
      await fetchWithFallback([
        { fetch: () => Promise.reject(rateLimitErr) },
        {
          fetch: () => {
            source1Called = true;
            return Promise.resolve([]);
          },
        },
      ]);
    } catch (err) {
      threw = err;
    }

    expect(threw).toBe(rateLimitErr);
    expect(source1Called).toBe(false);
  });

  test('when both sources fail, the error from the last source propagates', async () => {
    const err1 = new Error('source 0 offline');
    const err2 = new Error('source 1 offline');
    let threw: unknown;
    try {
      await fetchWithFallback([
        { fetch: () => Promise.reject(err1) },
        { fetch: () => Promise.reject(err2) },
      ]);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBe(err2);
  });
});

// Minimal PayrollHistory builder for mergeHistory tests.
const P = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;
const TX1 = ('0x' + '1'.repeat(64)) as Hex;
const TX2 = ('0x' + '2'.repeat(64)) as Hex;

function makeMinimalHistory(overrides: Partial<PayrollHistory>): PayrollHistory {
  return {
    payroll: P,
    fromBlock: 1n,
    toBlock: 100n,
    events: [],
    rawLogCount: 0,
    usdcOut: [],
    usdcIn: [],
    blockTimes: new Map(),
    ...overrides,
  };
}

describe('mergeHistory', () => {
  test('extends toBlock and appends new events without duplicating', () => {
    const cached = makeMinimalHistory({
      fromBlock: 1n,
      toBlock: 100n,
      usdcIn: [{ txHash: TX1, blockNumber: 50n, logIndex: 0, from: P, to: P, value: 1000n }],
    });
    const fresh = makeMinimalHistory({
      fromBlock: 101n,
      toBlock: 200n,
      usdcIn: [{ txHash: TX2, blockNumber: 150n, logIndex: 0, from: P, to: P, value: 2000n }],
    });

    const merged = mergeHistory(cached, fresh);

    expect(merged.fromBlock).toBe(1n);
    expect(merged.toBlock).toBe(200n);
    expect(merged.usdcIn).toHaveLength(2);
  });

  test('duplicate entries (same txHash + logIndex) are not added twice', () => {
    const sharedEntry = { txHash: TX1, blockNumber: 50n, logIndex: 0, from: P, to: P, value: 1000n };
    const cached = makeMinimalHistory({ usdcIn: [sharedEntry] });
    const fresh = makeMinimalHistory({ toBlock: 200n, usdcIn: [sharedEntry] });

    const merged = mergeHistory(cached, fresh);

    expect(merged.usdcIn).toHaveLength(1);
  });
});
