import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedFiles } from "../src/git.js";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

describe("changedFiles", () => {
  let repo: string;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "inspector-git-"));
    git(repo, ["init", "-q", "-b", "main"]);
    git(repo, ["config", "user.email", "t@t"]);
    git(repo, ["config", "user.name", "t"]);
    writeFileSync(join(repo, "base.txt"), "base\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-qm", "init", "--no-gpg-sign"]);
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("surfaces uncommitted working-tree changes when no base ref is given", () => {
    // Regression: the original tool used `main...HEAD` and reported NOTHING for
    // uncommitted changes — the most common interactive case.
    writeFileSync(join(repo, "base.txt"), "base modified\n");
    writeFileSync(join(repo, "brand-new.txt"), "new\n");
    const files = changedFiles(repo);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.status]));
    expect(byPath["base.txt"]).toBe("modified");
    expect(byPath["brand-new.txt"]).toBe("untracked");
  });

  it("throws a clear error when the base ref does not exist", () => {
    expect(() => changedFiles(repo, "does-not-exist")).toThrow(/not be? found|not found/i);
  });
});
