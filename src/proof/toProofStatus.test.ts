import { test, expect, describe } from "bun:test";
import { toProofStatus } from "./useProofReport.js";

describe("toProofStatus", () => {
  test("('pending', 'idle') maps to 'loading'", () => {
    expect(toProofStatus("pending", "idle")).toBe("loading");
  });

  test("('success', 'idle') maps to 'success'", () => {
    expect(toProofStatus("success", "idle")).toBe("success");
  });

  test("('error', 'idle') maps to 'error'", () => {
    expect(toProofStatus("error", "idle")).toBe("error");
  });

  // TanStack Query v5 keeps status 'success' while refetching.
  test("('success', 'fetching') maps to 'loading'", () => {
    expect(toProofStatus("success", "fetching")).toBe("loading");
  });

  test("('pending', 'fetching') maps to 'loading'", () => {
    expect(toProofStatus("pending", "fetching")).toBe("loading");
  });
});
