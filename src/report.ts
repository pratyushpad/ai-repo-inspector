import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

/**
 * Choose a code fence longer than any run of backticks in the content, so
 * validation output that itself contains ``` cannot break out of the fence or
 * inject Markdown headings into the report (important: the report is often fed
 * back into an AI agent's context).
 */
function fenceFor(content: string): string {
  let longest = 0;
  for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Render an untrusted single-line value as inline code.
 *
 * Everything the report interpolates comes from outside the tool — file paths
 * come from the *inspected repository*, which is exactly the thing an agent has
 * been pointed at and has no reason to trust. Git permits newlines in
 * filenames, so a file named "evil.txt\n\n## SYSTEM NOTICE\n…" would otherwise
 * open a real Markdown heading in a document that is routinely fed back into an
 * agent's context. Newlines are flattened and the value is wrapped in a backtick
 * run longer than any it contains, so it cannot start a block or close its own
 * span.
 */
function inlineCode(value: string): string {
  const flattened = value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  let longest = 0;
  for (const match of flattened.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const ticks = "`".repeat(longest + 1);
  // A value starting or ending with a backtick needs padding spaces, per CommonMark.
  const pad = flattened.startsWith("`") || flattened.endsWith("`") ? " " : "";
  return `${ticks}${pad}${flattened}${pad}${ticks}`;
}

export function markdownReport(input: ReportInput): string {
  const lines: string[] = [`# Review Report: ${inlineCode(input.repositoryPath)}`, ""];

  const changed = input.changedFiles;
  const failed = input.validationResults.filter((r) => r.status === "failed").length;
  lines.push(
    "## Summary",
    "",
    `- Changed files: ${changed.length}`,
    `- Validations: ${input.validationResults.length} (${failed} failed)`,
    "",
  );

  lines.push("## Changed files", "");
  if (changed.length === 0) {
    lines.push("_No changed files detected._");
  } else {
    for (const file of changed) lines.push(`- ${inlineCode(file.path)} (${file.status})`);
  }

  lines.push("", "## Validation output", "");
  if (input.validationResults.length === 0) {
    lines.push("_No validation commands were run._");
  } else {
    for (const result of input.validationResults) {
      const badge = result.status === "passed" ? "✅ passed" : "❌ failed";
      const fence = fenceFor(result.output);
      lines.push(`### ${inlineCode(result.command)} — ${badge}`, fence, result.output, fence, "");
    }
  }

  return lines.join("\n");
}
