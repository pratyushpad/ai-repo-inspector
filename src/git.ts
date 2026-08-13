import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

/**
 * NUL-separated variant. Git *quotes and C-escapes* any path containing
 * non-ASCII bytes, a space, a quote or a backslash (`café.txt` becomes
 * `"caf\303\251.txt"`), so parsing the human-readable output means decoding
 * octal escapes to get a path that actually exists on disk. `-z` sidesteps
 * that entirely: paths come through raw, NUL-separated, never quoted.
 *
 * It also removes the trimming hazard — porcelain's leading status column can
 * be a space, so trimming shifted every path by one character.
 */
function gitFields(repositoryPath: string, args: string[]): string[] {
  const output = execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  });
  return output.split("\0");
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
    return parseNameStatus(
      gitFields(repositoryPath, [
        "diff",
        "--name-status",
        "--find-renames",
        "-z",
        `${baseRef}...HEAD`,
      ]),
    );
  }

  // Uncommitted changes: tracked (staged + unstaged) plus untracked, de-duplicated.
  // `git status --porcelain` gives both in one pass with rename detection.
  return parsePorcelain(
    gitFields(repositoryPath, ["status", "--porcelain", "--find-renames", "-z"]),
  );
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

/**
 * `git diff --name-status -z` emits alternating NUL-separated fields:
 * `<status>\0<path>\0` — except renames and copies, which carry two paths,
 * `<status>\0<old>\0<new>\0`. Report the destination path.
 */
function parseNameStatus(fields: string[]): ChangedFile[] {
  const changed: ChangedFile[] = [];
  for (let index = 0; index < fields.length; ) {
    const code = fields[index];
    if (!code) {
      index++;
      continue;
    }
    const isRenameOrCopy = code[0] === "R" || code[0] === "C";
    const path = isRenameOrCopy ? fields[index + 2] : fields[index + 1];
    if (path) changed.push({ path, status: statusFromCode(code) });
    index += isRenameOrCopy ? 3 : 2;
  }
  return changed;
}

/**
 * `git status --porcelain -z` emits one NUL-terminated record per entry:
 * two status columns, a space, then the raw path. Renames/copies append the
 * *origin* path as its own following field, which we consume and discard.
 */
function parsePorcelain(fields: string[]): ChangedFile[] {
  const seen = new Map<string, ChangedFile["status"]>();
  for (let index = 0; index < fields.length; index++) {
    const entry = fields[index];
    // A record is at minimum "XY " plus a path; anything shorter is the
    // trailing empty field produced by the final NUL.
    if (!entry || entry.length < 4) continue;

    const staged = entry[0];
    const worktree = entry[1];
    const path = entry.slice(3);

    if (staged === "R" || staged === "C" || worktree === "R" || worktree === "C") {
      index++; // the next field is the origin path, not a new entry
    }

    // Prefer the worktree column when it reports a deletion: the file is gone
    // from disk now, which outranks whatever is staged (e.g. "AD").
    const code = worktree === "D" ? worktree : staged !== " " && staged !== "?" ? staged : worktree;
    seen.set(path, statusFromCode(code));
  }
  return [...seen.entries()].map(([path, status]) => ({ path, status }));
}
