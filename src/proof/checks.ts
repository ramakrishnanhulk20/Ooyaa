import type { Address, Hex } from "viem";
import { formatUnits } from "viem";
import type { PayrollHistory } from "./history.js";
import type { parseEventLogs } from "viem";
import type { payrollAbi } from "./abi.js";
import { TEAM_WALLET_SET } from "./ourWallet.js";

export type CheckStatus = "PASS" | "FAIL" | "SKIP";

export type CheckResult = {
  id: string;
  title: string;
  status: CheckStatus;
  lines: string[];
  /** Set on per-payroll results (C4..C8); absent on C1..C3. */
  payroll?: import("viem").Address;
};

function pass(id: string, title: string, lines: string[]): CheckResult {
  return { id, title, status: "PASS", lines };
}
function fail(id: string, title: string, lines: string[]): CheckResult {
  return { id, title, status: "FAIL", lines };
}

// FAIL beats SKIP beats PASS.
export function combineStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("SKIP")) return "SKIP";
  return "PASS";
}

// strict: false matches PayrollHistory.events so filterName works without casts.
type AllEvents = ReturnType<typeof parseEventLogs<typeof payrollAbi, false>>;
type AnyParsedEvent = AllEvents[number];

type EventByName<N extends string> = Extract<AnyParsedEvent, { eventName: N }>;

type PaydayRunEvent = EventByName<"PaydayRun">;
type PayslipIssuedEvent = EventByName<"PayslipIssued">;
type PayoutDeferredEvent = EventByName<"PayoutDeferred">;
type FundedEvent = EventByName<"Funded">;
type ClaimedEvent = EventByName<"Claimed">;
type WithdrawnEvent = EventByName<"Withdrawn">;
type EmployerTransferredEvent = EventByName<"EmployerTransferred">;
type PayeeAddedEvent = EventByName<"PayeeAdded">;

function filterName<N extends AnyParsedEvent["eventName"]>(
  events: AnyParsedEvent[],
  name: N,
): EventByName<N>[] {
  return events.filter((e): e is EventByName<N> => e.eventName === name);
}

// strict:false makes all args optional even for events we know decoded fully.
// These helpers assert presence so call sites stay readable.
function reqAddr(a: Address | undefined): Address {
  if (!a) throw new Error("expected Address arg was undefined");
  return a;
}
function reqBig(n: bigint | undefined): bigint {
  if (n === undefined) throw new Error("expected bigint arg was undefined");
  return n;
}

export type MatchResult = {
  unmatchedPayslips: string[];
  unmatchedTips: string[];
  unmatchedClaimed: string[];
  unmatchedWithdrawn: string[];
  unmatchedFunded: string[];
  unexplainedOutTxs: Hex[];
  directDeposits: bigint;
  totalFunded: bigint;
  totalOut: bigint;
  totalIn: bigint;
};

// One-to-one transfer matching across all event types within each tx.
// Payslip/tip/Claimed/Withdrawn consume from usdcOut; Funded consumes from usdcIn.
// Unconsumed usdcOut entries produce unexplainedOutTxs.
// Unconsumed usdcIn entries that have no matching Funded are direct deposits.
export function matchTransfers(history: PayrollHistory): MatchResult {
  const events: AnyParsedEvent[] = history.events;
  const runs = filterName(events, "PaydayRun");
  const payslips = filterName(events, "PayslipIssued");
  const deferred = filterName(events, "PayoutDeferred");
  void deferred;
  const claimed = filterName(events, "Claimed");
  const withdrawn = filterName(events, "Withdrawn");
  const funded = filterName(events, "Funded");

  const totalIn = history.usdcIn.reduce((s, t) => s + t.value, 0n);
  const totalOut = history.usdcOut.reduce((s, t) => s + t.value, 0n);
  const totalFunded = funded.reduce((s, e) => s + (e.args.amount ?? 0n), 0n);

  // Per-tx consumed sets for outflows.
  const outConsumedByTx = new Map<string, Set<number>>();
  for (const t of history.usdcOut) {
    const k = t.txHash.toLowerCase();
    if (!outConsumedByTx.has(k)) outConsumedByTx.set(k, new Set());
  }
  const inConsumedByTx = new Map<string, Set<number>>();
  for (const t of history.usdcIn) {
    const k = t.txHash.toLowerCase();
    if (!inConsumedByTx.has(k)) inConsumedByTx.set(k, new Set());
  }

  function outTransfersForTx(txLow: string) {
    return history.usdcOut
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.txHash.toLowerCase() === txLow);
  }
  function inTransfersForTx(txLow: string) {
    return history.usdcIn
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.txHash.toLowerCase() === txLow);
  }

  function consumeOut(txLow: string, to: Address, value: bigint): boolean {
    const consumed = outConsumedByTx.get(txLow)!;
    const toLow = to.toLowerCase();
    const entries = outTransfersForTx(txLow);
    const match = entries.find(({ t, i }) => !consumed.has(i) && t.to.toLowerCase() === toLow && t.value === value);
    if (!match) return false;
    consumed.add(match.i);
    return true;
  }

  function consumeIn(txLow: string, from: Address, value: bigint): boolean {
    const consumed = inConsumedByTx.get(txLow);
    if (!consumed) return false;
    const fromLow = from.toLowerCase();
    const entries = inTransfersForTx(txLow);
    const match = entries.find(({ t, i }) => !consumed.has(i) && t.from.toLowerCase() === fromLow && t.value === value);
    if (!match) return false;
    consumed.add(match.i);
    return true;
  }

  const unmatchedPayslips: string[] = [];
  const unmatchedTips: string[] = [];
  const unmatchedClaimed: string[] = [];
  const unmatchedWithdrawn: string[] = [];
  const unmatchedFunded: string[] = [];

  // Process in log order within each tx: payslips, then tips (from PaydayRun), then Claimed, Withdrawn.
  const allTxs = new Set([
    ...history.usdcOut.map(t => t.txHash.toLowerCase()),
    ...history.usdcIn.map(t => t.txHash.toLowerCase()),
    ...events.map(e => e.transactionHash.toLowerCase()),
  ]);

  for (const txLow of allTxs) {
    const txPayslips = payslips.filter(e => e.transactionHash.toLowerCase() === txLow);
    const txRuns = runs.filter(e => e.transactionHash.toLowerCase() === txLow);
    const txClaimed = claimed.filter(e => e.transactionHash.toLowerCase() === txLow);
    const txWithdrawn = withdrawn.filter(e => e.transactionHash.toLowerCase() === txLow);
    const txFunded = funded.filter(e => e.transactionHash.toLowerCase() === txLow);

    for (const slip of txPayslips) {
      const payee = reqAddr(slip.args.payee);
      const amount = reqBig(slip.args.amount);
      if (!consumeOut(txLow, payee, amount)) {
        unmatchedPayslips.push(
          `tx ${txLow.slice(0, 12)}: no matching USDC transfer for payslip to ${payee} amount ${amount}`,
        );
      }
    }
    for (const run of txRuns) {
      const tip = reqBig(run.args.tip);
      if (tip > 0n) {
        const runner = reqAddr(run.args.runner);
        if (!consumeOut(txLow, runner, tip)) {
          unmatchedTips.push(
            `tx ${txLow.slice(0, 12)}: no matching USDC transfer for tip to ${runner} amount ${tip}`,
          );
        }
      }
    }
    for (const c of txClaimed) {
      const payee = reqAddr(c.args.payee);
      const amount = reqBig(c.args.amount);
      if (!consumeOut(txLow, payee, amount)) {
        unmatchedClaimed.push(
          `tx ${txLow.slice(0, 12)}: Claimed(${payee}, ${amount}) has no matching USDC transfer`,
        );
      }
    }
    for (const w of txWithdrawn) {
      const to = reqAddr(w.args.to);
      const amount = reqBig(w.args.amount);
      if (!consumeOut(txLow, to, amount)) {
        unmatchedWithdrawn.push(
          `tx ${txLow.slice(0, 12)}: Withdrawn(${to}, ${amount}) has no matching USDC transfer`,
        );
      }
    }
    for (const f of txFunded) {
      const from = reqAddr(f.args.from);
      const amount = reqBig(f.args.amount);
      if (!consumeIn(txLow, from, amount)) {
        unmatchedFunded.push(
          `tx ${txLow.slice(0, 12)}: Funded(${from}, ${amount}) has no matching inflow`,
        );
      }
    }
  }

  const unexplainedOutTxs: Hex[] = [];
  for (const [txLow, consumed] of outConsumedByTx) {
    const entries = outTransfersForTx(txLow);
    if (entries.some(({ i }) => !consumed.has(i))) {
      unexplainedOutTxs.push(txLow as Hex);
    }
  }

  // Direct deposits: unconsumed inflows (no matching Funded consumed them).
  let directDeposits = 0n;
  for (const [txLow, consumed] of inConsumedByTx) {
    const entries = inTransfersForTx(txLow);
    for (const { t, i } of entries) {
      if (!consumed.has(i)) directDeposits += t.value;
    }
  }

  return {
    unmatchedPayslips,
    unmatchedTips,
    unmatchedClaimed,
    unmatchedWithdrawn,
    unmatchedFunded,
    unexplainedOutTxs,
    directDeposits,
    totalFunded,
    totalOut,
    totalIn,
  };
}

export function checkC5(
  history: PayrollHistory,
  nextUnpaid: bigint,
): CheckResult {
  const events: AnyParsedEvent[] = history.events;
  const runs = filterName(events, "PaydayRun");

  // Sort by (blockNumber, logIndex) for chronological order.
  runs.sort((x, y) =>
    x.blockNumber !== y.blockNumber
      ? Number(x.blockNumber - y.blockNumber)
      : x.logIndex - y.logIndex,
  );

  const lines: string[] = [];

  if (runs.length === 0) {
    lines.push("no paydays yet");
    if (nextUnpaid === 0n) return pass("C5", "paid exactly once, in order", lines);
    return fail("C5", "paid exactly once, in order", [
      ...lines,
      `nextUnpaid is ${nextUnpaid} but there are no PaydayRun events`,
    ]);
  }

  const failures: string[] = [];

  for (let i = 0; i < runs.length; i++) {
    if (runs[i].args.period !== BigInt(i)) {
      failures.push(`expected period ${i}, got ${runs[i].args.period}`);
    }
  }

  const seenPeriods = runs.map(r => r.args.period);
  const dupes = seenPeriods.filter((p, i) => seenPeriods.indexOf(p) !== i);
  for (const d of dupes) {
    failures.push(`period ${d} appears more than once`);
  }

  if (nextUnpaid !== BigInt(runs.length)) {
    failures.push(`nextUnpaid is ${nextUnpaid} but run count is ${runs.length}`);
  }

  if (failures.length > 0) return fail("C5", "paid exactly once, in order", failures);

  lines.push(`${runs.length} payday(s), periods 0 to ${runs.length - 1}, nextUnpaid = ${nextUnpaid}`);
  return pass("C5", "paid exactly once, in order", lines);
}

export function checkC6(history: PayrollHistory): CheckResult {
  const events: AnyParsedEvent[] = history.events;
  const runs = filterName(events, "PaydayRun");

  // C6 also needs to know about undecodable logs.
  const rawCount = (history as unknown as { rawLogCount?: number }).rawLogCount;
  const decodedCount = events.length;
  const undecoded = rawCount !== undefined ? rawCount - decodedCount : 0;

  const failures: string[] = [];
  if (undecoded > 0) {
    failures.push(`${undecoded} payroll log(s) could not be decoded by the ABI`);
  }

  if (runs.length === 0 && failures.length === 0) {
    return pass("C6", "every payslip is a real USDC transfer", ["no paydays yet"]);
  }

  const matched = matchTransfers(history);

  for (const msg of matched.unmatchedPayslips) failures.push(msg);
  for (const msg of matched.unmatchedTips) failures.push(msg);

  // Per-run: payslip amounts must sum to paid; deferred must sum to deferred.
  const payslips = filterName(events, "PayslipIssued");
  const deferred = filterName(events, "PayoutDeferred");

  for (const run of runs) {
    const txLow = run.transactionHash.toLowerCase();
    const period = run.args.period;

    const txPayslips = payslips.filter(
      e => e.transactionHash.toLowerCase() === txLow && e.args.period === period,
    );
    const txDeferred = deferred.filter(
      e => e.transactionHash.toLowerCase() === txLow && e.args.period === period,
    );

    const payslipSum = txPayslips.reduce((s, p) => s + reqBig(p.args.amount), 0n);
    const deferredSum = txDeferred.reduce((s, d) => s + reqBig(d.args.amount), 0n);
    const runPaid = reqBig(run.args.paid);
    const runDeferred = reqBig(run.args.deferred);

    if (payslipSum !== runPaid) {
      failures.push(
        `period ${period}: payslip amounts sum to ${payslipSum}, PaydayRun.paid = ${runPaid}`,
      );
    }
    if (deferredSum !== runDeferred) {
      failures.push(
        `period ${period}: deferred amounts sum to ${deferredSum}, PaydayRun.deferred = ${runDeferred}`,
      );
    }
  }

  if (failures.length > 0) return fail("C6", "every payslip is a real USDC transfer", failures);
  return pass("C6", "every payslip is a real USDC transfer", [`${runs.length} payday(s) verified`]);
}

export type LedgerTotals = {
  totalFunded: bigint;
  totalOut: bigint;
  totalIn: bigint;
  directDeposits: bigint;
  totalPaid: bigint;
  totalDeferred: bigint;
  totalTips: bigint;
  totalClaimed: bigint;
  totalWithdrawn: bigint;
  runCount: number;
  payslipCount: number;
};

export type Ledger = {
  payroll: Address;
  totals: LedgerTotals;
  // Runners who are not the employer, any past employer, or any payee ever named.
  outsideRunners: Address[];
  runners: Address[];
  payeesPaid: Address[];
  funders: Address[];
  allWallets: Address[];
};

function buildLedger(
  history: PayrollHistory,
  state: {
    employer: Address;
    startTime: bigint;
    periodLength: bigint;
  },
): Ledger {
  const events: AnyParsedEvent[] = history.events;
  const runs = filterName(events, "PaydayRun");
  const payslips = filterName(events, "PayslipIssued");
  const deferred = filterName(events, "PayoutDeferred");
  const claimed = filterName(events, "Claimed");
  const withdrawn = filterName(events, "Withdrawn");
  const employerTransfers = filterName(events, "EmployerTransferred");
  const payeeAdded = filterName(events, "PayeeAdded");

  const matched = matchTransfers(history);

  const totalPaid = payslips.reduce((s, e) => s + reqBig(e.args.amount), 0n);
  const totalDeferred = deferred.reduce((s, e) => s + reqBig(e.args.amount), 0n);
  const totalTips = runs.reduce((s, r) => s + reqBig(r.args.tip), 0n);
  const totalClaimed = claimed.reduce((s, e) => s + reqBig(e.args.amount), 0n);
  const totalWithdrawn = withdrawn.reduce((s, e) => s + reqBig(e.args.amount), 0n);

  const runnerSet = new Set(runs.map(r => reqAddr(r.args.runner).toLowerCase()));
  const payeesPaidSet = new Set(payslips.map(e => reqAddr(e.args.payee).toLowerCase()));
  const deferredAddrSet = new Set(deferred.map(e => reqAddr(e.args.payee).toLowerCase()));
  const payeeAddedSet = new Set(payeeAdded.map(e => reqAddr(e.args.payee).toLowerCase()));
  const funderSet = new Set(history.usdcIn.map(t => t.from.toLowerCase()));

  const pastEmployers = new Set<string>([state.employer.toLowerCase()]);
  for (const ev of employerTransfers) {
    pastEmployers.add(reqAddr(ev.args.previous).toLowerCase());
    pastEmployers.add(reqAddr(ev.args.current).toLowerCase());
  }

  const allPayeeAddrs = new Set([...payeesPaidSet, ...deferredAddrSet, ...payeeAddedSet]);

  const outsideRunners = [...runnerSet].filter(
    r => !pastEmployers.has(r) && !allPayeeAddrs.has(r) && !TEAM_WALLET_SET.has(r),
  );

  const allWalletsSet = new Set([
    ...runnerSet,
    ...payeesPaidSet,
    ...funderSet,
    ...history.usdcOut.map(t => t.to.toLowerCase()),
    ...history.usdcIn.map(t => t.from.toLowerCase()),
  ]);

  void state.startTime;
  void state.periodLength;

  return {
    payroll: history.payroll,
    totals: {
      totalFunded: matched.totalFunded,
      totalOut: matched.totalOut,
      totalIn: matched.totalIn,
      directDeposits: matched.directDeposits,
      totalPaid,
      totalDeferred,
      totalTips,
      totalClaimed,
      totalWithdrawn,
      runCount: runs.length,
      payslipCount: payslips.length,
    },
    outsideRunners: outsideRunners as Address[],
    runners: [...runnerSet] as Address[],
    payeesPaid: [...payeesPaidSet] as Address[],
    funders: [...funderSet] as Address[],
    allWallets: [...allWalletsSet] as Address[],
  };
}

export function summarizeLedger(
  history: PayrollHistory,
  balanceBefore: bigint,
  balanceAfter: bigint,
  state: { employer: Address; startTime: bigint; periodLength: bigint },
): Ledger & {
  balanceDeltaOk: boolean;
  balanceBefore: bigint;
  balanceAfter: bigint;
  unexplainedOut: Hex[];
  unmatchedFunded: string[];
  equation: string;
} {
  const matched = matchTransfers(history);
  const ledger = buildLedger(history, state);
  const balanceDeltaOk = (matched.totalIn - matched.totalOut) === (balanceAfter - balanceBefore);
  const equation =
    `balance at snapshot ${formatUnits(balanceAfter, 6)} - ` +
    `balance before creation ${formatUnits(balanceBefore, 6)} = ` +
    `in ${formatUnits(matched.totalIn, 6)} - ` +
    `out ${formatUnits(matched.totalOut, 6)}`;
  return {
    ...ledger,
    balanceDeltaOk,
    balanceBefore,
    balanceAfter,
    unexplainedOut: matched.unexplainedOutTxs,
    unmatchedFunded: matched.unmatchedFunded,
    equation,
  };
}

export function checkC7(
  history: PayrollHistory,
  balanceBefore: bigint,
  balanceAfter: bigint,
  state?: { employer: Address; startTime: bigint; periodLength: bigint },
): CheckResult {
  const dummyState = state ?? {
    employer: "0x0000000000000000000000000000000000000000",
    startTime: 0n,
    periodLength: 1n,
  };
  const matched = matchTransfers(history);
  const failures: string[] = [];

  for (const tx of matched.unexplainedOutTxs) failures.push(`unexplained outflow in tx ${tx}`);
  for (const msg of matched.unmatchedFunded) failures.push(`${msg} no matching inflow`);
  for (const msg of matched.unmatchedClaimed) failures.push(msg);
  for (const msg of matched.unmatchedWithdrawn) failures.push(msg);

  const balanceDeltaOk = (matched.totalIn - matched.totalOut) === (balanceAfter - balanceBefore);

  // The equation is always printed so a reader can verify the arithmetic at a glance.
  const equation =
    `balance at snapshot ${formatUnits(balanceAfter, 6)} - ` +
    `balance before creation ${formatUnits(balanceBefore, 6)} = ` +
    `in ${formatUnits(matched.totalIn, 6)} - ` +
    `out ${formatUnits(matched.totalOut, 6)}`;

  if (!balanceDeltaOk) {
    failures.push(`balance delta mismatch: ${equation}`);
  }

  const lines: string[] = [equation];
  if (matched.directDeposits > 0n) {
    lines.push(`direct deposit(s): ${formatUnits(matched.directDeposits, 6)} USDC (not a failure)`);
  }

  void dummyState;

  if (failures.length > 0) return fail("C7", "every cent accounted for", [...lines, ...failures]);
  return pass("C7", "every cent accounted for", lines);
}

// Re-export for prove.ts use.
export { buildLedger };
export type { PaydayRunEvent, PayslipIssuedEvent, PayoutDeferredEvent, FundedEvent, ClaimedEvent, WithdrawnEvent, EmployerTransferredEvent, PayeeAddedEvent };
