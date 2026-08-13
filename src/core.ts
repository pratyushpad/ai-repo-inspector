import { changedFiles } from "./git.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
import { runValidations, type ValidationOptions } from "./validation.js";

/**
 * Shared review orchestration. Returns a *structured* result; rendering to
 * markdown or JSON is the report layer's job. Both the CLI and MCP adapters call
 * this same function, which is what keeps the two advertised interfaces
 * behaviorally consistent.
 */
export async function reviewRepository(
  request: ReviewRequest,
  options?: ValidationOptions,
): Promise<ReviewResult> {
  const files = changedFiles(request.repositoryPath, request.baseRef);
  const validationResults = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
    options,
  );
  return {
    repositoryPath: request.repositoryPath,
    changedFiles: files,
    validationResults,
  };
}
