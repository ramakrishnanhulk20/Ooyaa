import { test, expect, describe } from "bun:test";
import { toProofStatus } from "./useProofReport.js";

describe("toProofStatus", () => {
  test("'pending' maps to 'loading'", () => {
    expect(toProofStatus("pending")).toBe("loading");
  });

  test("'success' maps to 'success'", () => {
    expect(toProofStatus("success")).toBe("success");
  });

  test("'error' maps to 'error'", () => {
    expect(toProofStatus("error")).toBe("error");
  });
});
