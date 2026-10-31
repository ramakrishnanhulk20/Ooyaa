/**
 * Returns true only when both runtimes are non-empty AND byte-identical.
 * An empty runtime ("0x" or "") means no code at that address; passing it
 * through as equal would give C2 a false PASS when a contract is missing.
 */
export function runtimeEquals(a: string, b: string): boolean {
  if (!a || a === "0x" || !b || b === "0x") return false;
  return a.toLowerCase() === b.toLowerCase();
}

export type SourcifyStatus =
  | "exact_match"
  | "match"
  | "not_verified"
  | { unreachable: string };

async function tryFetch(
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const delays = [500, 1000, 2000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let resp: Response;
    try {
      resp = await fetchImpl(url);
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length) {
        await new Promise<void>(r => setTimeout(r, delays[attempt]));
        continue;
      }
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      throw new Error(`network: ${msg}`);
    }

    // 404: not verified. Only retry 5xx; any other 4xx (including 429) is unreachable.
    if (resp.status === 404) return resp;
    if (resp.status >= 500) {
      lastErr = new Error(`HTTP ${resp.status}`);
      if (attempt < delays.length) {
        await new Promise<void>(r => setTimeout(r, delays[attempt]));
        continue;
      }
      throw lastErr;
    }
    if (resp.status >= 400) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return resp;
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error("unreachable");
}

export async function sourcifyStatus(
  chainId: number,
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourcifyStatus> {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}`;
  let resp: Response;
  try {
    resp = await tryFetch(url, fetchImpl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { unreachable: msg };
  }

  if (resp.status === 404) return "not_verified";

  let body: unknown;
  try {
    body = await resp.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { unreachable: `bad JSON: ${msg}` };
  }

  if (body && typeof body === "object" && "match" in body) {
    const m = (body).match;
    if (m === "exact_match") return "exact_match";
    if (m === "match") return "match";
    if (m === null || m === undefined) return "not_verified";
    return { unreachable: `unexpected match value: ${JSON.stringify(m)}` };
  }

  return "not_verified";
}
