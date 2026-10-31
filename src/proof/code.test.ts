import { describe, test, expect } from "bun:test";
import { sourcifyStatus, runtimeEquals } from "./code.js";

function makeFetch(
  responses: Array<{ status: number; body?: unknown; throws?: boolean }>,
): typeof fetch {
  let call = 0;
  return (_url: string | URL | Request, _init?: RequestInit) => {
    const cfg = responses[call++ % responses.length];
    if (cfg.throws) throw new Error("network failure");
    const body = cfg.body !== undefined ? JSON.stringify(cfg.body) : "";
    const parsed: unknown = body.length > 0 ? JSON.parse(body) : null;
    const resp = {
      status: cfg.status,
      json: () => Promise.resolve(parsed),
    } as unknown as Response;
    return Promise.resolve(resp);
  };
}

describe("sourcifyStatus", () => {
  test("200 exact_match gives exact_match", async () => {
    const f = makeFetch([{ status: 200, body: { match: "exact_match" } }]);
    expect(await sourcifyStatus(1, "0xabc", f)).toBe("exact_match");
  });

  test("200 match null gives not_verified", async () => {
    const f = makeFetch([{ status: 200, body: { match: null } }]);
    expect(await sourcifyStatus(1, "0xabc", f)).toBe("not_verified");
  });

  test("404 gives not_verified", async () => {
    const f = makeFetch([{ status: 404 }]);
    expect(await sourcifyStatus(1, "0xabc", f)).toBe("not_verified");
  });

  test("503 four times gives unreachable", async () => {
    const f = makeFetch([
      { status: 503 },
      { status: 503 },
      { status: 503 },
      { status: 503 },
    ]);
    const result = await sourcifyStatus(1, "0xabc", f);
    expect(typeof result).toBe("object");
    expect(typeof (result as { unreachable: string }).unreachable).toBe("string");
  });

  test("429 gives unreachable", async () => {
    const f = makeFetch([{ status: 429 }]);
    const result = await sourcifyStatus(1, "0xabc", f);
    expect(typeof result).toBe("object");
    expect((result as { unreachable: string }).unreachable).toContain("429");
  });

  test("bad JSON gives unreachable", async () => {
    const badJsonFetch: typeof fetch = (_url, _init) => {
      const resp = {
        status: 200,
        json: () => Promise.reject(new Error("SyntaxError")),
      } as unknown as Response;
      return Promise.resolve(resp);
    };
    const result = await sourcifyStatus(1, "0xabc", badJsonFetch);
    expect(typeof result).toBe("object");
    expect((result as { unreachable: string }).unreachable).toContain("JSON");
  });
});

describe("runtimeEquals", () => {
  const BYTECODE = "0x6080604052600436";

  test("identical non-empty runtimes are equal", () => {
    expect(runtimeEquals(BYTECODE, BYTECODE)).toBe(true);
  });

  test("comparison is case-insensitive", () => {
    expect(runtimeEquals(BYTECODE.toUpperCase(), BYTECODE.toLowerCase())).toBe(true);
  });

  test("different non-empty runtimes are not equal", () => {
    expect(runtimeEquals(BYTECODE, "0x6080604052600437")).toBe(false);
  });

  test("empty string is not equal to anything, even itself", () => {
    expect(runtimeEquals("", "")).toBe(false);
  });

  test("0x sentinel is not equal to anything, even itself", () => {
    expect(runtimeEquals("0x", "0x")).toBe(false);
  });

  test("0x on one side makes them unequal even if the other is real bytecode", () => {
    expect(runtimeEquals("0x", BYTECODE)).toBe(false);
    expect(runtimeEquals(BYTECODE, "0x")).toBe(false);
  });
});
