#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { reviewRepository } from "./core.js";
import { markdownReport } from "./report.js";

type Format = "markdown" | "json";

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format: Format;
  validations: string[];
};

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", format: "markdown", validations: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      args.repositoryPath = argv[++index]; // full value; do NOT split on spaces
    } else if (token === "--base-ref") {
      args.baseRef = argv[++index];
    } else if (token === "--format") {
      const value = argv[++index];
      if (value !== "markdown" && value !== "json") {
        throw new UsageError(`Unsupported --format "${value}". Use "markdown" or "json".`);
      }
      args.format = value;
    } else if (token === "--validate") {
      const value = argv[++index];
      if (value === undefined) throw new UsageError("--validate requires a command argument.");
      args.validations.push(value);
    } else {
      throw new UsageError(`Unknown argument: ${token}`);
    }
  }
  return args;
}

const USAGE =
  "Usage: inspector review --repo <path> [--base-ref <ref>] [--format markdown|json] [--validate <command>]";

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.command !== "review" || !args.repositoryPath) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await reviewRepository(
      {
        repositoryPath: args.repositoryPath,
        baseRef: args.baseRef,
        validationCommands: args.validations,
      },
      // A human typed this command and authored the validation string, so the
      // CLI grants execution. The grant is explicit rather than implied by the
      // absence of a check.
      { allowValidation: true },
    );

    if (args.format === "json") {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      const report = markdownReport(result);
      writeFileSync("review-report.md", report, "utf8");
      console.log("Review report written to review-report.md");
    }

    // Non-zero exit if any validation failed, so CI can gate on it — the report
    // is still produced either way.
    if (result.validationResults.some((r) => r.status === "failed")) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
