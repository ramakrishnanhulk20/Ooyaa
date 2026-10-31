/**
 * DraftPayroll: the form state for /new.
 * validateDraft runs before any signature and returns a list of field-level errors.
 * Everything here is pure -- no viem, no wagmi, no RPC.
 */
import { isAddress, getAddress } from 'viem';
import type { Address } from 'viem';
import { USDC_ADDRESS } from '../deployments.js';

// How long each period option is, in seconds.
export const PERIOD_OPTIONS = [
  { label: '2 minutes',  seconds: 120 },
  { label: '1 hour',     seconds: 3600 },
  { label: '1 day',      seconds: 86400 },
  { label: '1 week',     seconds: 604800 },
  { label: '2 weeks',    seconds: 1209600 },
  { label: '4 weeks',    seconds: 2419200 },
] as const;

export type FirstPaydayKind =
  | 'in_2m'
  | 'in_1h'
  | 'pick';

export type DraftPayee = {
  address: string;
  amountUsdc: string;
};

export type DraftPayroll = {
  payees: DraftPayee[];
  periodSeconds: number;
  firstPayday: FirstPaydayKind;
  /** UTC datetime string for 'pick', e.g. "2026-11-01T10:00" */
  pickDatetime: string;
  tipUsdc: string;
  fundPaydays: number;
  fundLater: boolean;
};

export const DEFAULT_DRAFT: DraftPayroll = {
  payees: [{ address: '', amountUsdc: '' }],
  periodSeconds: 120,
  firstPayday: 'in_2m',
  pickDatetime: '',
  tipUsdc: '0.01',
  fundPaydays: 5,
  fundLater: false,
};

export type DraftError =
  | { field: 'payee_address'; index: number; message: string }
  | { field: 'payee_amount'; index: number; message: string }
  | { field: 'period'; message: string }
  | { field: 'startTime'; message: string }
  | { field: 'tip'; message: string }
  | { field: 'fund'; message: string }
  | { field: 'general'; message: string };

const USDC_LOWER = USDC_ADDRESS.toLowerCase();
const MAX_AMOUNT_UNITS = 1_000_000_000_000n; // 1,000,000 USDC in 6-decimal units
const MAX_TIP_UNITS = 10_000_000n; // 10 USDC

/**
 * Parses a USDC decimal string into 6-decimal integer units.
 * Returns null if the string is not a valid non-negative number or has more than 6 decimal places.
 */
export function parseUsdcInput(s: string): bigint | null {
  const trimmed = s.trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return null;
  const [intPart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > 6) return null;
  const padded = fracPart.padEnd(6, '0');
  return BigInt(intPart) * 1_000_000n + BigInt(padded);
}

/**
 * Computes the total USDC needed for a given number of paydays, in 6-decimal units.
 * Returns null when the draft has no valid payees.
 */
export function fundAmount(draft: DraftPayroll, paydays: number): bigint | null {
  let total = 0n;
  const tipUnits = parseUsdcInput(draft.tipUsdc) ?? 0n;
  let hasAny = false;
  for (const p of draft.payees) {
    const u = parseUsdcInput(p.amountUsdc);
    if (u !== null && u > 0n) {
      total += u;
      hasAny = true;
    }
  }
  if (!hasAny) return null;
  return (total + tipUnits) * BigInt(paydays);
}

/**
 * Validates the draft and returns all field-level errors.
 * chainNow is the current block.timestamp (seconds). The start-time bounds
 * are checked against it, not the browser clock, so the caller must supply
 * it from an RPC call or 0n to skip start-time validation.
 */
export function validateDraft(draft: DraftPayroll, chainNow: bigint): DraftError[] {
  const errors: DraftError[] = [];

  if (draft.payees.length === 0) {
    errors.push({ field: 'general', message: 'Add at least one payee.' });
    return errors;
  }
  if (draft.payees.length > 100) {
    errors.push({ field: 'general', message: 'At most 100 payees.' });
  }

  // Track seen checksummed addresses to detect duplicates.
  const seen = new Map<string, number>();

  for (let i = 0; i < draft.payees.length; i++) {
    const p = draft.payees[i];
    const addrRaw = p.address.trim();

    if (!addrRaw || !isAddress(addrRaw)) {
      errors.push({ field: 'payee_address', index: i, message: 'Not an address' });
    } else {
      const cs = getAddress(addrRaw);
      if (cs.toLowerCase() === USDC_LOWER) {
        errors.push({ field: 'payee_address', index: i, message: 'Cannot be the USDC contract' });
      } else {
        const prev = seen.get(cs);
        if (prev !== undefined) {
          // Mark both the earlier row and the current one.
          errors.push({ field: 'payee_address', index: prev, message: `${cs.slice(0, 6)}...${cs.slice(-4)} is listed twice` });
          errors.push({ field: 'payee_address', index: i, message: `${cs.slice(0, 6)}...${cs.slice(-4)} is listed twice` });
        }
        seen.set(cs, i);
      }
    }

    const amountRaw = p.amountUsdc.trim();
    if (!amountRaw) {
      errors.push({ field: 'payee_amount', index: i, message: 'Above 0, at most 1,000,000' });
    } else {
      const units = parseUsdcInput(amountRaw);
      if (units === null) {
        // Non-numeric or too many decimals.
        if (/\.\d{7,}/.test(amountRaw)) {
          errors.push({ field: 'payee_amount', index: i, message: 'At most 6 decimals' });
        } else {
          errors.push({ field: 'payee_amount', index: i, message: 'Above 0, at most 1,000,000' });
        }
      } else if (units <= 0n) {
        errors.push({ field: 'payee_amount', index: i, message: 'Above 0, at most 1,000,000' });
      } else if (units > MAX_AMOUNT_UNITS) {
        errors.push({ field: 'payee_amount', index: i, message: 'Above 0, at most 1,000,000' });
      }
    }
  }

  // Period: already validated by the segmented control selection.
  const pOpt = PERIOD_OPTIONS.find(o => o.seconds === draft.periodSeconds);
  if (!pOpt) {
    errors.push({ field: 'period', message: 'Pick a pay period from 1 minute to 366 days.' });
  }

  // Start time (skip validation when chainNow is 0 -- caller passed 0 to skip).
  if (chainNow > 0n) {
    const startTs = computeStartTime(draft, chainNow);
    if (startTs === null) {
      errors.push({ field: 'startTime', message: 'The first payday must be in the future. Pick a later time.' });
    } else {
      const minStart = chainNow;
      const maxStart = chainNow + 365n * 86400n;
      if (startTs < minStart) {
        errors.push({ field: 'startTime', message: 'The first payday must be in the future. Pick a later time.' });
      } else if (startTs > maxStart) {
        errors.push({ field: 'startTime', message: 'The first payday must be within 365 days.' });
      }
    }
  }

  // Tip.
  const tipRaw = draft.tipUsdc.trim();
  if (tipRaw === '') {
    errors.push({ field: 'tip', message: 'Enter 0 for no tip, or up to 10 USDC.' });
  } else {
    const tipUnits = parseUsdcInput(tipRaw);
    if (tipUnits === null) {
      errors.push({ field: 'tip', message: 'Enter 0 for no tip, or up to 10 USDC.' });
    } else if (tipUnits < 0n) {
      errors.push({ field: 'tip', message: 'Enter 0 for no tip, or up to 10 USDC.' });
    } else if (tipUnits > MAX_TIP_UNITS) {
      errors.push({ field: 'tip', message: 'The tip can be at most 10 USDC.' });
    }
  }

  // Fund paydays (only when fundLater is false).
  if (!draft.fundLater) {
    if (!Number.isInteger(draft.fundPaydays) || draft.fundPaydays < 1) {
      errors.push({ field: 'fund', message: 'Fund more than 0.' });
    }
  }

  return errors;
}

/**
 * Computes the startTime (Unix seconds) from the draft and the current chain timestamp.
 * Returns null when 'pick' mode has an invalid or past datetime string.
 */
export function computeStartTime(draft: DraftPayroll, chainNow: bigint): bigint | null {
  if (draft.firstPayday === 'in_2m') {
    return chainNow + 120n;
  }
  if (draft.firstPayday === 'in_1h') {
    return chainNow + 3600n;
  }
  // 'pick': parse the UTC datetime-local string.
  const s = draft.pickDatetime.trim();
  if (!s) return null;
  // datetime-local value is in local time by default; we read it as UTC.
  const ms = Date.parse(s + 'Z');
  if (isNaN(ms)) return null;
  return BigInt(Math.floor(ms / 1000));
}

/** Builds the on-chain argument arrays from a valid draft. */
export function draftToArgs(draft: DraftPayroll, chainNow: bigint): {
  payees: Address[];
  amounts: bigint[];
  startTime: bigint;
  periodLength: bigint;
  tipPerRun: bigint;
} {
  const payees: Address[] = draft.payees.map(p => getAddress(p.address.trim()));
  const amounts: bigint[] = draft.payees.map(p => parseUsdcInput(p.amountUsdc)!);
  const startTime = computeStartTime(draft, chainNow) ?? chainNow + 120n;
  const periodLength = BigInt(draft.periodSeconds);
  const tipPerRun = parseUsdcInput(draft.tipUsdc) ?? 0n;
  return { payees, amounts, startTime, periodLength, tipPerRun };
}

const DRAFT_KEY = 'ooyaa:draft:v1';

export function loadDraft(): DraftPayroll {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return DEFAULT_DRAFT;
    return JSON.parse(raw) as DraftPayroll;
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function saveDraft(draft: DraftPayroll): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage unavailable (private mode, storage full) -- silently ignore.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Silently ignore.
  }
}
