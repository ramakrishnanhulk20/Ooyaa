import { createPublicClient, http, formatUnits, isAddress } from "viem";
import { arc, arcTestnet } from "viem/chains";
import type { Address, Hex } from "viem";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { prove } from "../src/proof/prove.js";
import type { ProofReport, PayrollLedger } from "../src/proof/prove.js";
import { ARC_MAINNET, ARC_TESTNET } from "../src/deployments.js";

const MAINNET_RPC = "https://rpc.mainnet.arc.io";
const TESTNET_RPC = "https://rpc.testnet.arc.io";

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function fmtUsdc(v: bigint): string {
  return formatUnits(v, 6) + " USDC";
}

function utcIso(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString();
}

function parseCli(): { payrolls: Address[]; jsonPath: string | null; rpcUrl: string } {
  const args = process.argv.slice(2);
  const payrolls: Address[] = [];
  let jsonPath: string | null = null;
  let rpcUrl = MAINNET_RPC;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--payroll" && args[i + 1]) {
      const val = args[++i];
      if (!isAddress(val)) {
        process.stderr.write(`error: not an address: ${val}\n`);
        process.exit(2);
      }
      payrolls.push(val);
    } else if (args[i] === "--json" && args[i + 1]) {
      jsonPath = args[++i];
    } else if (args[i] === "--rpc" && args[i + 1]) {
      rpcUrl = args[++i];
    }
  }
  return { payrolls, jsonPath, rpcUrl };
}

function readLocalArtifact(name: string): string | null {
  const path = `contracts/out/${name}.sol/${name}.json`;
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      deployedBytecode?: { object?: string };
    };
    return raw?.deployedBytecode?.object ?? null;
  } catch {
    return null;
  }
}

function printCheck(line: string) {
  process.stdout.write(line + "\n");
}

function fmtCheck(status: string, id: string, title: string, detail = ""): string {
  const padded = status.length < 4 ? status + " ".repeat(4 - status.length) : status;
  return `${padded}  ${id} ${title}${detail ? ": " + detail : ""}`;
}

function printLedger(ledger: PayrollLedger, explorerBase: string) {
  const { history, state } = ledger;

  // All event narrowing is via typed eventName discriminants from payrollAbi.
  type RunEvent = { eventName: "PaydayRun"; args: { period: bigint; runner: Address; paid: bigint; deferred: bigint; tip: bigint }; transactionHash: Hex; blockNumber: bigint; logIndex: number };
  const runs = (history.events.filter(e => e.eventName === "PaydayRun") as unknown as RunEvent[])
    .sort((a, b) => Number(a.args.period - b.args.period));

  printCheck("");
  printCheck(`Payroll: ${ledger.payroll}`);
  printCheck(`  employer:     ${state.employer}`);
  printCheck(`  payee count:  ${state.payeeCount}`);
  printCheck(`  tip:          ${fmtUsdc(state.tipPerRun)}`);
  printCheck(`  period:       ${state.periodLength}s`);

  const recent = runs.slice(-20);
  const earlier = runs.length - recent.length;

  if (recent.length > 0) {
    printCheck("");
    printCheck("  Paydays (most recent 20):");
    printCheck("  period  paid at (UTC)             late(s)   runner     paid          deferred   tip       tx");
    for (const run of recent) {
      const ts = history.blockTimes.get(run.blockNumber);
      const periodStart = state.startTime + run.args.period * state.periodLength;
      const lateSec = ts !== undefined ? ts - periodStart : 0n;
      const paidAt = ts !== undefined ? utcIso(ts) : "unknown";
      printCheck(
        `  ${String(run.args.period).padEnd(7)} ${paidAt.slice(0, 23).padEnd(25)} ${String(lateSec).padEnd(9)} ${shortAddr(run.args.runner).padEnd(11)} ${fmtUsdc(run.args.paid).padEnd(13)} ${fmtUsdc(run.args.deferred).padEnd(10)} ${fmtUsdc(run.args.tip).padEnd(9)} ${run.transactionHash.slice(0, 10)}...`,
      );
    }
    if (earlier > 0) printCheck(`  (${earlier} earlier payday(s) in the JSON report)`);

    printCheck("");
    printCheck("  Explorer links (10 most recent):");
    for (const run of runs.slice(-10).reverse()) {
      printCheck(`    period ${run.args.period}: ${explorerBase}/tx/${run.transactionHash}`);
    }
  }

  const t = ledger.ledger.totals;
  printCheck("");
  printCheck("  Totals:");
  printCheck(`    paydays:    ${t.runCount}`);
  printCheck(`    payslips:   ${t.payslipCount}`);
  printCheck(`    paid:       ${fmtUsdc(t.totalPaid)}`);
  printCheck(`    tips:       ${fmtUsdc(t.totalTips)}`);
  printCheck(`    deferred:   ${fmtUsdc(t.totalDeferred)}`);
  printCheck(`    claimed:    ${fmtUsdc(t.totalClaimed)}`);
  printCheck(`    funded:     ${fmtUsdc(t.totalFunded)}`);
  printCheck(`    withdrawn:  ${fmtUsdc(t.totalWithdrawn)}`);
  printCheck(`    direct deposits: ${fmtUsdc(t.directDeposits)}`);

  printCheck("");
  printCheck("  State at snapshot:");
  printCheck(`    balance:    ${fmtUsdc(state.balance)}`);
  printCheck(`    owed:       ${fmtUsdc(state.owed)}`);
  printCheck(`    runway:     ${state.runway} period(s)`);
  if (state.dueNow) {
    // One or more periods are already past due.
    printCheck(`    oldest unpaid payday due: ${utcIso(state.nextPayday)}`);
  } else {
    printCheck(`    next payday: ${state.nextPayday > 0n ? utcIso(state.nextPayday) : "n/a"}`);
  }

  printCheck("");
  printCheck("  Distinct wallets:");
  printCheck(`    runners:         ${ledger.ledger.runners.length}`);
  printCheck(`    outside runners: ${ledger.ledger.outsideRunners.length}`);
  printCheck(`    payees paid:     ${ledger.ledger.payeesPaid.length}`);
  printCheck(`    funders:         ${ledger.ledger.funders.length}`);
  printCheck(`    all USDC:        ${ledger.ledger.allWallets.length}`);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}

async function main() {
  const { payrolls, jsonPath, rpcUrl } = parseCli();

  // retryCount and retryDelay give viem's transport built-in retries before
  // withRetry's exponential backoff kicks in for rate-limit errors specifically.
  const mainnetClient = createPublicClient({ chain: arc, transport: http(rpcUrl, { retryCount: 6, retryDelay: 1000 }) });
  const testnetClient = createPublicClient({ chain: arcTestnet, transport: http(TESTNET_RPC, { retryCount: 6, retryDelay: 1000 }) });

  const mainnetChainId = await mainnetClient.getChainId().catch(() => 0);
  if (mainnetChainId !== ARC_MAINNET.chainId) {
    process.stderr.write(`error: mainnet RPC returned chain ${mainnetChainId}, expected ${ARC_MAINNET.chainId}\n`);
    process.exit(2);
  }
  const testnetChainId = await testnetClient.getChainId().catch(() => 0);
  if (testnetChainId !== ARC_TESTNET.chainId) {
    process.stderr.write(`error: testnet RPC returned chain ${testnetChainId}, expected ${ARC_TESTNET.chainId}\n`);
    process.exit(2);
  }

  const factoryRuntime = readLocalArtifact("PaydayFactory");
  const payrollRuntime = readLocalArtifact("Payroll");
  const localRuntime =
    factoryRuntime && payrollRuntime
      ? { factory: factoryRuntime as Hex, payroll: payrollRuntime as Hex }
      : undefined;

  const report: ProofReport = await prove({
    mainnet: mainnetClient,
    testnet: testnetClient,
    payrolls: payrolls.length > 0 ? payrolls : undefined,
    localRuntime,
    onProgress: msg => process.stderr.write(msg + "\n"),
  });

  process.stdout.write("Ooyaa prove-it\n");
  process.stdout.write(
    `Network: Arc Mainnet (chain ${ARC_MAINNET.chainId}), snapshot block ${report.snapshotBlock} (${utcIso(report.snapshotTime)})\n`,
  );
  process.stdout.write(`Factory: ${report.factory}  ${ARC_MAINNET.explorer}/address/${report.factory}\n`);
  process.stdout.write("\n");

  const allChecks = [...report.checks, ...report.ledgers.flatMap(l => l.checks)];

  for (const c of allChecks) {
    printCheck(fmtCheck(c.status, c.id, c.title));
    for (const line of c.lines) printCheck("    " + line);
  }

  for (const ledger of report.ledgers) {
    printLedger(ledger, ARC_MAINNET.explorer);
  }

  if (report.ledgers.length > 1) {
    const totalPaydays = report.ledgers.reduce((s, l) => s + l.ledger.totals.runCount, 0);
    const totalPaid = report.ledgers.reduce((s, l) => s + l.ledger.totals.totalPaid, 0n);
    printCheck("");
    printCheck(`Grand totals: ${report.ledgers.length} payrolls, ${totalPaydays} paydays, ${fmtUsdc(totalPaid)} paid`);
  }

  const passed = allChecks.filter(c => c.status === "PASS").length;
  const failed = allChecks.filter(c => c.status === "FAIL").length;
  const skipped = allChecks.filter(c => c.status === "SKIP").length;
  printCheck("");
  printCheck(`RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(report, bigintReplacer, 2));
    process.stderr.write(`report written to ${jsonPath}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  process.stderr.write("fatal: " + (err instanceof Error ? err.message : String(err)) + "\n");
  process.exit(1);
});
