import { changedFiles } from "./git.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
import { runValidations, type ValidationOptions } from "./validation.js";

export type ReviewOptions = ValidationOptions & {
  /**
   * Permission to execute the requested validation commands. Absent means
   * denied: an adapter must ask for execution explicitly, and a caller that
   * says nothing gets read-only inspection.
   */
  allowValidation?: boolean;
};

/**
 * Shared review orchestration. Returns a *structured* result; rendering to
 * markdown or JSON is the report layer's job. Both the CLI and MCP adapters call
 * this same function, which is what keeps the two advertised interfaces
 * behaviorally consistent — and, via `allowValidation`, is where the trust
 * boundary is enforced rather than in any single adapter.
 */
export async function reviewRepository(
  request: ReviewRequest,
  options: ReviewOptions = {},
): Promise<ReviewResult> {
  const files = changedFiles(request.repositoryPath, request.baseRef);

  // Executing shell commands is a capability the *caller* must grant, and it
  // defaults to off. Keeping the policy here rather than in an adapter means a
  // future adapter cannot inherit execution by forgetting to deny it — the
  // failure mode is a refused command, not a silent grant.
  const requested = request.validationCommands ?? [];
  const permitted = options.allowValidation === true ? requested : [];
  const validationResults = await runValidations(
    permitted,
    request.repositoryPath,
    options,
  );
  return {
    repositoryPath: request.repositoryPath,
    changedFiles: files,
    validationResults,
  };
}
