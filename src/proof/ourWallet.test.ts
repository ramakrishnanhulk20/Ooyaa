import { test, expect } from "bun:test";
import { isOurWallet } from "./ourWallet.js";
import type { Ledger } from "./checks.js";
import type { Address } from "viem";

const PAYROLL = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const EMPLOYER = "0x1111111111111111111111111111111111111111" as Address;
const PAYEE = "0x2222222222222222222222222222222222222222" as Address;
const OUTSIDE = "0x3333333333333333333333333333333333333333" as Address;
// The team wallet from ARC_MAINNET.teamWallets (lower-case for comparison).
const TEAM = "0x209ac4703eadcfdee399e4542c81394366b4b9a6" as Address;
const TEAM_CHECKSUMMED = "0x209AC4703EaDcfDee399E4542c81394366b4b9a6" as Address;

function makeLedger(outsideRunners: Address[] = [OUTSIDE]): Ledger {
  return {
    payroll: PAYROLL,
    totals: {
      totalFunded: 0n, totalOut: 0n, totalIn: 0n, directDeposits: 0n,
      totalPaid: 0n, totalDeferred: 0n, totalTips: 0n, totalClaimed: 0n,
      totalWithdrawn: 0n, runCount: 0, payslipCount: 0,
    },
    outsideRunners,
    runners: [EMPLOYER, PAYEE, OUTSIDE, TEAM_CHECKSUMMED],
    payeesPaid: [PAYEE],
    funders: [],
    allWallets: [EMPLOYER, PAYEE, OUTSIDE, TEAM_CHECKSUMMED],
  };
}

test("employer runner counts as ours", () => {
  const ledger = makeLedger([OUTSIDE]);
  expect(isOurWallet(EMPLOYER, ledger)).toBe(true);
});

test("payee counts as ours", () => {
  const ledger = makeLedger([OUTSIDE]);
  expect(isOurWallet(PAYEE, ledger)).toBe(true);
});

test("outside runner is not ours", () => {
  const ledger = makeLedger([OUTSIDE]);
  expect(isOurWallet(OUTSIDE, ledger)).toBe(false);
});

test("team wallet address counts as ours (checksummed)", () => {
  const ledger = makeLedger([OUTSIDE, TEAM_CHECKSUMMED]);
  // Even though TEAM is in outsideRunners in the raw ledger, isOurWallet overrides.
  expect(isOurWallet(TEAM_CHECKSUMMED, ledger)).toBe(true);
});

test("team wallet address counts as ours (lower-case, case-insensitive)", () => {
  const ledger = makeLedger([OUTSIDE, TEAM_CHECKSUMMED]);
  expect(isOurWallet(TEAM, ledger)).toBe(true);
});
