import { test, expect, describe } from "bun:test";
import { mergeChecks, isVerified } from "./mergeChecks.js";
import type { CheckResult } from "./checks.js";

function r(
  id: string,
  status: CheckResult["status"],
  lines: string[] = [],
  payroll?: `0x${string}`,
): CheckResult {
  return { id, title: id, status, lines, payroll };
}

describe("mergeChecks", () => {
  test("single payroll: returns results in C1..C8 order", () => {
    const input = [
      r("C3", "PASS", ["c3 line"]),
      r("C1", "PASS", ["c1 line"]),
      r("C2", "FAIL", ["c2 line"]),
    ];
    const out = mergeChecks(input);
    expect(out.map(c => c.id)).toEqual(["C1", "C2", "C3"]);
  });

  test("only SKIPs for an id gives SKIP", () => {
    const input = [
      r("C8", "SKIP", ["no paydays"], "0x153EEF6d062037d55a192FE4474f8A07a90EbAEa"),
      r("C8", "SKIP", ["also skip"], "0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A"),
    ];
    const out = mergeChecks(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("C8");
    expect(out[0].status).toBe("SKIP");
  });

  test("C8 PASS for demo plus C8 SKIP for a second payroll gives PASS", () => {
    const demo = "0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A" as `0x${string}`;
    const other = "0x153EEF6d062037d55a192FE4474f8A07a90EbAEa" as `0x${string}`;
    const input = [
      r("C8", "PASS", ["Tested at block 100: run() reverted NothingDue."], demo),
      r("C8", "SKIP", ["no paydays"], other),
    ];
    const out = mergeChecks(input);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("PASS");
    // Skip reason should appear behind the short address prefix.
    const skipLine = out[0].lines.find(l => l.includes("no paydays"));
    expect(skipLine).toBeDefined();
    expect(skipLine).toMatch(/^0x153E/);
  });

  test("a FAIL from any payroll makes that row FAIL", () => {
    const pa = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const pb = "0x2222222222222222222222222222222222222222" as `0x${string}`;
    const input = [
      r("C5", "PASS", ["all good"], pa),
      r("C5", "FAIL", ["period gap at 3"], pb),
    ];
    const out = mergeChecks(input);
    expect(out[0].status).toBe("FAIL");
  });

  test("output order is C1..C8 regardless of input order", () => {
    const input = [
      r("C8", "PASS"),
      r("C5", "SKIP"),
      r("C1", "PASS"),
      r("C3", "FAIL"),
    ];
    const out = mergeChecks(input);
    expect(out.map(c => c.id)).toEqual(["C1", "C3", "C5", "C8"]);
  });

  test("lines from two payrolls are prefixed with short address when applicable", () => {
    const pa = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as `0x${string}`;
    const pb = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as `0x${string}`;
    const input = [
      r("C6", "PASS", ["all transfers verified"], pa),
      r("C6", "PASS", ["all transfers verified"], pb),
    ];
    const out = mergeChecks(input);
    // First line of the second payroll group is prefixed.
    expect(out[0].lines.some(l => l.startsWith("0xAAAA"))).toBe(true);
    expect(out[0].lines.some(l => l.startsWith("0xBBBB"))).toBe(true);
  });

  test("lines already starting with 0x are not double-prefixed", () => {
    const pa = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as `0x${string}`;
    const pb = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as `0x${string}`;
    const input = [
      r("C4", "PASS", ["0xAAAA...AAAA: isPayroll() = true"], pa),
      r("C4", "PASS", ["0xBBBB...BBBB: isPayroll() = true"], pb),
    ];
    const out = mergeChecks(input);
    // Neither line should be prefixed again since they already start with 0x.
    expect(out[0].lines[0]).toBe("0xAAAA...AAAA: isPayroll() = true");
    expect(out[0].lines[1]).toBe("0xBBBB...BBBB: isPayroll() = true");
  });
});

const ALL_IDS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];

function allPass(): CheckResult[] {
  return ALL_IDS.map(id => r(id, "PASS"));
}

describe("isVerified", () => {
  test("all 8 PASS gives true", () => {
    expect(isVerified(allPass())).toBe(true);
  });

  test("all PASS for demo plus C8 SKIP for a second payroll gives true", () => {
    const demo = "0xf03714EA422237BCb5d1B0BDd40B4Ff22B13717A" as `0x${string}`;
    const other = "0x153EEF6d062037d55a192FE4474f8A07a90EbAEa" as `0x${string}`;
    // C8 PASS on demo merges with C8 SKIP on other to PASS.
    const checks: CheckResult[] = [
      ...ALL_IDS.slice(0, 7).map(id => r(id, "PASS")),
      r("C8", "PASS", ["reverted NothingDue"], demo),
      r("C8", "SKIP", ["no paydays"], other),
    ];
    expect(isVerified(checks)).toBe(true);
  });

  test("a FAIL on any check gives false", () => {
    const checks = allPass();
    checks[3] = r("C4", "FAIL");
    expect(isVerified(checks)).toBe(false);
  });

  test("a SKIP on any check (standalone) gives false", () => {
    const checks = allPass();
    checks[7] = r("C8", "SKIP");
    expect(isVerified(checks)).toBe(false);
  });

  test("missing an id gives false", () => {
    const checks = allPass().slice(0, 7);
    expect(isVerified(checks)).toBe(false);
  });

  test("empty array gives false", () => {
    expect(isVerified([])).toBe(false);
  });
});
