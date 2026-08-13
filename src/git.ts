import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

// Raw variant: does NOT trim. Porcelain status is column-sensitive (the two
// leading status columns can be spaces), so trimming would corrupt the parse.
function gitRaw(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  });
}

function statusFromCode(code: string): ChangedFile["status"] {
  const c = code[0];
  if (c === "A") return "added";
  if (c === "D") return "deleted";
  if (c === "?") return "untracked";
  // R (renamed), C (copied), M (modified), T (type-change) all surface as modified.
  return "modified";
}

/**
 * Resolve the set of changed files.
 *
 * - With `baseRef`: three-dot diff `base...HEAD` — the changes introduced on the
 *   current branch since it diverged from `base` (the PR-review semantic).
 * - Without `baseRef`: the developer's *uncommitted* work — staged + unstaged
 *   changes plus untracked files (working tree vs HEAD). This is what a person
 *   means by "my changes" and is the tool's most common interactive use.
 */
export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  if (baseRef) {
    assertRefExists(repositoryPath, baseRef);
    const output = git(repositoryPath, [
      "diff",
      "--name-status",
      "--find-renames",
      `${baseRef}...HEAD`,
    ]);
    return parseNameStatus(output);
  }

  // Uncommitted changes: tracked (staged + unstaged) plus untracked, de-duplicated.
  // `git status --porcelain` gives both in one pass with rename detection.
  const output = gitRaw(repositoryPath, ["status", "--porcelain", "--find-renames"]);
  return parsePorcelain(output);
}

function assertRefExists(repositoryPath: string, ref: string): void {
  try {
    git(repositoryPath, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new Error(
      `Base ref "${ref}" was not found in the repository at ${repositoryPath}. ` +
        `Pass an existing branch, tag, or commit via --base-ref.`,
    );
  }
}

function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const code = parts[0];
      // Renames/copies report "old\tnew"; report the destination path.
      const path = parts.length > 2 ? parts[parts.length - 1] : parts.slice(1).join("\t");
      return { path, status: statusFromCode(code) };
    });
}

function parsePorcelain(output: string): ChangedFile[] {
  const seen = new Map<string, ChangedFile["status"]>();
  // Split on newlines only; do NOT trim lines — the two status columns matter.
  for (const line of output.split("\n").filter((l) => l.length > 0)) {
    // Porcelain v1: cols 0-1 are the staged/worktree status, col 2 is a space,
    // col 3+ is the path (or "old -> new" for renames).
    const x = line[0];
    const y = line[1];
    let rest = line.slice(3);
    if (rest.includes(" -> ")) rest = rest.split(" -> ")[1];
    const path = rest.replace(/^"(.*)"$/, "$1");
    const code = x !== " " && x !== "?" ? x : y;
    seen.set(path, statusFromCode(code));
  }
  return [...seen.entries()].map(([path, status]) => ({ path, status }));
}
