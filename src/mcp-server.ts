#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";
import { markdownReport } from "./report.js";

const server = new McpServer({ name: "repository-inspector", version: "2.1.0" });

// Trust boundary: over MCP the *caller is an autonomous agent*, so running
// arbitrary shell commands (validation) is off by default. A human operator can
// opt in explicitly by starting the server with INSPECTOR_MCP_ALLOW_VALIDATION=1.
const VALIDATION_ALLOWED = process.env.INSPECTOR_MCP_ALLOW_VALIDATION === "1";

server.tool(
  "review_repository",
  "Inspects changed files in a Git repository and returns a Markdown review report. " +
    "By default this is read-only inspection; running validation commands is disabled " +
    "over MCP unless the operator enabled it.",
  {
    repo_path: z.string().min(1).describe("Absolute path to the Git repository to inspect."),
    base_ref: z
      .string()
      .optional()
      .describe("Base branch/tag/commit to diff against. Omit to inspect uncommitted changes."),
    validation_commands: z
      .array(z.string())
      .optional()
      .describe("Shell commands to run (ignored unless validation is enabled server-side)."),
  },
  async (input) => {
    try {
      const requested = input.validation_commands ?? [];
      const validationCommands = VALIDATION_ALLOWED ? requested : [];

      const result = await reviewRepository({
        repositoryPath: input.repo_path,
        baseRef: input.base_ref,
        validationCommands,
      });

      let report = markdownReport(result);
      if (requested.length > 0 && !VALIDATION_ALLOWED) {
        report +=
          "\n\n> Note: validation commands were ignored. Validation execution is disabled " +
          "over MCP by default (set INSPECTOR_MCP_ALLOW_VALIDATION=1 to enable).";
      }
      return { content: [{ type: "text", text: report }] };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `review_repository failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
