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

export function markdownReport(input: ReportInput): string {
  const lines: string[] = [`# Review Report: ${input.repositoryPath}`, ""];

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
    for (const file of changed) lines.push(`- ${file.path} (${file.status})`);
  }

  lines.push("", "## Validation output", "");
  if (input.validationResults.length === 0) {
    lines.push("_No validation commands were run._");
  } else {
    for (const result of input.validationResults) {
      const badge = result.status === "passed" ? "✅ passed" : "❌ failed";
      const fence = fenceFor(result.output);
      lines.push(`### \`${result.command}\` — ${badge}`, fence, result.output, fence, "");
    }
  }

  return lines.join("\n");
}
