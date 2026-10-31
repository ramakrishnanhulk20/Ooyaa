import {
  type Address,
  type AbiEvent,
  type Hex,
  type PublicClient,
  parseEventLogs,
} from "viem";
import { payrollAbi, erc20Abi } from "./abi.js";
import { USDC_ADDRESS } from "../deployments.js";
import { withRetry } from "./retry.js";
import { LOG_SOURCES } from "./clients.js";

export type UsdcTransfer = {
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  from: Address;
  to: Address;
  value: bigint;
};

// rawLogCount lets checks.ts detect logs that parseEventLogs could not decode.
// strict: false is used so logs that do not match any ABI entry are included as
// raw entries rather than dropped, enabling C7 to flag undecodable logs.
export type PayrollHistory = {
  payroll: Address;
  fromBlock: bigint;
  toBlock: bigint;
  events: ReturnType<typeof parseEventLogs<typeof payrollAbi, false>>;
  rawLogCount: number;
  usdcOut: UsdcTransfer[];
  usdcIn: UsdcTransfer[];
  blockTimes: Map<bigint, bigint>;
};

const DEFAULT_CHUNK = 10_000n;

// Filter type for chunked log queries. Includes event + args so viem encodes
// indexed topics and sends them to the RPC, avoiding full log downloads.
type LogFilter = {
  address?: Address | Address[];
  event?: AbiEvent;
  args?: Record<string, unknown>;
};

export async function getLogsChunked(
  client: PublicClient,
  filter: LogFilter,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (msg: string) => void,
  parallel = 2,
  chunk = DEFAULT_CHUNK,
): Promise<Awaited<ReturnType<PublicClient["getLogs"]>>> {
  type LogItem = Awaited<ReturnType<PublicClient["getLogs"]>>[number];
  const all: LogItem[] = [];
  // chunkSize starts at the caller-supplied value and halves on range errors.
  let chunkSize = chunk;
  let cur = fromBlock;

  while (cur <= toBlock) {
    const numChunks = Number((toBlock - fromBlock) / chunkSize) + 1;
    const end = cur + chunkSize - 1n < toBlock ? cur + chunkSize - 1n : toBlock;
    onProgress?.(`scanning blocks ${cur} to ${end} (${numChunks} chunks)`);

    const batch: Array<[bigint, bigint]> = [];
    let b = cur;
    while (b <= toBlock && batch.length < parallel) {
      const be = b + chunkSize - 1n < toBlock ? b + chunkSize - 1n : toBlock;
      batch.push([b, be]);
      b = be + 1n;
    }

    const results = await Promise.allSettled(
      batch.map(([from, to]) =>
        withRetry(
          () => client.getLogs({
            ...filter,
            fromBlock: from,
            toBlock: to,
          } as Parameters<PublicClient["getLogs"]>[0]),
          `getLogs(${from}-${to})`,
          onProgress,
        ),
      ),
    );

    let rangeError = false;
    for (const r of results) {
      if (r.status === "rejected") {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        const isRange =
          (r.reason as { code?: number })?.code === -32012 ||
          msg.includes("range too large") ||
          msg.includes("too large");
        if (isRange) { rangeError = true; break; }
        throw r.reason;
      }
    }

    if (rangeError) {
      chunkSize = chunkSize / 2n;
      if (chunkSize < 1n) chunkSize = 1n;
      continue;
    }

    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const log of r.value) all.push(log);
      }
    }
    cur = b;
  }

  all.sort((a, b) => {
    const an = a.blockNumber ?? 0n;
    const bn2 = b.blockNumber ?? 0n;
    if (an !== bn2) return Number(an - bn2);
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });
  return all;
}

export async function findCreationBlock(
  client: PublicClient,
  address: Address,
  lo: bigint,
  hi: bigint,
  onProgress?: (msg: string) => void,
): Promise<bigint> {
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await withRetry(
      () => client.getCode({ address, blockNumber: mid }),
      `getCode(${address},${mid})`,
      onProgress,
    );
    if (!code || code === "0x") {
      lo = mid + 1n;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// The Transfer event ABI entry from erc20Abi typed as AbiEvent so viem encodes
// `from` or `to` as indexed topics rather than fetching all logs.
const transferEvent = erc20Abi.find(
  e => e.type === "event" && e.name === "Transfer",
) as AbiEvent;

function toUsdcTransfer(log: {
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  args: { from?: Address; to?: Address; value?: bigint };
}): UsdcTransfer | null {
  if (!log.args.from || !log.args.to || log.args.value === undefined) return null;
  return {
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    from: log.args.from,
    to: log.args.to,
    value: log.args.value,
  };
}

export async function fetchPayrollHistory(
  client: PublicClient,
  payroll: Address,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (msg: string) => void,
  parallel = 2,
  chunk = DEFAULT_CHUNK,
): Promise<PayrollHistory> {
  const [payrollRawLogs, inLogs, outLogs] = await Promise.all([
    // All payroll contract logs for event decoding.
    getLogsChunked(client, { address: payroll }, fromBlock, toBlock, onProgress, parallel, chunk),
    // USDC Transfer logs where `to` is this payroll (inflows).
    getLogsChunked(
      client,
      {
        address: USDC_ADDRESS,
        event: transferEvent,
        args: { to: payroll },
      },
      fromBlock,
      toBlock,
      onProgress,
      parallel,
      chunk,
    ),
    // USDC Transfer logs where `from` is this payroll (outflows).
    getLogsChunked(
      client,
      {
        address: USDC_ADDRESS,
        event: transferEvent,
        args: { from: payroll },
      },
      fromBlock,
      toBlock,
      onProgress,
      parallel,
      chunk,
    ),
  ]);

  const rawLogCount = payrollRawLogs.length;
  const events = parseEventLogs({
    abi: payrollAbi,
    logs: payrollRawLogs,
    strict: false,
  });

  const usdcIn: UsdcTransfer[] = [];
  for (const log of inLogs) {
    const t = toUsdcTransfer(log as {
      transactionHash: Hex; blockNumber: bigint; logIndex: number;
      args: { from?: Address; to?: Address; value?: bigint };
    });
    if (t && t.to.toLowerCase() === payroll.toLowerCase()) usdcIn.push(t);
  }

  const usdcOut: UsdcTransfer[] = [];
  for (const log of outLogs) {
    const t = toUsdcTransfer(log as {
      transactionHash: Hex; blockNumber: bigint; logIndex: number;
      args: { from?: Address; to?: Address; value?: bigint };
    });
    if (t && t.from.toLowerCase() === payroll.toLowerCase()) usdcOut.push(t);
  }

  for (const list of [usdcIn, usdcOut]) {
    list.sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? Number(a.blockNumber - b.blockNumber)
        : a.logIndex - b.logIndex,
    );
  }

  const blockTimes = new Map<bigint, bigint>();
  const runBlocks = new Set<bigint>();
  for (const ev of events) {
    if (ev.eventName === "PaydayRun") runBlocks.add(ev.blockNumber);
  }

  for (const raw of payrollRawLogs) {
    const bn = raw.blockNumber;
    if (bn !== null && runBlocks.has(bn)) {
      const ts = (raw as { blockTimestamp?: bigint | string }).blockTimestamp;
      if (ts !== undefined) blockTimes.set(bn, BigInt(ts));
    }
  }

  const missing = [...runBlocks].filter(bn => !blockTimes.has(bn));
  await Promise.all(
    missing.map(async bn => {
      const block = await withRetry(
        () => client.getBlock({ blockNumber: bn }),
        `getBlock(${bn})`,
        onProgress,
      );
      blockTimes.set(bn, block.timestamp);
    }),
  );

  return { payroll, fromBlock, toBlock, events, rawLogCount, usdcOut, usdcIn, blockTimes };
}

// Rate-limit errors back off within withRetry; everything else triggers a source
// fallback so a pruned or offline node does not silently stall a page load.
function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number })?.code;
  return code === -32005 || msg.includes("rate limit") || msg.includes("too many requests");
}

/**
 * Merges a new PayrollHistory (covering blocks after the cached one) into a
 * cached PayrollHistory. The result spans from cached.fromBlock to fresh.toBlock.
 * Used by useHistory to append only new blocks without re-fetching the full range.
 */
export function mergeHistory(
  cached: PayrollHistory,
  fresh: PayrollHistory,
): PayrollHistory {
  // Deduplicate by (txHash, logIndex) in case the overlap boundary lands mid-block.
  const seenKey = (txHash: string, logIndex: number) => `${txHash.toLowerCase()}:${logIndex}`;

  const existingEventKeys = new Set(
    cached.events.map(e => seenKey(e.transactionHash, e.logIndex)),
  );
  const newEvents = fresh.events.filter(
    e => !existingEventKeys.has(seenKey(e.transactionHash, e.logIndex)),
  );

  const seenOut = new Set(cached.usdcOut.map(t => seenKey(t.txHash, t.logIndex)));
  const newOut = fresh.usdcOut.filter(t => !seenOut.has(seenKey(t.txHash, t.logIndex)));

  const seenIn = new Set(cached.usdcIn.map(t => seenKey(t.txHash, t.logIndex)));
  const newIn = fresh.usdcIn.filter(t => !seenIn.has(seenKey(t.txHash, t.logIndex)));

  const blockTimes = new Map([...cached.blockTimes, ...fresh.blockTimes]);

  return {
    payroll: cached.payroll,
    fromBlock: cached.fromBlock,
    toBlock: fresh.toBlock,
    events: [...cached.events, ...newEvents],
    rawLogCount: cached.rawLogCount + fresh.rawLogCount,
    usdcOut: [...cached.usdcOut, ...newOut],
    usdcIn: [...cached.usdcIn, ...newIn],
    blockTimes,
  };
}

/**
 * Fetches the full history for a payroll using LOG_SOURCES, falling back to the
 * next source on any non-rate-limit error. Returns the history and the name of
 * the source that succeeded.
 *
 * When `prev` is supplied, only blocks after prev.toBlock are fetched and merged
 * into the cached history. When the chain head equals prev.toBlock the cached
 * history is returned unchanged.
 *
 * This is the single entry point for browser history reads: the proof page,
 * EveryPayslip, YourPayslips, and lastPaidRun all call readHistory so every
 * caller benefits from the same source order and fallback behaviour.
 */
export async function readHistory(
  payroll: Address,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (msg: string) => void,
  prev?: PayrollHistory,
): Promise<{ history: PayrollHistory; sourceUsed: string }> {
  // When we have a cached history that already covers toBlock, skip the fetch.
  if (prev && prev.toBlock >= toBlock) {
    return { history: prev, sourceUsed: 'cache' };
  }

  // For an incremental fetch only request blocks after the cached horizon.
  const fetchFrom = prev ? prev.toBlock + 1n : fromBlock;

  let lastErr: unknown;
  for (let i = 0; i < LOG_SOURCES.length; i++) {
    const src = LOG_SOURCES[i];
    try {
      const fresh = await fetchPayrollHistory(
        src.client,
        payroll,
        fetchFrom,
        toBlock,
        onProgress,
        src.parallel,
        src.chunk,
      );
      const history = prev ? mergeHistory(prev, fresh) : fresh;
      return { history, sourceUsed: src.name };
    } catch (err) {
      if (isRateLimit(err)) throw err;
      lastErr = err;
      if (i < LOG_SOURCES.length - 1) {
        onProgress?.(`${src.name} refused a log query, trying ${LOG_SOURCES[i + 1].name} instead`);
      }
    }
  }
  throw lastErr;
}
