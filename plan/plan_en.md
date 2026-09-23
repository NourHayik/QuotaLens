# AI Limits Dashboard — Sequential Implementation Plan

## How to Execute This Plan

For every phase, give the coding agent this instruction:

> Read `requerment_en.md`, `plan_en.md`, `research.md`, and `todo.md`. Inspect the current repository. Implement Phase N only, completely. Do not implement later phases. Preserve established architecture and security constraints. Add or update the tests required by this phase. Run every verification command/check defined for the phase, fix failures, and update `todo.md`. Mark a TODO item complete only after its work exists and its verification passes. Mark the phase complete only after every child item and acceptance criterion passes.

Phase sizing assumes a modern high-capability coding agent with repository/tool access and enough context to read the specification plus the relevant implementation files. The plan deliberately keeps provider integrations isolated so a failure or context-heavy parser does not overload unrelated work.

---

## Phase 1 — Repository, Contracts, and Local Runtime Foundation

### Objective
Create the project foundation, shared normalized contracts, local runtime boundaries, and test infrastructure without implementing real providers yet.

### Scope
- Initialize Node.js + TypeScript strict-mode workspace using pnpm.
- Create modules for domain, application, providers, process infrastructure, storage, CLI, server, and web.
- Define normalized schemas/types for provider status, capabilities, usage limits, snapshots, errors, freshness, and schema version.
- Add Zod validation for public JSON/API contracts.
- Add safe subprocess abstraction using executable/argument arrays, timeouts, cancellation, stdout/stderr separation, and redaction hooks.
- Add PTY abstraction interface but defer provider-specific scripts.
- Add structured logging with secret-redaction rules.
- Add test framework, lint/format/type-check commands.
- Add demo/fake provider adapter for architecture verification.

### Architecture / Constraints
- Domain/application layers must not import provider-specific or UI modules.
- No shell command strings assembled from user input.
- No credential storage.
- No LLM calls.
- No network binding beyond loopback in later server work.

### Verification
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- Unit tests validate normalized schemas and process timeout/error behavior.
- Repository dependency-direction review.

### Acceptance Criteria
- Clean build/test baseline.
- Fake provider can return a normalized snapshot through the application service.
- Timeouts terminate a fake hung process.
- Logs redact configured sensitive patterns.

### Completion Procedure
1. Finish Phase 1 scope only.
2. Run all verification.
3. Fix all failures.
4. Confirm acceptance criteria.
5. Update `todo.md`.
6. Do not start Phase 2 until complete.

---

## Phase 2 — SQLite Persistence, Refresh Orchestration, and Cache Semantics

### Objective
Implement the provider orchestration engine and durable local snapshot/history behavior before real connectors.

### Scope
- Add SQLite schema/repositories for settings, provider capability state, snapshots, normalized limits, and health events.
- Add migrations and safe startup initialization.
- Implement provider registry and enable/disable configuration.
- Implement aggregate refresh service with bounded concurrency.
- Isolate provider failures and return partial aggregate snapshots.
- Implement last-good snapshot vs latest-health semantics.
- Implement freshness/stale calculation.
- Implement manual forced refresh and cached-only read.
- Implement stagger/cooldown primitives for future auto-refresh.
- Default retention 90 days and pruning job/service.

### Architecture / Constraints
- Failed refresh must never erase last-good data.
- Store timestamps in UTC.
- Raw provider output is not persisted by default.

### Verification
- Migration tests on empty and existing test DB.
- Integration tests with healthy, failing, timeout, and partial fake providers.
- Verify retention pruning and stale semantics.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`.

### Acceptance Criteria
- Aggregate refresh returns independent results for multiple providers.
- One failure cannot fail the entire snapshot.
- Cached read is immediate and does not execute providers.
- History is queryable by provider and time range.

### Completion Procedure
Follow the standard completion procedure and update Phase 2 TODO items only after verification.

---

## Phase 3 — CLI Product Surface and Stable JSON Contract

### Objective
Deliver the machine-readable interface required by the user's external/WhatsApp-connected agent before adding real providers.

### Scope
- Implement `ai-limits` CLI using shared application services.
- Commands:
  - `status`
  - `status --json`
  - `status --json --fresh`
  - `status --json --cached`
  - `status --provider <id> --json`
  - `providers`
  - `doctor`
  - placeholder `dashboard` launcher for later phase
- Ensure JSON stdout contains one document only.
- Route diagnostics/logs to stderr.
- Implement schema version `1.0`.
- Implement exit-code rules from requirements.
- Add deterministic human-readable table output without affecting JSON mode.
- Add fixture-based demo mode usable by tests.

### Architecture / Constraints
- CLI is a transport; it must not duplicate provider/business logic.
- JSON output must never contain ANSI sequences or secrets.

### Verification
- Snapshot JSON validates against shared Zod schema.
- Shell-level tests parse stdout with a standard JSON parser.
- Simulate partial provider failure and verify exit 0 + error entry.
- Simulate application initialization failure and verify non-zero exit.
- Verify stderr/stdout separation.

### Acceptance Criteria
- A local automation agent can execute `ai-limits status --json --cached` and receive valid JSON.
- `--fresh` invokes providers through the same refresh service.
- CLI JSON contract is documented and fixture-tested.

### Completion Procedure
Follow the standard completion procedure and update Phase 3 TODO items only after verification.

---

## Phase 4 — Codex Connector via App Server

### Objective
Implement the strongest structured provider integration first: OpenAI Codex.

### Scope
- Detect `codex` executable/version.
- Detect authentication state using supported non-secret behavior.
- Implement `codex app-server --stdio` process lifecycle.
- Implement required JSON-RPC initialization.
- Call `account/rateLimits/read`.
- Normalize `rateLimits`, `rateLimitsByLimitId`, primary/secondary windows, `usedPercent`, `windowDurationMins`, `resetsAt`, plan type, and available credit metadata.
- Preserve multiple buckets rather than assuming exactly 5-hour + weekly.
- Implement strict timeouts and graceful process termination.
- Implement deterministic `/status` fallback parser only when app-server is unsupported/unavailable.
- Add sanitized protocol fixtures, including account with only one returned window.

### Architecture / Constraints
- Never infer an absent 5-hour or weekly bucket.
- Do not invoke a Codex model/prompt.

### Verification
- Mock stdio JSON-RPC integration tests.
- Fixtures for full, partial, null, malformed, timeout, and unauthenticated snapshots.
- Verify normalized reset timestamps and percentages.
- Verify no credentials or raw authorization data enter persisted output.

### Acceptance Criteria
- `ai-limits status --provider codex --json --fresh` returns structured normalized Codex data from fixtures and documented real-account test path.
- Missing windows remain missing, not fabricated.
- App-server failure produces safe fallback/error behavior.

### Completion Procedure
Follow the standard completion procedure and update Phase 4 TODO items only after verification.

---

## Phase 5 — Kimi and Antigravity PTY Usage Connectors

### Objective
Implement the two priority providers with documented `/usage` commands using deterministic PTY automation.

### Scope
#### Kimi
- Detect `kimi` and version.
- Start controlled PTY session.
- Execute `/usage` without submitting an AI prompt.
- Detect completion, capture output, strip ANSI/control sequences, terminate cleanly.
- Parse known quota/membership fields into normalized limits.

#### Antigravity
- Detect `agy` and version.
- Start controlled PTY session.
- Execute `/usage` without submitting an AI prompt.
- Parse each model/quota bucket separately.
- Preserve model IDs/names when reported.

#### Shared PTY work
- Timeouts, startup delays, prompt readiness detection, cancellation, Windows/WSL behavior abstraction.
- Versioned sanitized fixture format.
- Unknown format -> `parse_error` with last-good stale data preserved.

### Architecture / Constraints
- No LLM parsing.
- No AI prompt may be sent merely to obtain usage.
- Provider text parser must be deterministic and fully fixture-tested.

### Verification
- PTY simulation tests for Kimi and Antigravity.
- Fixtures with healthy, missing fields, changed formatting, auth failure, quota exhausted, and timeout.
- Confirm `/usage` command path does not call normal model prompt flow in test harness.
- Run complete test/lint/type-check suite.

### Acceptance Criteria
- Both connectors return normalized quota data from supported fixtures.
- Multiple Antigravity model quotas remain distinct.
- Parser drift fails honestly.
- No AI credits are intentionally consumed by the collector.

### Completion Procedure
Follow the standard completion procedure and update Phase 5 TODO items only after verification.

---

## Phase 6 — Cursor and OpenCode Go Capability-Aware Connectors

### Objective
Support the remaining two current subscriptions without violating the zero-AI-credit rule when their CLIs do not expose live usage.

### Scope
#### Cursor
- Detect `cursor-agent` and version.
- Use `cursor-agent status` for auth state.
- Probe supported command/help metadata for a deterministic usage surface.
- Implement structured/local usage path only if the installed CLI exposes one.
- Otherwise return `usage_capability: unsupported` with reason and retain install/auth status.

#### OpenCode Go
- Detect `opencode` and version.
- Use supported auth-list metadata to determine configured provider presence without exposing secret values.
- Probe CLI for Go-specific deterministic usage functionality.
- Implement structured/local usage path when supported.
- Otherwise return `usage_capability: unsupported` with reason.

#### Compatibility
- Create provider capability matrix fields: tested version, acquisition method, fallback, last probe.
- Add fixtures for future supported usage payloads without changing core contracts.

### Architecture / Constraints
- Never call `cursor-agent -p` or `opencode run` asking a model to explain its quota.
- Never read and emit provider auth-file contents.
- Do not calculate live usage merely from static plan maximums.

### Verification
- Fake executable tests covering status/auth/capability probing.
- Secret leakage tests.
- Unsupported path tests.
- Future structured usage fixture mapping tests.
- Complete suite.

### Acceptance Criteria
- Cursor and OpenCode appear in aggregate status even when live quota is unsupported.
- Their status clearly distinguishes installed/authenticated from quota-readable.
- No AI inference is used to discover usage.

### Completion Procedure
Follow the standard completion procedure and update Phase 6 TODO items only after verification.

---

## Phase 7 — Local API, Dashboard, History, and Auto-Refresh

### Objective
Build the local dashboard over the already-working core and CLI.

### Scope
- Add Fastify loopback-only server.
- Reject non-loopback bind configuration.
- Add validated endpoints for snapshot, provider details, history, settings, and refresh.
- Add SSE update stream for provider refresh completion/status.
- Build React/Vite dashboard.
- Five priority provider cards in prominent overview.
- Show progress, used/remaining, reset countdown, source, freshness, errors, and last update.
- Global Refresh All and per-provider refresh.
- Auto-refresh toggle and interval selection: 15s / 30s / 60s / 5m.
- Auto-refresh off by default; 60s default when enabled.
- Stagger provider polling.
- Provider detail/history view for 24h / 7d / 30d.
- Settings for enabled providers, labels, interval, retention.
- `ai-limits dashboard` launches/opens local UI.

### Architecture / Constraints
- UI never runs provider commands directly.
- API and CLI use the same application services.
- SSE preferred; do not add WebSocket unless required.

### Verification
- API schema tests and loopback binding test.
- React component tests for all provider states.
- Auto-refresh scheduler tests using fake timers.
- SSE update integration test.
- Manual accessibility checks for keyboard/focus/status semantics.

### Acceptance Criteria
- Dashboard can start from local command and render cached values immediately.
- Fresh provider results update independently.
- Turning auto-refresh off stops polling.
- Unsupported Cursor/OpenCode states are visually clear rather than shown as zero usage.

### Completion Procedure
Follow the standard completion procedure and update Phase 7 TODO items only after verification.

---

## Phase 8 — Diagnostics, Security Hardening, Packaging, and Real-Provider Validation

### Objective
Harden the local utility for daily personal use and validate compatibility with the five priority CLIs.

### Scope
- Complete `ai-limits doctor` with executable, version, auth, capability, environment, and safe remediation hints.
- Add Windows vs WSL discovery diagnostics.
- Add log rotation/retention if local logs are persisted.
- Run secret-leak review across logs, JSON, DB, API, and errors.
- Add command allowlist tests and injection tests.
- Add robust subprocess cleanup on application shutdown/crash paths.
- Package/install `ai-limits` command locally.
- Document startup and optional autostart strategy without forcing it.
- Validate real installed provider behavior manually where credentials already exist, without recording secrets.
- Record tested CLI versions in support matrix.
- Update parsers only from sanitized captures.

### Architecture / Constraints
- Real-provider validation must not intentionally make model prompts just to test usage collection.
- No raw sensitive capture is committed to repository.

### Verification
- Security test suite.
- `ai-limits doctor` on representative installed/missing providers.
- Packaging install/uninstall smoke test.
- Fresh and cached aggregate CLI smoke tests.
- Dashboard launch smoke test.
- Database backup/restore simple copy/reopen test.

### Acceptance Criteria
- Local install works without Docker or server infrastructure.
- No known credential leakage path remains.
- Five priority providers have explicit tested/unsupported compatibility status.
- Hung child processes are cleaned up.

### Completion Procedure
Follow the standard completion procedure and update Phase 8 TODO items only after verification.

---

## Phase 9 — Full E2E and Production-Readiness Closure

### Objective
Perform the final requirement-by-requirement production readiness review and fix all blockers.

### Scope
- Re-read `requerment_en.md`, `research.md`, `plan_en.md`, and `todo.md`.
- Map every requirement to implementation evidence.
- Run full unit/integration/UI/E2E suite.
- E2E scenario: cached dashboard load -> fresh refresh -> partial failure -> recovery.
- E2E scenario: `ai-limits status --json` consumed by a generic automation script and parsed successfully.
- E2E scenario: one provider timeout while four others return.
- E2E scenario: parser drift produces stale last-good + parse error.
- Verify no LLM/model prompt is used by any collector path.
- Verify loopback-only exposure.
- Verify data retention/pruning and backup/restore instructions.
- Verify accessibility basics and responsive desktop layouts.
- Run dependency/security audit appropriate to the selected package manager.
- Remove debug code, placeholders, temporary bypasses, dead code, and in-scope TODOs.
- Finalize README, provider support matrix, JSON schema documentation, troubleshooting, and provider-extension guide.

### Verification
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- production builds for core/CLI/web
- Playwright E2E suite
- dependency/security audit
- JSON schema contract test
- manual loopback binding check
- manual `ai-limits doctor`
- requirement traceability checklist

### Acceptance Criteria
- Every Definition of Done item in `requerment_en.md` has evidence.
- All automated suites pass.
- No high-severity unresolved security issue in project-owned code/dependencies without documented mitigation.
- No provider credential is stored or exposed.
- CLI JSON is stable and usable by the user's external agent.
- Dashboard and CLI share identical normalized source-of-truth data.
- Final production-readiness TODO is checked only after all prior items pass.

### Completion Procedure
1. Complete all final review work.
2. Fix every blocker discovered.
3. Re-run the complete verification suite.
4. Confirm every requirement and Definition of Done item.
5. Update all remaining Phase 9 TODO items.
6. Check the final production-readiness checkbox only when the entire project is verified ready.
