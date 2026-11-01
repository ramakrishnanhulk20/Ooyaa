import { describe, test, expect } from "bun:test";
import type { Address, Hex } from "viem";
import { checkC5, checkC6, checkC7, combineStatus } from "./checks.js";
import type { PayrollHistory } from "./history.js";

const PAYROLL = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const TX1 = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
const TX2 = "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex;
const PAYEE1 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const PAYEE2 = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const PAYEE3 = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
const RUNNER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
const FUNDER = "0xffffffffffffffffffffffffffffffffffffffff" as Address;
const FUND_TX = "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex;

function makeRun(
  period: bigint, paid: bigint, deferred: bigint, tip: bigint,
  txHash = TX1, blockNumber = 100n, logIndex = 0,
) {
  return {
    eventName: "PaydayRun" as const,
    args: { period, runner: RUNNER, paid, deferred, tip },
    transactionHash: txHash, blockNumber, logIndex,
  };
}

function makePayslip(
  payee: Address, period: bigint, amount: bigint,
  txHash = TX1, blockNumber = 100n, logIndex = 1,
) {
  return {
    eventName: "PayslipIssued" as const,
    args: { payee, period, amount },
    transactionHash: txHash, blockNumber, logIndex,
  };
}

function makeFunded(
  amount: bigint, from: Address = FUNDER,
  txHash = FUND_TX, blockNumber = 50n, logIndex = 0,
) {
  return {
    eventName: "Funded" as const,
    args: { from, amount },
    transactionHash: txHash, blockNumber, logIndex,
  };
}

function makeClaimed(
  payee: Address, amount: bigint,
  txHash = TX1, blockNumber = 100n, logIndex = 5,
) {
  return {
    eventName: "Claimed" as const,
    args: { payee, amount },
    transactionHash: txHash, blockNumber, logIndex,
  };
}

function makeWithdrawn(
  to: Address, amount: bigint,
  txHash = TX1, blockNumber = 100n, logIndex = 6,
) {
  return {
    eventName: "Withdrawn" as const,
    args: { to, amount },
    transactionHash: txHash, blockNumber, logIndex,
  };
}

function makeTransfer(
  from: Address, to: Address, value: bigint,
  txHash = TX1, blockNumber = 100n, logIndex = 10,
) {
  return { txHash, blockNumber, logIndex, from, to, value };
}

function makeHistory(overrides: Partial<PayrollHistory> = {}): PayrollHistory {
  return {
    payroll: PAYROLL, fromBlock: 1n, toBlock: 200n,
    events: [], rawLogCount: 0, usdcOut: [], usdcIn: [], blockTimes: new Map(),
    ...overrides,
  };
}

function cleanHistory(): PayrollHistory {
  const events = [
    makeFunded(1_500_000n, FUNDER, FUND_TX, 50n, 0),
    makeRun(0n, 30_000n, 0n, 10_000n, TX1, 100n, 0),
    makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 1),
    makePayslip(PAYEE2, 0n, 10_000n, TX1, 100n, 2),
    makePayslip(RUNNER, 0n, 10_000n, TX1, 100n, 3),
  ] as PayrollHistory["events"];
  return makeHistory({
    events,
    rawLogCount: events.length,
    usdcOut: [
      makeTransfer(PAYROLL, PAYEE1, 10_000n, TX1, 100n, 10),
      makeTransfer(PAYROLL, PAYEE2, 10_000n, TX1, 100n, 11),
      makeTransfer(PAYROLL, RUNNER, 10_000n, TX1, 100n, 12),
      makeTransfer(PAYROLL, RUNNER, 10_000n, TX1, 100n, 13),
    ],
    usdcIn: [
      makeTransfer(FUNDER, PAYROLL, 1_500_000n, FUND_TX, 50n, 5),
    ],
  });
}

describe("C5: paid exactly once, in order", () => {
  test("clean history passes", () => {
    const r = checkC5(cleanHistory(), 1n);
    expect(r.status).toBe("PASS");
  });

  test("repeated period fails", () => {
    const h = makeHistory({
      events: [
        makeRun(0n, 10_000n, 0n, 0n, TX1, 100n, 0),
        makeRun(0n, 10_000n, 0n, 0n,
          "0x4444444444444444444444444444444444444444444444444444444444444444",
          101n, 0),
      ] as PayrollHistory["events"],
      rawLogCount: 2,
    });
    const r = checkC5(h, 2n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("more than once"))).toBe(true);
  });

  test("gap (periods 0, 2) fails", () => {
    const h = makeHistory({
      events: [
        makeRun(0n, 10_000n, 0n, 0n, TX1, 100n, 0),
        makeRun(2n, 10_000n, 0n, 0n,
          "0x4444444444444444444444444444444444444444444444444444444444444444",
          102n, 0),
      ] as PayrollHistory["events"],
      rawLogCount: 2,
    });
    const r = checkC5(h, 2n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("expected period 1"))).toBe(true);
  });

  test("nextUnpaid mismatch fails", () => {
    const r = checkC5(cleanHistory(), 5n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("nextUnpaid"))).toBe(true);
  });

  test("period 1 logged before period 0 fails", () => {
    // Same tx, but period 1 has a lower logIndex than period 0: sorting by
    // (blockNumber, logIndex) exposes the chronological violation.
    const h = makeHistory({
      events: [
        makeRun(1n, 10_000n, 0n, 0n, TX1, 100n, 0),
        makeRun(0n, 10_000n, 0n, 0n, TX2, 101n, 0),
      ] as PayrollHistory["events"],
      rawLogCount: 2,
    });
    const r = checkC5(h, 2n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("expected period 0"))).toBe(true);
  });
});

describe("C6: every payslip is a real USDC transfer", () => {
  test("clean history passes", () => {
    const r = checkC6(cleanHistory());
    expect(r.status).toBe("PASS");
  });

  test("payslip with no matching transfer fails", () => {
    const h = cleanHistory();
    (h.events as ReturnType<typeof makePayslip>[]).push(
      makePayslip(PAYEE3, 0n, 10_000n, TX1, 100n, 9),
    );
    (h.events as ReturnType<typeof makeRun>[]).find(
      e => e.eventName === "PaydayRun",
    )!.args.paid = 40_000n;
    h.rawLogCount = h.events.length;
    const r = checkC6(h);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("no matching USDC transfer"))).toBe(true);
  });

  test("two payslips to same payee, only one transfer, fails", () => {
    const events = [
      makeRun(0n, 20_000n, 0n, 0n, TX1, 100n, 0),
      makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 1),
      makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 2),
    ] as PayrollHistory["events"];
    const h = makeHistory({
      events, rawLogCount: events.length,
      usdcOut: [makeTransfer(PAYROLL, PAYEE1, 10_000n, TX1, 100n, 10)],
    });
    const r = checkC6(h);
    expect(r.status).toBe("FAIL");
  });

  test("payslip amounts not summing to PaydayRun.paid fails", () => {
    const events = [
      makeRun(0n, 99_999n, 0n, 0n, TX1, 100n, 0),
      makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 1),
    ] as PayrollHistory["events"];
    const h = makeHistory({
      events, rawLogCount: events.length,
      usdcOut: [makeTransfer(PAYROLL, PAYEE1, 10_000n, TX1, 100n, 10)],
    });
    const r = checkC6(h);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("PaydayRun.paid"))).toBe(true);
  });

  test("two PaydayRun in one tx with one set of transfers fails C6", () => {
    // Both runs are in TX1 but share only one set of USDC outputs.
    // The second run's payslips find no unconsumed transfers.
    const events = [
      makeRun(0n, 10_000n, 0n, 0n, TX1, 100n, 0),
      makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 1),
      makeRun(1n, 10_000n, 0n, 0n, TX1, 100n, 2),
      makePayslip(PAYEE1, 1n, 10_000n, TX1, 100n, 3),
    ] as PayrollHistory["events"];
    const h = makeHistory({
      events, rawLogCount: events.length,
      usdcOut: [makeTransfer(PAYROLL, PAYEE1, 10_000n, TX1, 100n, 10)],
    });
    const r = checkC6(h);
    expect(r.status).toBe("FAIL");
  });

  test("undecodable payroll log fails C6", () => {
    const events = [] as PayrollHistory["events"];
    const h = makeHistory({ events, rawLogCount: 5 });
    const r = checkC6(h);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("could not be decoded"))).toBe(true);
  });
});

describe("C7: every cent accounted for", () => {
  test("clean history passes", () => {
    const r = checkC7(cleanHistory(), 0n, 1_460_000n);
    expect(r.status).toBe("PASS");
  });

  test("outflow with no event fails", () => {
    const h = cleanHistory();
    h.usdcOut.push(makeTransfer(PAYROLL, PAYEE3, 5_000n,
      "0x5555555555555555555555555555555555555555555555555555555555555555",
      150n, 20));
    const r = checkC7(h, 0n, 1_455_000n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("unexplained outflow"))).toBe(true);
  });

  test("Funded with no matching inflow fails", () => {
    const h = cleanHistory();
    h.usdcIn = [];
    const r = checkC7(h, 0n, -40_000n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("no matching inflow"))).toBe(true);
  });

  test("balance delta mismatch fails", () => {
    const r = checkC7(cleanHistory(), 0n, 999n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("balance delta mismatch"))).toBe(true);
  });

  test("direct deposit is listed and still passes", () => {
    const h = cleanHistory();
    const directTx = "0x6666666666666666666666666666666666666666666666666666666666666666" as Hex;
    h.usdcIn.push(makeTransfer(PAYEE3, PAYROLL, 50_000n, directTx, 80n, 99));
    const r = checkC7(h, 0n, 1_510_000n);
    expect(r.status).toBe("PASS");
    expect(r.lines.some(l => l.includes("direct deposit"))).toBe(true);
  });

  test("Claimed with no transfer fails C7", () => {
    const events = [
      makeRun(0n, 10_000n, 0n, 0n, TX1, 100n, 0),
      makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 1),
      makeClaimed(PAYEE1, 5_000n, TX2, 110n, 0),
    ] as PayrollHistory["events"];
    const h = makeHistory({
      events, rawLogCount: events.length,
      usdcOut: [makeTransfer(PAYROLL, PAYEE1, 10_000n, TX1, 100n, 10)],
      usdcIn: [],
    });
    const r = checkC7(h, 0n, -5_000n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("Claimed"))).toBe(true);
  });

  test("Withdrawn with no transfer fails C7", () => {
    const events = [
      makeRun(0n, 10_000n, 0n, 0n, TX1, 100n, 0),
      makePayslip(PAYEE1, 0n, 10_000n, TX1, 100n, 1),
      makeWithdrawn(PAYEE2, 5_000n, TX2, 110n, 0),
    ] as PayrollHistory["events"];
    const h = makeHistory({
      events, rawLogCount: events.length,
      usdcOut: [makeTransfer(PAYROLL, PAYEE1, 10_000n, TX1, 100n, 10)],
    });
    const r = checkC7(h, 0n, -5_000n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("Withdrawn"))).toBe(true);
  });

  test("two Funded of one amount with one inflow fails C7", () => {
    const events = [
      makeFunded(1_000n, FUNDER, FUND_TX, 50n, 0),
      makeFunded(1_000n, FUNDER, FUND_TX, 50n, 1),
    ] as PayrollHistory["events"];
    const h = makeHistory({
      events, rawLogCount: events.length,
      usdcIn: [makeTransfer(FUNDER, PAYROLL, 1_000n, FUND_TX, 50n, 5)],
    });
    const r = checkC7(h, 0n, 1_000n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l => l.includes("no matching inflow"))).toBe(true);
  });
});

describe("C7: equation line", () => {
  test("pass result contains the balance equation", () => {
    // 1.5 USDC funded, 0.04 USDC paid out, final balance 1.46 USDC.
    const r = checkC7(cleanHistory(), 0n, 1_460_000n);
    expect(r.status).toBe("PASS");
    // The equation must name both endpoint balances and the flow totals.
    expect(r.lines.some(l =>
      l.includes("balance at snapshot") &&
      l.includes("balance before creation") &&
      l.includes(" in ") &&
      l.includes(" out "),
    )).toBe(true);
  });

  test("fail result also contains the equation", () => {
    // Wrong final balance triggers the mismatch path.
    const r = checkC7(cleanHistory(), 0n, 999n);
    expect(r.status).toBe("FAIL");
    expect(r.lines.some(l =>
      l.includes("balance at snapshot") &&
      l.includes("balance before creation"),
    )).toBe(true);
  });
});

describe("combineStatus", () => {
  test("FAIL with SKIP is FAIL", () => {
    expect(combineStatus(["FAIL", "SKIP"])).toBe("FAIL");
  });

  test("SKIP with PASS is SKIP", () => {
    expect(combineStatus(["SKIP", "PASS"])).toBe("SKIP");
  });

  test("all PASS is PASS", () => {
    expect(combineStatus(["PASS", "PASS"])).toBe("PASS");
  });
});
