# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## Interface model: hybrid, with an asymmetric trust boundary

Both interfaces are supported and both are thin adapters over the same
`core.ts`, so they cannot drift in *what a review means*. They deliberately
differ in **what they are allowed to do**, because their callers differ:

| | CLI | MCP |
|---|---|---|
| Caller | a developer who typed the command | an autonomous agent |
| Validation (arbitrary shell) | enabled | **disabled by default** |
| Output | `review-report.md` or JSON on stdout | report text, bounded |
| Errors | message + non-zero exit | structured `isError` tool result |

Rationale, tradeoffs, and the evidence that would change this are in
`SUBMISSION.md`.

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
npm run inspector -- review --repo ./path/to/repo --base-ref main
npm run inspector -- review --repo ./path/to/repo --format json
```

- **`--repo`** may contain spaces.
- **Without `--base-ref`** the report covers *uncommitted* work: staged,
  unstaged, and untracked files. This is what "my changes" usually means.
- **With `--base-ref <ref>`** it covers the changes committed on this branch
  since it diverged from that ref (`ref...HEAD`, the PR-review view). An
  unknown ref is reported as an error, not a stack trace.
- **`--validate`** runs a shell command per flag (repeatable). A failing
  command is reported as `failed` in the report; the report is still written
  and the process exits non-zero so CI can gate on it. Commands are killed
  after 120s and their output is clipped at 20k characters.
- **`--format markdown`** (default) writes `review-report.md`;
  **`--format json`** prints the structured result to stdout instead.

## MCP

Start the stdio server with:

```bash
npm run mcp-server
```

It exposes one tool, `review_repository`:

| input | type | notes |
|---|---|---|
| `repo_path` | string, **required** | absolute path to the repository |
| `base_ref` | string, optional | omit for uncommitted changes |
| `validation_commands` | string[], optional | ignored unless enabled (below) |

Validation is **off by default over MCP**: an agent choosing its own shell
command is arbitrary code execution, so the capability is opt-in by the human
operator running the server:

```bash
INSPECTOR_MCP_ALLOW_VALIDATION=1 npm run mcp-server
```

When validation is requested but disabled, the report still returns and says
so rather than failing silently. Errors come back as `isError` tool results.

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp-server.ts   MCP adapter
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown report generation
test/               public starter tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.