import { describe, test, expect } from "bun:test";
import { buildC3 } from "./prove.js";
import type { SourcifyStatus } from "./code.js";

// Fake runtimes: the reference and a divergent one.
const REF_RUNTIME = "0x6080604052abcdef";
const OTHER_RUNTIME = "0x6080604052112233";

// Four fake fixed-target results that all pass (exact_match from Sourcify).
function allPassFixed(): Array<{ label: string; sourcify: SourcifyStatus }> {
  return [
    { label: "mainnet factory", sourcify: "exact_match" },
    { label: "mainnet payroll 0xf037...717A", sourcify: "exact_match" },
    { label: "testnet factory", sourcify: "exact_match" },
    { label: "testnet reference payroll", sourcify: "exact_match" },
  ];
}

describe("buildC3", () => {
  test("extra payroll with equal runtime gives PASS and the code-identity line", () => {
    const result = buildC3({
      fixedTargets: allPassFixed(),
      extraPayrolls: [
        { address: "0x153EEF6d062037d55a192FE4474f8A07a90EbAEa", runtime: REF_RUNTIME },
      ],
      testnetRefRuntime: REF_RUNTIME,
    });
    expect(result.status).toBe("PASS");
    const line = result.lines.find(l => l.includes("0x153E"));
    expect(line).toBeTruthy();
    expect(line).toContain("byte-identical to the Sourcify-verified reference payroll");
  });

  test("extra payroll with different runtime gives FAIL", () => {
    const result = buildC3({
      fixedTargets: allPassFixed(),
      extraPayrolls: [
        { address: "0x153EEF6d062037d55a192FE4474f8A07a90EbAEa", runtime: OTHER_RUNTIME },
      ],
      testnetRefRuntime: REF_RUNTIME,
    });
    expect(result.status).toBe("FAIL");
    const line = result.lines.find(l => l.includes("0x153E"));
    expect(line).toContain("code differs from the verified reference payroll");
  });

  test("demo payroll 404 (not_verified) in fixed targets gives FAIL", () => {
    const fixed = allPassFixed();
    // Replace the demo payroll entry with a not_verified result.
    fixed[1] = { label: "mainnet payroll 0xf037...717A", sourcify: "not_verified" };
    const result = buildC3({
      fixedTargets: fixed,
      extraPayrolls: [],
      testnetRefRuntime: REF_RUNTIME,
    });
    expect(result.status).toBe("FAIL");
    const line = result.lines.find(l => l.includes("0xf037"));
    expect(line).toContain("not_verified");
  });

  test("FAIL beats SKIP: fixed target unreachable + extra payroll bad runtime", () => {
    const fixed = allPassFixed();
    // Mark mainnet factory as unreachable.
    fixed[0] = { label: "mainnet factory", sourcify: { unreachable: "timeout" } };
    const result = buildC3({
      fixedTargets: fixed,
      extraPayrolls: [
        { address: "0x153EEF6d062037d55a192FE4474f8A07a90EbAEa", runtime: OTHER_RUNTIME },
      ],
      testnetRefRuntime: REF_RUNTIME,
    });
    // SKIP from unreachable, FAIL from bad runtime -> combined FAIL.
    expect(result.status).toBe("FAIL");
  });

  test("all fixed pass, no extra payrolls gives PASS", () => {
    const result = buildC3({
      fixedTargets: allPassFixed(),
      extraPayrolls: [],
      testnetRefRuntime: REF_RUNTIME,
    });
    expect(result.status).toBe("PASS");
  });
});
