import { formatUnits } from 'viem';

/** Truncates a hex address to "0x1234...abcd" form. */
export function shortAddress(a: string): string {
  if (a.length < 10) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/** Formats a USDC amount (6-decimal integer) with no trailing zeros, plus " USDC". */
export function formatUsdc(units: bigint): string {
  const s = formatUnits(units, 6);
  // Remove trailing zeros after the decimal point, then trailing dot.
  const trimmed = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${trimmed} USDC`;
}

/**
 * Formats a countdown in seconds.
 * Under an hour: "12:34" (mm:ss, zero-padded).
 * An hour or more: "1h 02m".
 */
export function countdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Formats a period number as "PAYSLIP, PERIOD 0001" (1-indexed, zero-padded to 4 digits). */
export function periodLabel(n: number): string {
  return `PAYSLIP, PERIOD ${String(n).padStart(4, '0')}`;
}

/**
 * Human-readable period label from a 0-based contract period index.
 * index 37 -> "Period 0038"
 * Used in running text (title case). For Plex Mono labels use periodLabel().
 * "Period N" is contract period index N-1.
 */
export function periodDisplayLabel(index: bigint): string {
  return `Period ${String(Number(index) + 1).padStart(4, '0')}`;
}

/**
 * Unix timestamp at which period `index` became payable.
 * Per the contract: period i is due at startTime + i * periodLength.
 * (startedPeriods = floor((now - startTime) / periodLength) + 1, so period 0
 * is the first period and is due at startTime.)
 */
export function periodDueTime(index: bigint, startTime: bigint, periodLength: bigint): bigint {
  return startTime + index * periodLength;
}

/**
 * Human-readable cadence from periodLength (seconds).
 * 3600 -> "every hour", 86400 -> "every day", 604800 -> "every week".
 * Otherwise "every N minutes/hours/days".
 */
export function cadence(periodLength: bigint): string {
  const s = Number(periodLength);
  if (s === 3600) return 'every hour';
  if (s === 86400) return 'every day';
  if (s === 604800) return 'every week';
  if (s % 86400 === 0) return `every ${s / 86400} days`;
  if (s % 3600 === 0) return `every ${s / 3600} hours`;
  if (s % 60 === 0) return `every ${s / 60} minutes`;
  return `every ${s} seconds`;
}

/**
 * Formats a Unix timestamp as a UTC time string.
 * Same UTC day as nowChain: "10:00 UTC".
 * Different UTC day: "10:00 UTC, 28 Oct".
 */
export function utcTime(ts: bigint, nowChain: bigint): string {
  const d = new Date(Number(ts) * 1000);
  const now = new Date(Number(nowChain) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm} UTC`;
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  if (sameDay) return timeStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${timeStr}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
