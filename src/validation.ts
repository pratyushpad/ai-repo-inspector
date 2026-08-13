import { execFile } from "node:child_process";
import type { ValidationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 20_000;

export type ValidationOptions = {
  timeoutMs?: number;
  maxOutputChars?: number;
};

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const omitted = text.length - max;
  return `${text.slice(0, max)}\n…[${omitted} more chars truncated]`;
}

/**
 * Run a single validation command. A non-zero exit is a *first-class result*
 * (`status: "failed"`), NOT a thrown error — the whole point of the tool is to
 * report on failing validations, so a failing command must never crash the run
 * or suppress the report. A timeout guards against a command that hangs forever.
 *
 * The command is run via a shell (`sh -c`) so users can pass strings like
 * `npm test`. This is an arbitrary-execution surface: callers that expose this
 * to untrusted input (e.g. an MCP agent) must gate it — see mcp-server.ts.
 */
export function runValidation(
  command: string,
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutput = options.maxOutputChars ?? MAX_OUTPUT_CHARS;
  return new Promise((resolve) => {
    execFile(
      "sh",
      ["-c", command],
      { cwd, timeout, killSignal: "SIGKILL", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const combined = (stdout || "") + (stderr || "");
        const timedOut = Boolean((error as { killed?: boolean } | null)?.killed);
        if (timedOut) {
          resolve({
            command,
            status: "failed",
            output: clip(`${combined}\n[timed out after ${timeout}ms]`, maxOutput),
          });
          return;
        }
        resolve({
          command,
          status: error ? "failed" : "passed",
          output: clip(combined || (error ? String(error.message) : ""), maxOutput),
        });
      },
    );
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, options));
  }
  return results;
}
