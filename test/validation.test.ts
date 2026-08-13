import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runValidation } from "../src/validation.js";

describe("runValidation", () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), "inspector-val-"));
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it("marks a passing command as passed and captures stdout", async () => {
    const result = await runValidation("echo hello-world", cwd);
    expect(result.status).toBe("passed");
    expect(result.output).toContain("hello-world");
  });

  it("records a non-zero exit as failed instead of throwing", async () => {
    // Regression: a failing validation must NOT crash the run or suppress output.
    const result = await runValidation("echo boom && exit 3", cwd);
    expect(result.status).toBe("failed");
    expect(result.output).toContain("boom");
  });

  it("times out a hanging command and marks it failed", async () => {
    const result = await runValidation("sleep 10", cwd, { timeoutMs: 200 });
    expect(result.status).toBe("failed");
    expect(result.output).toContain("timed out");
  });
});
