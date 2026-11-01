/**
 * mergeChecks: collapses multiple per-payroll CheckResults into one row per
 * check id, in canonical C1..C8 order.
 *
 * prove() fires one C4..C8 result per payroll. When two payrolls both have
 * C8, mergeChecks returns a single C8 row whose status is FAIL if any payroll
 * FAILs, PASS if at least one PASSes, or SKIP when all are SKIP.
 *
 * When a check id has results from more than one payroll, the first line of
 * each payroll's group is prefixed with the short payroll address and a colon,
 * unless that line already starts with "0x".
 */

import type { CheckResult, CheckStatus } from "./checks.js";
import type { Address } from "viem";

export const CHECK_ORDER = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"] as const;

function shortAddr(addr: Address): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function mergeStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("PASS")) return "PASS";
  return "SKIP";
}

/**
 * Returns one CheckResult per id (only for ids present in results), in C1..C8
 * order.
 */
export function mergeChecks(results: CheckResult[]): CheckResult[] {
  const byId = new Map<string, CheckResult[]>();
  for (const r of results) {
    const arr = byId.get(r.id) ?? [];
    arr.push(r);
    byId.set(r.id, arr);
  }

  const merged: CheckResult[] = [];
  for (const id of CHECK_ORDER) {
    const group = byId.get(id);
    if (!group) continue;

    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // Multiple results for the same id: prefix each group's lines with the
    // payroll address when the payroll is known and the line doesn't already
    // start with "0x".
    const combinedLines: string[] = [];
    for (const r of group) {
      const prefix = r.payroll && !r.lines[0]?.startsWith("0x")
        ? `${shortAddr(r.payroll)}: `
        : "";
      for (let i = 0; i < r.lines.length; i++) {
        combinedLines.push(i === 0 ? `${prefix}${r.lines[i]}` : r.lines[i]);
      }
    }

    merged.push({
      id,
      title: group[0].title,
      status: mergeStatus(group.map(r => r.status)),
      lines: combinedLines,
      payroll: undefined,
    });
  }
  return merged;
}

/**
 * True when mergeChecks(checks) has all 8 ids and every merged row is PASS.
 * A SKIP on any payroll propagates as SKIP in the merged row, so a real
 * SKIP makes the proof unverifiable and isVerified returns false. This is
 * intentional: "verified" means all eight checks passed with no caveats.
 */
export function isVerified(checks: CheckResult[]): boolean {
  const merged = mergeChecks(checks);
  if (merged.length !== CHECK_ORDER.length) return false;
  return merged.every(c => c.status === "PASS");
}
