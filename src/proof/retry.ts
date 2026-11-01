import { ContractFunctionRevertedError, BaseError } from "viem";

// Delays in seconds for successive backoff attempts (1, 2, 4, 8, 16 s).
const BACKOFF_SECONDS = [1, 2, 4, 8, 16];

function isRateLimit(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("exceeds defined limit") ||
    // viem wraps HTTP 429 in its own message format.
    msg.includes("429") ||
    (err as { status?: number }).status === 429
  );
}

function isContractRevert(err: unknown): boolean {
  if (err instanceof BaseError) {
    return err.walk(e => e instanceof ContractFunctionRevertedError) !== null;
  }
  return false;
}

function jitter(baseMs: number): number {
  // Add up to 25% jitter so parallel retries do not all fire at the same instant.
  return baseMs + Math.floor(Math.random() * baseMs * 0.25);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  onBackoff?: (msg: string) => void,
): Promise<T> {
  for (let attempt = 0; attempt <= BACKOFF_SECONDS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Contract reverts are deterministic: retrying will not help.
      if (isContractRevert(err)) throw err;

      if (isRateLimit(err) && attempt < BACKOFF_SECONDS.length) {
        const waitS = BACKOFF_SECONDS[attempt];
        const waitMs = jitter(waitS * 1000);
        onBackoff?.(`Arc RPC is rate limiting, waiting ${waitS} s (${label})`);
        await new Promise<void>(r => setTimeout(r, waitMs));
        continue;
      }

      // On the last attempt, or for non-rate-limit errors, rethrow.
      throw err;
    }
  }
  // Unreachable: the loop always returns or throws.
  throw new Error(`withRetry: exhausted attempts for ${label}`);
}
