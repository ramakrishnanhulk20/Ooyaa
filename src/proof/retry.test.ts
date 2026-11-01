import { describe, test, expect } from "bun:test";
import { ContractFunctionRevertedError } from "viem";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  test("rate-limit error twice then success returns the value", async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls <= 2) {
          return Promise.reject(new Error("Request exceeds defined limit"));
        }
        return Promise.resolve(42);
      },
      "test",
    );
    expect(result).toBe(42);
    expect(calls).toBe(3);
  });

  test("contract revert is thrown immediately without retrying", async () => {
    let calls = 0;
    const revert = new ContractFunctionRevertedError({
      abi: [],
      functionName: "run",
      data: "0x",
    });
    let threw = false;
    try {
      await withRetry(
        () => {
          calls++;
          return Promise.reject(revert);
        },
        "test",
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // Only one attempt: retrying a revert is pointless.
    expect(calls).toBe(1);
  });

  test("rate-limit message is reported on backoff", async () => {
    let calls = 0;
    const messages: string[] = [];
    await withRetry(
      () => {
        calls++;
        if (calls === 1) return Promise.reject(new Error("rate limit exceeded"));
        return Promise.resolve("ok");
      },
      "test-label",
      msg => messages.push(msg),
    );
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("rate limiting");
  });
});
