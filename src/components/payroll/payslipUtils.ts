/**
 * Pure utilities for the payslip list sections.
 * No React, no viem client calls: safe to import in tests.
 */
import type { LedgerRow } from '../../proof/rows.js';
import { periodDisplayLabel } from '../../payroll/format.js';
import type { Address } from 'viem';

/** Returns rows where `to` matches the given payee (case-insensitive). */
export function filterPayeeRows(rows: LedgerRow[], payee: Address): LedgerRow[] {
  const lower = payee.toLowerCase();
  return rows.filter(r => r.to.toLowerCase() === lower);
}

function fmtUtc(ts: bigint | undefined): string {
  if (ts === undefined) return '';
  const d = new Date(Number(ts) * 1000);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${h}:${m} UTC, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Builds a CSV of payslip rows for a specific payee.
 * Two columns for the period: period_index (0-based contract value) and
 * period_label (1-based display number, "Period 0038" for index 37).
 * "Period 0038 is contract period index 37." See docs.
 */
export function buildPayeeCsv(rows: LedgerRow[], payroll: Address): string {
  const header = 'when_utc,period_index,period_label,amount_usdc,tx,payroll';
  const lines = [header];
  for (const r of rows) {
    const when = fmtUtc(r.time);
    const periodIndex = r.period !== undefined ? r.period.toString() : '';
    const periodLabel = r.period !== undefined ? periodDisplayLabel(r.period) : '';
    const amount = (Number(r.amount) / 1_000_000).toFixed(6);
    lines.push(`"${when}","${periodIndex}","${periodLabel}","${amount}","${r.txHash}","${payroll}"`);
  }
  return lines.join('\n');
}

/**
 * Builds a CSV of all ledger rows for the "Every payslip" download.
 * Two columns for the period: period_index (0-based contract value) and
 * period_label (1-based display number). "Period 0038 is contract period index 37."
 */
export function buildAllCsv(rows: LedgerRow[]): string {
  const header = 'when_utc,block,kind,period_index,period_label,from,to,direction,amount_usdc,tx,payroll';
  const lines = [header];
  for (const r of rows) {
    const when = fmtUtc(r.time);
    const block = r.blockNumber.toString();
    const periodIndex = r.period !== undefined ? r.period.toString() : '';
    const periodLabel = r.period !== undefined ? periodDisplayLabel(r.period) : '';
    const amount = (Number(r.amount) / 1_000_000).toFixed(6);
    lines.push(`"${when}","${block}","${r.kind}","${periodIndex}","${periodLabel}","${r.from}","${r.to}","${r.direction}","${amount}","${r.txHash}","${r.payroll}"`);
  }
  return lines.join('\n');
}

/** Triggers a browser file download with the given CSV content. */
export function downloadCsvFile(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
