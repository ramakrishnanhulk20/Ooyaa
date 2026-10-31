/**
 * Shared viem public clients for the browser proof page.
 *
 * VITE_ARC_RPC_URL (optional): a domain-restricted private Arc mainnet endpoint
 * (QuickNode or similar). When set, mainnetClient and archiveClient use it as the
 * primary transport with Arc's public node as a fallback; LOG_SOURCES lists it
 * first. When unset, both clients fall back to Arc's public node only.
 *
 * The private transport is wrapped in a rate limiter that caps at 8 requests in
 * flight and 40 request starts per rolling second. A 429 or -32007 from the
 * private node waits 300 ms and retries up to 3 times before letting viem's
 * fallback move to Arc's node.
 *
 * No JSON-RPC batching: Arc's public node rate-limits every call inside a batch
 * individually, returning -32005 for most of them.
 */
import { createPublicClient, fallback, http, custom } from 'viem';
import { arc, arcTestnet } from 'viem/chains';
import type { PublicClient } from 'viem';

const PRIVATE_RPC: string | undefined =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_ARC_RPC_URL
    ? (import.meta as { env?: Record<string, string | undefined> }).env!.VITE_ARC_RPC_URL
    : undefined;

const ARC_RPC = 'https://rpc.mainnet.arc.io';
const TESTNET_RPC = 'https://rpc.testnet.arc.io';

// Rate-limit constants for the private node.
// QuickNode Arc allows 50 req/s; we stay safely under with 40.
const MAX_IN_FLIGHT = 8;
const MAX_PER_SECOND = 40;
const RATE_LIMIT_RETRY_DELAY_MS = 300;
const RATE_LIMIT_MAX_RETRIES = 3;

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: number }).code;
  if (code === -32007) return true;
  const msg = err.message.toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('request limit reached');
}

/**
 * Wraps a raw RPC URL with a rate limiter that enforces at most MAX_IN_FLIGHT
 * requests in flight and at most MAX_PER_SECOND starts per rolling second.
 * On a rate-limit response it waits 300 ms and retries up to 3 times before
 * rejecting (letting the outer fallback() transport move to Arc's node).
 */
function rateLimitedHttp(url: string) {
  const inner = http(url, { timeout: 30_000 });

  const startTimes: number[] = [];
  let inFlight = 0;

  async function acquireSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (startTimes.length > 0 && startTimes[0] <= now - 1000) {
        startTimes.shift();
      }
      if (inFlight < MAX_IN_FLIGHT && startTimes.length < MAX_PER_SECOND) {
        inFlight++;
        startTimes.push(now);
        return;
      }
      const waitUntil = startTimes.length >= MAX_PER_SECOND
        ? startTimes[0] + 1001
        : Date.now() + 10;
      await new Promise<void>(resolve => setTimeout(resolve, Math.max(0, waitUntil - Date.now())));
    }
  }

  // Build the inner client's transport with a temporary no-op chain so we can
  // extract its EIP-1193 request function and then wrap it.
  // We return a Transport factory function that wriem can use.
  return ({ chain, retryCount: _r, timeout: _t }: Parameters<typeof inner>[0]) => {
    const innerTransport = inner({ chain, retryCount: 0, timeout: 30_000 });

    // custom() requires an EIP-1193 provider-like object.
    const provider = {
      request: async (args: { method: string; params?: unknown }) => {
        await acquireSlot();
        let lastErr: unknown;
        try {
          for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
            try {
              return await innerTransport.request(args);
            } catch (err) {
              if (isRateLimitError(err) && attempt < RATE_LIMIT_MAX_RETRIES) {
                await new Promise<void>(r => setTimeout(r, RATE_LIMIT_RETRY_DELAY_MS));
                lastErr = err;
                continue;
              }
              throw err;
            }
          }
          throw lastErr;
        } finally {
          inFlight--;
        }
      },
    };

    return custom(provider)({ chain, retryCount: 0 });
  };
}

// Transport for mainnet/archive: rate-limited private node first, then Arc.
const mainnetTransport = PRIVATE_RPC
  ? fallback([
      rateLimitedHttp(PRIVATE_RPC),
      http(ARC_RPC, { retryCount: 6, retryDelay: 1000, timeout: 30_000 }),
    ])
  : http(ARC_RPC, { retryCount: 6, retryDelay: 1000, timeout: 30_000 });

export const mainnetClient = createPublicClient({
  chain: arc,
  transport: mainnetTransport,
});

export const testnetClient = createPublicClient({
  chain: arcTestnet,
  transport: http(TESTNET_RPC, { retryCount: 6, retryDelay: 1000, timeout: 30_000 }),
});

/**
 * Arc's own node supports historical state. Shares the same fallback transport
 * as mainnetClient so the private node is tried first when available.
 */
export const archiveClient = createPublicClient({
  chain: arc,
  transport: mainnetTransport,
});

/**
 * Named log sources for browser history fetches.
 * Each entry carries the PublicClient, the chunk size, and the parallel cap.
 * prove() and readHistory() iterate this array and fall back on non-rate-limit
 * errors. When VITE_ARC_RPC_URL is unset, only Arc is listed.
 */
export const LOG_SOURCES: Array<{
  name: string;
  client: PublicClient;
  chunk: bigint;
  parallel: number;
}> = PRIVATE_RPC
  ? [
      { name: 'QuickNode', client: mainnetClient, chunk: 10_000n, parallel: 8 },
      {
        name: 'Arc',
        client: createPublicClient({
          chain: arc,
          transport: http(ARC_RPC, { retryCount: 6, retryDelay: 1000, timeout: 30_000 }),
        }),
        chunk: 10_000n,
        parallel: 2,
      },
    ]
  : [
      {
        name: 'Arc',
        client: mainnetClient,
        chunk: 10_000n,
        parallel: 2,
      },
    ];
