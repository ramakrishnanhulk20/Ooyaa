/**
 * Tests for the C8 caught-up finder logic.
 * The finder identifies the most recent PaydayRun after which the payroll
 * was caught up, using only history data (no extra RPC calls).
 *
 * A run that paid period p at block B is "caught up" when:
 *   nextUnpaid(p+1) >= startedPeriods(floor((ts(B)-startTime)/periodLength)+1)
 */
import { describe, test, expect } from "bun:test";

const START_TIME = 1_000_000n;
const PERIOD_LEN = 3600n; // 1 hour

type FakeRun = {
  eventName: "PaydayRun";
  blockNumber: bigint;
  args: { period: bigint };
};

/**
 * Pure mirror of the isCaughtUp logic extracted from prove.ts.
 * If the test fails it means the prove.ts logic needs the same fix.
 */
function isCaughtUp(
  run: FakeRun,
  blockTimes: Map<bigint, bigint>,
  startTime: bigint,
  periodLength: bigint,
): boolean {
  const period = run.args.period;
  const nextUnpaid = period + 1n;
  const ts = blockTimes.get(run.blockNumber);
  if (ts === undefined || ts <= startTime) return false;
  const sp = (ts - startTime) / periodLength + 1n;
  return nextUnpaid >= sp;
}

describe("C8 caught-up finder", () => {
  test("a lone run that paid the only started period is caught up", () => {
    // Period 0 started at START_TIME. Run happens at START_TIME + 60s.
    // ts = START_TIME + 60 -> sp = floor(60/3600)+1 = 1. nextUnpaid = 1. Caught up.
    const run: FakeRun = { eventName: "PaydayRun", blockNumber: 100n, args: { period: 0n } };
    const blockTimes = new Map([[100n, START_TIME + 60n]]);
    expect(isCaughtUp(run, blockTimes, START_TIME, PERIOD_LEN)).toBe(true);
  });

  test("a backlog run that still has outstanding periods is NOT caught up", () => {
    // Three periods started (ts = START_TIME + 3*PERIOD_LEN + 60).
    // Run paid only period 0 (nextUnpaid = 1). sp = 4. Not caught up.
    const run: FakeRun = { eventName: "PaydayRun", blockNumber: 200n, args: { period: 0n } };
    const blockTimes = new Map([[200n, START_TIME + 3n * PERIOD_LEN + 60n]]);
    expect(isCaughtUp(run, blockTimes, START_TIME, PERIOD_LEN)).toBe(false);
  });

  test("the last run of a burst is caught up while the earlier ones are not", () => {
    // Three periods started. Run pays period 0, then 1, then 2.
    // All happen within period 2's window (ts for each = START_TIME + 2*PERIOD_LEN + 30).
    const ts = START_TIME + 2n * PERIOD_LEN + 30n;
    // sp = floor((2*3600+30)/3600)+1 = floor(2.008)+1 = 3
    const run0: FakeRun = { eventName: "PaydayRun", blockNumber: 300n, args: { period: 0n } };
    const run1: FakeRun = { eventName: "PaydayRun", blockNumber: 301n, args: { period: 1n } };
    const run2: FakeRun = { eventName: "PaydayRun", blockNumber: 302n, args: { period: 2n } };
    const blockTimes = new Map([[300n, ts], [301n, ts], [302n, ts]]);
    expect(isCaughtUp(run0, blockTimes, START_TIME, PERIOD_LEN)).toBe(false);
    expect(isCaughtUp(run1, blockTimes, START_TIME, PERIOD_LEN)).toBe(false);
    expect(isCaughtUp(run2, blockTimes, START_TIME, PERIOD_LEN)).toBe(true);
  });

  test("run with no blockTime entry is not caught up", () => {
    const run: FakeRun = { eventName: "PaydayRun", blockNumber: 999n, args: { period: 0n } };
    const blockTimes = new Map<bigint, bigint>();
    expect(isCaughtUp(run, blockTimes, START_TIME, PERIOD_LEN)).toBe(false);
  });

  test("run at exactly startTime is not caught up (ts must be strictly after startTime)", () => {
    const run: FakeRun = { eventName: "PaydayRun", blockNumber: 400n, args: { period: 0n } };
    const blockTimes = new Map([[400n, START_TIME]]);
    expect(isCaughtUp(run, blockTimes, START_TIME, PERIOD_LEN)).toBe(false);
  });
});
