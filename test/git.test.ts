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

  it("reports paths that git would quote (non-ASCII, spaces) verbatim", () => {
    // Regression: git C-escapes any path with non-ASCII bytes, a space, a quote
    // or a backslash ("café.txt" -> "\"caf\\303\\251.txt\""). Parsing the
    // human-readable output returned a literal-backslash path matching no file
    // on disk. Both code paths now read NUL-separated (-z) output instead.
    const unicode = "café.txt";
    const spaced = "plain space.txt";
    writeFileSync(join(repo, unicode), "x\n");
    writeFileSync(join(repo, spaced), "x\n");

    const uncommitted = changedFiles(repo).map((f) => f.path);
    expect(uncommitted).toContain(unicode);
    expect(uncommitted).toContain(spaced);
    expect(uncommitted.some((p) => p.includes("\\"))).toBe(false);

    // Same guarantee on the --base-ref (diff --name-status) path.
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-qm", "add awkward names", "--no-gpg-sign"]);
    const committed = changedFiles(repo, "HEAD~1").map((f) => f.path);
    expect(committed).toContain(unicode);
    expect(committed).toContain(spaced);
    expect(committed.some((p) => p.startsWith('"'))).toBe(false);
  });

  it("reports a staged-then-deleted file as deleted", () => {
    // Composite porcelain state "AD": staged add, deleted in the worktree. The
    // file is not on disk, so "deleted" is the honest status.
    const doomed = "doomed.txt";
    writeFileSync(join(repo, doomed), "x\n");
    git(repo, ["add", doomed]);
    rmSync(join(repo, doomed));
    const entry = changedFiles(repo).find((f) => f.path === doomed);
    expect(entry?.status).toBe("deleted");
  });
});
