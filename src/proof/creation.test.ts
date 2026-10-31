/**
 * Tests for creationBlockOf.
 * The function finds the block of the PayrollCreated log whose payroll topic
 * matches the requested address; it returns null when there is no such log.
 * The demo payroll is a fast-path special case: no network call is made.
 */
import { describe, test, expect } from "bun:test";
import { creationBlockOf } from "./creation.js";
import { ARC_MAINNET } from "../deployments.js";
import type { PublicClient } from "viem";

const FACTORY = "0x18C7c54b0E521B7a34D79608ac8CfA91466eDc9b" as const;
const PAYROLL = "0xaAbBcCdDeEfF001122334455667788990011AaBb" as const;

let getLogs_callCount = 0;

function makeClient(logs: { blockNumber: bigint | null }[]): PublicClient {
  return {
    getLogs: () => {
      getLogs_callCount++;
      return Promise.resolve(logs as ReturnType<typeof Array.prototype.map>);
    },
  } as unknown as PublicClient;
}

describe("creationBlockOf", () => {
  test("returns the blockNumber from the first matching log", async () => {
    const client = makeClient([{ blockNumber: 28272851n }]);
    const result = await creationBlockOf(client, PAYROLL, FACTORY, 28261674n, 28300000n);
    expect(result).toBe(28272851n);
  });

  test("returns null when no log is found", async () => {
    const client = makeClient([]);
    const result = await creationBlockOf(client, PAYROLL, FACTORY, 28261674n, 28300000n);
    expect(result).toBeNull();
  });

  test("returns null when the log has a null blockNumber (pending log)", async () => {
    const client = makeClient([{ blockNumber: null }]);
    const result = await creationBlockOf(client, PAYROLL, FACTORY, 28261674n, 28300000n);
    expect(result).toBeNull();
  });

  test("demo payroll returns the known creation block without any getLogs call", async () => {
    getLogs_callCount = 0;
    const client = makeClient([]);
    const result = await creationBlockOf(
      client,
      ARC_MAINNET.demoPayroll,
      FACTORY,
      28261674n,
      28300000n,
    );
    expect(result).toBe(ARC_MAINNET.demoPayrollBlock);
    expect(getLogs_callCount).toBe(0);
  });

  test("demo payroll address matching is case-insensitive", async () => {
    getLogs_callCount = 0;
    const client = makeClient([]);
    const lower = ARC_MAINNET.demoPayroll.toLowerCase() as `0x${string}`;
    const result = await creationBlockOf(client, lower, FACTORY, 28261674n, 28300000n);
    expect(result).toBe(ARC_MAINNET.demoPayrollBlock);
    expect(getLogs_callCount).toBe(0);
  });
});
