import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";

describe("reviewRepository capability gating", () => {
  let repo: string;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "inspector-core-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  const marker = () => join(repo, "EXECUTED");

  it("refuses to execute validation commands when the caller does not grant it", async () => {
    // Default-deny: an adapter that forgets to pass the capability gets
    // read-only inspection rather than silent shell execution.
    const result = await reviewRepository({
      repositoryPath: repo,
      validationCommands: [`touch ${marker()}`],
    });
    expect(result.validationResults).toEqual([]);
    expect(existsSync(marker())).toBe(false);
  });

  it("executes validation commands when the caller grants the capability", async () => {
    const result = await reviewRepository(
      { repositoryPath: repo, validationCommands: [`touch ${marker()}`] },
      { allowValidation: true },
    );
    expect(result.validationResults).toHaveLength(1);
    expect(result.validationResults[0].status).toBe("passed");
    expect(existsSync(marker())).toBe(true);
    rmSync(marker(), { force: true });
  });
});
