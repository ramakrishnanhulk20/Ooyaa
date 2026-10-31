import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { payrollAbi, factoryAbi } from "./abi.js";

function loadArtifactAbi(name: string): unknown[] | null {
  const path = `contracts/out/${name}.sol/${name}.json`;
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { abi: unknown[] };
  return raw.abi;
}

describe("abi.ts matches artifacts", () => {
  test("payrollAbi deep-equals the artifact", () => {
    const artifact = loadArtifactAbi("Payroll");
    if (!artifact) {
      throw new Error("run bun run contracts:build first (Payroll.json missing)");
    }
    expect(JSON.parse(JSON.stringify(payrollAbi))).toEqual(artifact);
  });

  test("factoryAbi deep-equals the artifact", () => {
    const artifact = loadArtifactAbi("PaydayFactory");
    if (!artifact) {
      throw new Error("run bun run contracts:build first (PaydayFactory.json missing)");
    }
    expect(JSON.parse(JSON.stringify(factoryAbi))).toEqual(artifact);
  });
});
