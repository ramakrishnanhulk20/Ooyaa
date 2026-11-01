/**
 * Single source of truth for "is this wallet ours?"
 * A wallet is ours when it is the employer, a payee ever named by the payroll,
 * or one of the team's own test wallets. Everything else is outside.
 */
import type { Ledger } from "./checks.js";
import { ARC_MAINNET } from "../deployments.js";

export const TEAM_WALLET_SET = new Set(
  ARC_MAINNET.teamWallets.map(a => a.toLowerCase()),
);

/**
 * Returns true when `address` is "ours" given the computed ledger for a payroll.
 * Comparison is case-insensitive.
 */
export function isOurWallet(address: string, ledger: Ledger): boolean {
  const low = address.toLowerCase();
  if (TEAM_WALLET_SET.has(low)) return true;
  // A runner that is NOT in outsideRunners is already employer or payee.
  const outsideSet = new Set(ledger.outsideRunners.map(a => a.toLowerCase()));
  const isRunner = ledger.runners.some(a => a.toLowerCase() === low);
  if (isRunner && !outsideSet.has(low)) return true;
  // Non-runner payees (e.g. a payee who never ran).
  if (ledger.payeesPaid.some(a => a.toLowerCase() === low)) return true;
  return false;
}
