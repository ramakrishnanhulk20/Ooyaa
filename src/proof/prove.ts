import {
  type Address,
  type AbiEvent,
  type Hex,
  type PublicClient,
  keccak256,
  formatUnits,
  ContractFunctionRevertedError,
  BaseError,
  getAddress,
} from "viem";
import { payrollAbi, factoryAbi, erc20Abi } from "./abi.js";
import { ARC_MAINNET, ARC_TESTNET, USDC_ADDRESS } from "../deployments.js";
import { runtimeEquals, sourcifyStatus } from "./code.js";
import type { SourcifyStatus } from "./code.js";
import { findCreationBlock, fetchPayrollHistory } from "./history.js";
import { checkC5, checkC6, checkC7, summarizeLedger, combineStatus } from "./checks.js";
import { periodDisplayLabel } from "../payroll/format.js";
import { withRetry } from "./retry.js";
import type { CheckResult, Ledger } from "./checks.js";
import type { PayrollHistory } from "./history.js";

export type PayrollLedger = {
  payroll: Address;
  history: PayrollHistory;
  state: {
    employer: Address;
    payeeCount: bigint;
    tipPerRun: bigint;
    periodLength: bigint;
    startTime: bigint;
    nextUnpaid: bigint;
    startedPeriods: bigint;
    balance: bigint;
    owed: bigint;
    runway: bigint;
    nextPayday: bigint;
    dueNow: boolean;
  };
  balanceBefore: bigint;
  balanceAfter: bigint;
  ledger: Ledger;
  checks: CheckResult[];
};

export type ProofReport = {
  snapshotBlock: bigint;
  snapshotTime: bigint;
  factory: Address;
  checks: CheckResult[];
  ledgers: PayrollLedger[];
  /** Name of the log source that delivered payroll history (e.g. "Blockdaemon"). */
  logSourceUsed?: string;
};

function keccakShort(runtime: Hex): string {
  return keccak256(runtime);
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/**
 * Pure C3 evaluation: takes pre-resolved Sourcify statuses for the four fixed
 * addresses, the set of extra factory payrolls (all except the demo payroll),
 * their on-chain runtimes, and the testnet reference runtime.
 * Returns the C3 CheckResult.
 * Exported so unit tests can exercise it without a live viem client.
 */
export function buildC3(opts: {
  fixedTargets: Array<{ label: string; sourcify: SourcifyStatus }>;
  extraPayrolls: Array<{ address: string; runtime: string }>;
  testnetRefRuntime: string;
}): CheckResult {
  const lines: string[] = [];
  const partialStatuses: Array<import("./checks.js").CheckStatus> = [];

  for (const { label, sourcify } of opts.fixedTargets) {
    if (typeof sourcify === "object") {
      lines.push(`${label}: unreachable (${sourcify.unreachable})`);
      partialStatuses.push("SKIP");
    } else if (sourcify === "exact_match") {
      lines.push(`${label}: exact_match`);
      partialStatuses.push("PASS");
    } else {
      lines.push(`${label}: ${sourcify} (expected exact_match)`);
      partialStatuses.push("FAIL");
    }
  }

  for (const { address, runtime } of opts.extraPayrolls) {
    const short = shortAddr(address);
    if (runtimeEquals(runtime, opts.testnetRefRuntime)) {
      lines.push(
        `mainnet payroll ${short}: made by the factory after launch; its code is byte-identical to the Sourcify-verified reference payroll (see C2).`,
      );
      partialStatuses.push("PASS");
    } else {
      lines.push(`mainnet payroll ${short}: code differs from the verified reference payroll.`);
      partialStatuses.push("FAIL");
    }
  }

  return {
    id: "C3",
    title: "verified source",
    status: combineStatus(partialStatuses),
    lines,
  };
}

const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;

function isNothingDue(err: unknown): boolean {
  if (err instanceof BaseError) {
    const reverted = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName === "NothingDue";
    }
  }
  return false;
}

function isUnderfunded(err: unknown): boolean {
  if (err instanceof BaseError) {
    const reverted = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName === "Underfunded";
    }
  }
  return false;
}

// Rate-limit errors should trigger a withRetry back-off, not a source fallback.
// Everything else (e.g. a node refusing a query entirely) triggers the fallback.
function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number })?.code;
  return code === -32005 || msg.includes("rate limit") || msg.includes("too many requests");
}

export async function prove(opts: {
  mainnet: PublicClient;
  testnet: PublicClient;
  /**
   * Archive-capable client for historical eth_calls. Any read with a fixed
   * historical blockNumber should go through this client to avoid nodes that
   * prune old state.
   */
  archive?: PublicClient;
  payrolls?: Address[];
  localRuntime?: { factory: Hex; payroll: Hex };
  onProgress?: (msg: string) => void;
  onCheck?: (c: CheckResult) => void;
  onPayrolls?: (payrolls: Address[]) => void;
  onLedger?: (l: { payroll: Address; ledger: Ledger; history: PayrollHistory; employer: Address }) => void;
  /** Limits C8 to only the N most recent runs. When absent, all runs are checked. */
  recentRunsOnly?: number;
  /**
   * Named log sources tried in order for payroll history.
   * Each entry carries the client, the chunk size, and the parallel cap for
   * that node. On a non-rate-limit error from source 0, the scan retries from
   * source 1. When absent, mainnet is used with the default chunk and parallel=2.
   */
  logSources?: Array<{ name: string; client: PublicClient; chunk: bigint; parallel: number }>;
  /**
   * When true, the creation block for each payroll comes from the factory's
   * PayrollCreated event (one getLogs call) rather than a binary-search getCode
   * scan (about 25 sequential calls, 6 s).
   */
  creationFromEvents?: boolean;
}): Promise<ProofReport> {
  const { mainnet, testnet, localRuntime, onProgress } = opts;
  const progress = (msg: string) => onProgress?.(msg);
  const retry = <T>(fn: () => Promise<T>, label: string) =>
    withRetry(fn, label, onProgress);

  // All reads with a fixed historical blockNumber go through the archive client
  // so that Blockdaemon's state pruning cannot cause silent -32603 errors.
  // Reads at the snapshot block (toBlock, resolved below) can stay on mainnet.
  const arc = opts.archive ?? mainnet;

  // Delivers every finished check to the caller in report order.
  function pushCheck(c: CheckResult): void {
    allChecks.push(c);
    opts.onCheck?.(c);
  }

  progress("reading snapshot block");
  const toBlock = await retry(() => mainnet.getBlockNumber(), "getBlockNumber");
  const snapshotBlockData = await retry(
    () => mainnet.getBlock({ blockNumber: toBlock }),
    "getBlock(snapshot)",
  );
  const snapshotTime = snapshotBlockData.timestamp;

  const allChecks: CheckResult[] = [];

  const mainnetFactory = ARC_MAINNET.factory;
  const testnetFactory = ARC_TESTNET.factory;
  const testnetReference = ARC_TESTNET.referencePayroll;

  progress("fetching runtimes");
  const [mainnetFactoryCode, testnetFactoryCode, testnetRefCode] = await Promise.all([
    retry(() => mainnet.getCode({ address: mainnetFactory, blockNumber: toBlock }), "getCode(mainnetFactory)"),
    retry(() => testnet.getCode({ address: testnetFactory }), "getCode(testnetFactory)"),
    retry(() => testnet.getCode({ address: testnetReference }), "getCode(testnetRef)"),
  ]);

  const mfRuntime = (mainnetFactoryCode ?? "0x");
  const tfRuntime = (testnetFactoryCode ?? "0x");
  const trRuntime = (testnetRefCode ?? "0x");

  let payrollAddrs = opts.payrolls;
  if (!payrollAddrs) {
    progress("enumerating payrolls");
    const count = await retry(
      () => mainnet.readContract({
        address: mainnetFactory,
        abi: factoryAbi,
        functionName: "payrollCount",
        blockNumber: toBlock,
      }),
      "readContract(payrollCount)",
    );
    payrollAddrs = [];
    for (let i = 0n; i < count; i++) {
      const addr = await retry(
        () => mainnet.readContract({
          address: mainnetFactory,
          abi: factoryAbi,
          functionName: "payrollAt",
          args: [i],
          blockNumber: toBlock,
        }),
        `readContract(payrollAt(${i}))`,
      );
      payrollAddrs.push(addr);
    }
  }

  // Notify the caller with the full payroll list once it is known.
  opts.onPayrolls?.(payrollAddrs);

  const payrollRuntimes = new Map<Address, Hex>();
  for (const p of payrollAddrs) {
    const code = await retry(
      () => mainnet.getCode({ address: p, blockNumber: toBlock }),
      `getCode(${p})`,
    );
    payrollRuntimes.set(p, (code ?? "0x"));
  }

  // C1: local build.
  if (localRuntime) {
    const factoryOk = runtimeEquals(mfRuntime, localRuntime.factory);
    const failedPayrolls: string[] = [];
    for (const [p, code] of payrollRuntimes) {
      if (!runtimeEquals(code, localRuntime.payroll)) failedPayrolls.push(p);
    }
    const lines: string[] = [
      `factory expected keccak256: ${keccakShort(localRuntime.factory)}`,
      `factory found keccak256:    ${keccakShort(mfRuntime)}`,
      `factory match: ${factoryOk ? "yes" : "NO"}`,
    ];
    for (const [p, code] of payrollRuntimes) {
      const ok = !failedPayrolls.includes(p);
      lines.push(
        `payroll ${p}: expected ${keccakShort(localRuntime.payroll)} found ${keccakShort(code)} match: ${ok ? "yes" : "NO"}`,
      );
    }
    pushCheck({
      id: "C1",
      title: "local build",
      status: !factoryOk || failedPayrolls.length > 0 ? "FAIL" : "PASS",
      lines,
    });
  } else {
    pushCheck({
      id: "C1",
      title: "local build",
      status: "SKIP",
      lines: ["run bun run contracts:build first (needs Foundry)"],
    });
  }

  // C2: same code on mainnet and testnet.
  {
    const factoryMatch = runtimeEquals(mfRuntime, tfRuntime);
    const lines: string[] = [
      `mainnet factory keccak256: ${keccakShort(mfRuntime)}`,
      `testnet factory keccak256: ${keccakShort(tfRuntime)}`,
      `match: ${factoryMatch ? "yes" : "NO"}`,
    ];
    const badPayrolls: string[] = [];
    for (const [p, code] of payrollRuntimes) {
      const ok = runtimeEquals(code, trRuntime);
      lines.push(
        `payroll ${p}: ${keccakShort(code)} vs testnet ref ${keccakShort(trRuntime)} match: ${ok ? "yes" : "NO"}`,
      );
      if (!ok) badPayrolls.push(p);
    }
    pushCheck({
      id: "C2",
      title: "same code on mainnet and testnet",
      status: !factoryMatch || badPayrolls.length > 0 ? "FAIL" : "PASS",
      lines,
    });
  }

  // C3: verified source.
  //
  // The four canonical addresses are checked against Sourcify directly.
  // Every other factory payroll is accepted by code identity: if its runtime
  // is byte-identical to the testnet reference (which Sourcify verifies as
  // exact_match), it is the same verified source.  This avoids a Sourcify 404
  // for payrolls created after launch that nobody has submitted to Sourcify.
  {
    progress("checking Sourcify");

    const demoPayroll = ARC_MAINNET.demoPayroll;

    const fixedTargetDefs: Array<{ chainId: number; address: string; label: string }> = [
      { chainId: ARC_MAINNET.chainId, address: mainnetFactory, label: "mainnet factory" },
      { chainId: ARC_MAINNET.chainId, address: demoPayroll,    label: `mainnet payroll ${shortAddr(demoPayroll)}` },
      { chainId: ARC_TESTNET.chainId, address: testnetFactory, label: "testnet factory" },
      { chainId: ARC_TESTNET.chainId, address: testnetReference, label: "testnet reference payroll" },
    ];

    const sourcifyStatuses = await Promise.all(
      fixedTargetDefs.map(t => sourcifyStatus(t.chainId, t.address)),
    );

    const fixedTargets = fixedTargetDefs.map((t, i) => ({
      label: t.label,
      sourcify: sourcifyStatuses[i],
    }));

    const extraPayrolls = payrollAddrs
      .filter(p => p.toLowerCase() !== demoPayroll.toLowerCase())
      .map(p => ({ address: p, runtime: payrollRuntimes.get(p) ?? "0x" }));

    pushCheck(buildC3({ fixedTargets, extraPayrolls, testnetRefRuntime: trRuntime }));
  }

  // Typed PayrollCreated ABI entry for event-based creation block lookup.
  const factoryCreatedEntry = factoryAbi.find(
    e => e.type === "event" && e.name === "PayrollCreated",
  ) as AbiEvent;

  const ledgers: PayrollLedger[] = [];
  // Track which log source was actually used for history (first source that succeeds).
  let logSourceUsed: string | undefined;

  for (const payroll of payrollAddrs) {
    progress(`processing payroll ${payroll}`);

    // All per-payroll checks (C4..C8) carry the payroll address so mergeChecks
    // can group lines by payroll when multiple payrolls produce the same check id.
    function taggedCheck(c: import("./checks.js").CheckResult): import("./checks.js").CheckResult {
      return { ...c, payroll: getAddress(payroll) };
    }

    // C4: made by the factory.
    const isPayrollResult = await retry(
      () => mainnet.readContract({
        address: mainnetFactory,
        abi: factoryAbi,
        functionName: "isPayroll",
        args: [payroll],
        blockNumber: toBlock,
      }),
      "readContract(isPayroll)",
    );

    if (!isPayrollResult) {
      pushCheck(taggedCheck({
        id: "C4",
        title: "made by the factory",
        status: "FAIL",
        lines: [`${payroll}: isPayroll() returned false`],
      }));
      continue;
    }

    // Resolve creation block: one getLogs call when creationFromEvents is set,
    // otherwise a binary search over ~25 getCode calls (slow on Arc).
    let creationBlock: bigint;
    if (opts.creationFromEvents) {
      progress(`reading creation event for ${payroll}`);
      const evtClient = opts.logSources?.[0]?.client ?? mainnet;
      const evtChunk = opts.logSources?.[0]?.chunk ?? 10_000n;
      // PayrollCreated has payroll as an indexed topic; one call covers the whole
      // range because the factory was deployed recently relative to the chunk size.
      const { getLogsChunked } = await import("./history.js");
      const creationLogs = await getLogsChunked(
        evtClient,
        {
          address: mainnetFactory,
          event: factoryCreatedEntry,
          args: { payroll },
        },
        ARC_MAINNET.factoryBlock,
        toBlock,
        onProgress,
        1,
        evtChunk,
      );
      if (creationLogs.length === 0) {
        pushCheck(taggedCheck({
          id: "C4",
          title: "made by the factory",
          status: "FAIL",
          lines: [
            `${payroll}: isPayroll() = true but PayrollCreated event not found`,
          ],
        }));
        continue;
      }
      const bn = creationLogs[0].blockNumber;
      if (bn === null) {
        pushCheck(taggedCheck({
          id: "C4",
          title: "made by the factory",
          status: "FAIL",
          lines: [`${payroll}: PayrollCreated event has no blockNumber (pending log?)`],
        }));
        continue;
      }
      creationBlock = bn;
      pushCheck(taggedCheck({
        id: "C4",
        title: "made by the factory",
        status: "PASS",
        lines: [
          `${payroll}: isPayroll() = true, creation block ${creationBlock}`,
          `PayrollCreated event found: yes`,
        ],
      }));
    } else {
      progress(`finding creation block for ${payroll}`);
      creationBlock = await findCreationBlock(
        mainnet, payroll, ARC_MAINNET.factoryDeployBlock, toBlock, onProgress,
      );
      const creationLogs = await retry(
        () => mainnet.getLogs({
          address: mainnetFactory,
          event: factoryCreatedEntry,
          args: { payroll } as Record<string, unknown>,
          fromBlock: creationBlock,
          toBlock: creationBlock,
        }),
        "getLogs(PayrollCreated)",
      );
      const c4Lines = [
        `${payroll}: isPayroll() = true, creation block ${creationBlock}`,
        `PayrollCreated event found: ${creationLogs.length > 0 ? "yes" : "NO"}`,
      ];
      pushCheck(taggedCheck({
        id: "C4",
        title: "made by the factory",
        status: creationLogs.length > 0 ? "PASS" : "FAIL",
        lines: c4Lines,
      }));
      if (creationLogs.length === 0) continue;
    }

    // Fetch payroll history, trying each log source in order.
    // A non-rate-limit failure triggers the next source; a rate-limit error
    // stays within withRetry's back-off loop inside fetchPayrollHistory.
    progress(`fetching history for ${payroll}`);
    let history: PayrollHistory | null = null;
    const sources = opts.logSources ?? [{ name: "default", client: mainnet, chunk: 10_000n, parallel: 2 }];

    for (let si = 0; si < sources.length; si++) {
      const src = sources[si];
      try {
        history = await fetchPayrollHistory(
          src.client, payroll, creationBlock, toBlock, onProgress, src.parallel, src.chunk,
        );
        if (!logSourceUsed) logSourceUsed = src.name;
        break;
      } catch (err) {
        if (isRateLimit(err)) throw err;
        if (si < sources.length - 1) {
          progress(`${src.name} refused a log query, reading ${sources[si + 1].name}'s node instead`);
        } else {
          throw err;
        }
      }
    }

    if (!history) continue;

    // Read getState plus separate dueNow and nextUnpaid (getState in turn 08 contract has no dueNow/nextPayday fields).
    const [stateRaw, balanceBefore, balanceAfter, dueNow, nextUnpaidVal] = await Promise.all([
      retry(
        () => mainnet.readContract({
          address: payroll, abi: payrollAbi, functionName: "getState", blockNumber: toBlock,
        }),
        "readContract(getState)",
      ),
      retry(
        () => arc.readContract({
          address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf",
          args: [payroll], blockNumber: creationBlock - 1n,
        }),
        "readContract(balanceBefore)",
      ),
      retry(
        () => mainnet.readContract({
          address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf",
          args: [payroll], blockNumber: toBlock,
        }),
        "readContract(balanceAfter)",
      ),
      retry(
        () => mainnet.readContract({
          address: payroll, abi: payrollAbi, functionName: "dueNow", blockNumber: toBlock,
        }),
        "readContract(dueNow)",
      ),
      retry(
        () => mainnet.readContract({
          address: payroll, abi: payrollAbi, functionName: "nextUnpaid", blockNumber: toBlock,
        }),
        "readContract(nextUnpaid)",
      ),
    ]);

    // Compute next payday from startTime + nextUnpaid * periodLength.
    const startTime = BigInt(stateRaw.startTime);
    const periodLength = BigInt(stateRaw.periodLength);
    const nextPayday = startTime + nextUnpaidVal * periodLength;

    const parsedState = {
      employer: stateRaw.employer,
      payeeCount: stateRaw.payeeCount,
      tipPerRun: stateRaw.tipPerRun,
      periodLength,
      startTime,
      nextUnpaid: stateRaw.nextUnpaid,
      startedPeriods: stateRaw.startedPeriods,
      balance: stateRaw.balance,
      owed: stateRaw.owed,
      runway: stateRaw.runway,
      nextPayday,
      dueNow,
    };

    const stateForLedger = {
      employer: parsedState.employer,
      startTime: parsedState.startTime,
      periodLength: parsedState.periodLength,
    };

    const c5 = taggedCheck(checkC5(history, parsedState.nextUnpaid));
    const c6 = taggedCheck(checkC6(history));
    const c7 = taggedCheck(checkC7(history, balanceBefore, balanceAfter, stateForLedger));
    const ledgerSummary = summarizeLedger(history, balanceBefore, balanceAfter, stateForLedger);
    opts.onCheck?.(c5);
    opts.onCheck?.(c6);
    opts.onCheck?.(c7);
    // Fire onLedger before C8 so sections 2-4 can render without waiting for the C8 sim.
    opts.onLedger?.({ payroll: getAddress(payroll), ledger: ledgerSummary, history, employer: parsedState.employer });
    const payrollChecks: CheckResult[] = [c5, c6, c7];

    // C8: a second run is refused.
    //
    // Strategy: use the history's block timestamps (no extra RPC per candidate)
    // to find the most recent run after which the payroll was caught up.
    // A run at block B that paid period p is "caught up" when:
    //   p + 1 == floor((blockTimestamp(B) - startTime) / periodLength) + 1
    //   i.e. nextUnpaid == startedPeriods right after the run.
    //
    // We compute startedPeriods from block time directly, matching the contract.
    // If no run was ever caught up, and nothing is due now, simulate at the
    // latest block so there is always at least one check.
    progress(`checking C8 for ${payroll}`);
    const runs = history.events.filter(e => e.eventName === "PaydayRun");
    let c8: CheckResult;

    if (runs.length === 0) {
      c8 = taggedCheck({ id: "C8", title: "a second run is refused", status: "SKIP", lines: ["no paydays yet"] });
    } else {
      // Sort descending by block; find the newest caught-up run using only history data.
      const sortedRuns = [...runs].sort((a, b) => Number(b.blockNumber - a.blockNumber));
      // Capture as const so TypeScript knows it is non-null inside the nested function.
      const resolvedHistory = history;

      // Each PaydayRun has args.period (0-based) and the block's timestamp from history.
      // After the run, nextUnpaid = period + 1.  startedPeriods = floor((ts - startTime) / periodLength) + 1.
      // "caught up" means nextUnpaid == startedPeriods at the run's own block.
      function isCaughtUp(run: (typeof sortedRuns)[0]): boolean {
        if (run.eventName !== "PaydayRun") return false;
        const period = run.args.period as bigint;
        const nextUnpaid = period + 1n;
        const ts = resolvedHistory.blockTimes.get(run.blockNumber);
        if (ts === undefined || ts <= parsedState.startTime) return false;
        const sp = (ts - parsedState.startTime) / parsedState.periodLength + 1n;
        return nextUnpaid >= sp;
      }

      const caughtUpRun = sortedRuns.find(isCaughtUp) ?? null;

      // When no run left the payroll caught up, fall back to the snapshot block
      // if nothing is due now; otherwise SKIP.
      let testBlock: bigint | null = null;
      let testPeriod: bigint | null = null;

      if (caughtUpRun !== null && caughtUpRun.eventName === "PaydayRun") {
        testBlock = caughtUpRun.blockNumber;
        testPeriod = caughtUpRun.args.period as bigint;
      } else if (!parsedState.dueNow) {
        testBlock = toBlock;
        testPeriod = null;
      }

      if (testBlock === null) {
        c8 = taggedCheck({
          id: "C8", title: "a second run is refused", status: "SKIP",
          lines: ["Every run so far was followed by another owed payday, so there was no moment to test a second run."],
        });
      } else {
        const blockLabel = testBlock.toLocaleString("en-US");
        const periodLabel = testPeriod !== null
          ? `right after ${periodDisplayLabel(testPeriod)} was paid, at block ${blockLabel}`
          : `at the snapshot block (no payday was due), at block ${blockLabel}`;
        let testNothingDue = false;
        let c8Lines: string[];

        try {
          await retry(
            () => arc.simulateContract({
              address: payroll, abi: payrollAbi, functionName: "run",
              account: DEAD, blockNumber: testBlock,
            }),
            `simulateContract(run@${testBlock})`,
          );
          c8Lines = [`Tested ${periodLabel}: run() did NOT revert.`];
        } catch (err) {
          if (isNothingDue(err)) {
            testNothingDue = true;
            c8Lines = [`Tested ${periodLabel}: run() reverted NothingDue.`];
          } else if (isUnderfunded(err)) {
            c8Lines = [
              `Tested ${periodLabel}: run() reverted Underfunded (payroll had no funds at that block): owed ${formatUnits(parsedState.owed, 6)} USDC, balance ${formatUnits(parsedState.balance, 6)} USDC.`,
            ];
          } else {
            c8Lines = [`Tested ${periodLabel}: run() reverted with unexpected error: ${err instanceof Error ? err.message : String(err)}`];
          }
        }

        c8 = taggedCheck({
          id: "C8", title: "a second run is refused",
          status: testNothingDue ? "PASS" : "FAIL",
          lines: c8Lines,
        });
      }
    }

    opts.onCheck?.(c8);
    payrollChecks.push(c8);

    ledgers.push({
      payroll,
      history,
      state: parsedState,
      balanceBefore,
      balanceAfter,
      ledger: ledgerSummary,
      checks: payrollChecks,
    });
  }

  return { snapshotBlock: toBlock, snapshotTime, factory: mainnetFactory, checks: allChecks, ledgers, logSourceUsed };
}
