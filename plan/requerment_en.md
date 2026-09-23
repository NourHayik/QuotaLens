# AI Limits Dashboard — Canonical Requirements

## 1. Product Vision

Build a local-only dashboard and command-line utility that shows the user's current AI coding subscription limits in one place by querying already-authenticated local CLI tools. Runtime collection must not invoke any AI model and must not require the user to provide the application with provider usernames, passwords, API keys, OAuth tokens, or copied session credentials.

The first production release must prioritize the user's current subscriptions:

1. Kimi Code
2. OpenAI Codex
3. Cursor
4. OpenCode Go
5. Google Antigravity (`agy`) for Gemini quota

The project must also expose a stable machine-readable command so another local automation agent can obtain the same data, for example:

```bash
ai-limits status --json
```

This enables the user's existing agent to execute the command and return the result through WhatsApp while the user is away from the computer.

## 2. Goals

- Aggregate usage windows, remaining percentages/amounts, reset times, plan metadata, and relevant credit balances when locally available.
- Reuse authentication already maintained by each provider CLI.
- Provide manual refresh and optional auto-refresh.
- Provide one normalized data model shared by dashboard, local API, persistence, and CLI JSON output.
- Remain useful when only some providers are available.
- Make future providers easy to add through adapters.
- Preserve deterministic, zero-LLM-credit runtime behavior.

## 3. Non-Goals

- No remote/public dashboard hosting.
- No multi-user accounts or RBAC.
- No storing provider credentials.
- No asking an LLM to read/interpret CLI output.
- No automatic purchasing, upgrading, or changing provider plans.
- No provider usage manipulation or reset-credit redemption in v1.
- No browser scraping in v1.
- No mobile app in v1.

## 4. Hard Constraints and Assumptions

### 4.1 Local-only
- The application runs on the same machine where provider CLIs are installed and authenticated.
- Any HTTP server must bind only to loopback (`127.0.0.1` and/or `::1`).
- The dashboard must not be reachable from the LAN or Internet by default or through ordinary configuration.

### 4.2 Authentication boundary
- The application must rely on provider-managed local authentication.
- It must not request, copy, export, or persist provider passwords, OAuth tokens, session cookies, or API keys.
- A connector may invoke an authenticated CLI/process/protocol and consume its non-secret response.
- Authentication diagnostics may say `authenticated: true/false/unknown` but must not print secret material.

### 4.3 Zero runtime AI-credit parsing
- All usage extraction must use structured protocol fields, JSON parsing, deterministic string parsing, regular expressions, or TUI/PTY control.
- No LLM call may be used to transform, summarize, classify, or parse usage output.
- The dashboard and `ai-limits status --json` must consume zero AI inference credits solely for obtaining/formatting limits.

### 4.4 Failure honesty
- Missing data must be represented as `unsupported`, `unavailable`, `not_authenticated`, `not_installed`, `timeout`, or `parse_error` as appropriate.
- The system must never invent missing limits or estimate remaining quota from undocumented behavior.

## 5. Selected Architecture

Use a local TypeScript modular monolith composed of:

1. `core/domain` — normalized provider, limit, freshness, error, and snapshot types.
2. `core/application` — refresh orchestration, caching, history, and status aggregation.
3. `providers/*` — one independent adapter per provider.
4. `infra/process` — safe subprocess and PTY execution.
5. `infra/storage` — SQLite repositories.
6. `cli` — user-facing `ai-limits` commands.
7. `server` — loopback-only local HTTP/events interface.
8. `web` — React dashboard.

Dependency direction must be inward toward the domain/application contracts. Provider adapters may depend on process infrastructure but must not import UI code.

## 6. Normalized Domain Model

### 6.1 Provider snapshot
Each provider result must include at minimum:

- stable provider ID
- display name
- installed state
- authentication state
- connector capability state
- overall result status
- acquisition source (`app-server`, `cli-json`, `cli-text`, `tui-pty`, etc.)
- installed CLI version when detectable
- fetch start/end timestamps
- freshness/stale flag
- optional plan/account label with privacy-safe handling
- zero or more normalized usage limits
- zero or more non-secret errors/warnings

### 6.2 Usage limit
A normalized limit must support:

- stable local limit ID
- provider-native name when available
- limit category: rolling window, weekly, monthly, credit, model-specific, other
- window duration in minutes when known
- used percentage when known
- remaining percentage when known
- numeric used/limit/remaining amounts when provider reports them
- amount unit (`USD`, credits, requests, tokens, percent, provider-unit)
- reset timestamp when known
- reset countdown derived locally from reset timestamp
- model identifier if the quota is model-specific
- raw non-secret metadata for debugging only when explicitly enabled

No field should be fabricated solely to make providers look uniform.

## 7. Priority Provider Requirements

## 7.1 Codex

Primary integration:
- Launch `codex app-server --stdio` using the existing authenticated Codex installation.
- Initialize the supported JSON-RPC session.
- Call `account/rateLimits/read`.
- Normalize all returned limit buckets, including `rateLimitsByLimitId` when available.
- Parse `usedPercent`, window duration, reset timestamp, plan type, and credit/balance metadata when present.
- Support `account/rateLimits/updated` later for efficient live updates, but periodic read is sufficient for the first complete implementation.

Fallback:
- Deterministically parse `/status` only if app-server integration is unavailable.

Rules:
- If the account exposes only weekly or only 5-hour data, show only that data.
- Do not infer a missing secondary window.

## 7.2 Kimi Code

Primary integration:
- Detect `kimi` executable and version.
- Reuse the authenticated Kimi Code CLI.
- Invoke `/usage` through a controlled PTY when no structured local usage method is available.
- Strip ANSI/control sequences.
- Parse quota/membership windows deterministically with versioned fixtures.

Expected supported data when reported:
- 5-hour rolling usage
- weekly usage
- monthly/shared membership quota
- plan/membership state
- extra usage balance/status
- reset information

Rules:
- Parser must tolerate fields being absent depending on plan/version.
- Unknown output shape returns `parse_error`, never guessed values.

## 7.3 Google Antigravity (`agy`)

Primary integration:
- Detect `agy` executable and version.
- Reuse its Google-authenticated session.
- Invoke `/usage` through PTY or a future structured usage command if detected.
- Normalize model-specific quotas independently.

Rules:
- Multiple model quotas must remain separate when Google reports them separately.
- The display name may be `Gemini / Antigravity` while provider ID remains stable, e.g. `antigravity`.
- Never fall back to the retired/unsupported Gemini CLI assumption when `agy` is the configured source.

## 7.4 Cursor

Required connector behavior:
- Detect `cursor-agent` and version.
- Use `cursor-agent status` for non-secret authentication/installation state.
- Capability-probe current CLI help/status for a supported deterministic usage surface.
- If a supported structured usage command exists in the installed version, use it and normalize results.
- If no local deterministic usage source exists, return provider status successfully with `usage_capability: unsupported` rather than consuming Cursor credits through an AI prompt.

Prohibited:
- Do not run `cursor-agent -p` asking an AI model to report usage.
- Do not scrape Cursor's remote web dashboard in v1.

## 7.5 OpenCode Go

Required connector behavior:
- Detect `opencode` executable/version.
- Confirm OpenCode Go/provider authentication presence using supported auth-list metadata without exposing secrets.
- Probe the installed CLI for a deterministic Go usage command/endpoint.
- Parse structured output when available.
- Normalize the documented Go windows when actual current-usage values are provided by a supported local surface.

Known plan windows at research time may include 5-hour, weekly, and monthly limits, but the application must obtain current consumption from a supported source rather than calculate it from static plan limits alone.

If live usage cannot be obtained locally, return `usage_capability: unsupported` with the known reason.

## 8. Provider Capability Discovery

On startup and through `ai-limits doctor`, the system must:
- resolve executable path without exposing unnecessary filesystem data in normal output;
- obtain CLI version where possible;
- determine installed/not-installed;
- determine authenticated/not-authenticated/unknown using non-secret commands;
- determine available usage acquisition method;
- report the selected method and any fallback availability.

Provider capability results must be cached briefly but refreshable.

## 9. Refresh Behavior

### 9.1 Manual refresh
- `Refresh All` refreshes all enabled providers concurrently with a safe concurrency limit.
- Each provider also has a separate refresh action.
- One provider failure must not cancel others.

### 9.2 Auto-refresh
- Off by default.
- User can enable/disable it.
- User can choose from safe intervals such as 15s, 30s, 60s, 5m.
- Default when enabled: 60s.
- Provider-specific minimum cooldowns can override an overly aggressive global interval.
- Polls should be staggered to avoid launching all CLIs simultaneously.

### 9.3 Timeouts
- Every provider acquisition has a configurable timeout with a conservative default.
- Timed-out child processes must be terminated and cleaned up.

## 10. CLI Interface

The CLI executable name is `ai-limits`.

Required commands:

```bash
ai-limits status
ai-limits status --json
ai-limits status --json --fresh
ai-limits status --json --cached
ai-limits status --provider codex --json
ai-limits providers
ai-limits doctor
ai-limits dashboard
```

### 10.1 `status --json`
Must:
- output exactly one valid JSON document to stdout;
- use stable `schema_version`;
- include all enabled priority providers by default;
- include partial successes and errors;
- include `generated_at`, freshness and provider timestamps;
- never include ANSI escape codes;
- never include credentials;
- place diagnostics/logs on stderr only;
- be safe for another automation agent to call and forward over WhatsApp.

### 10.2 Exit behavior
- Exit 0 if a valid aggregate snapshot was produced, even when some providers are unavailable.
- Exit non-zero only when the command itself cannot initialize/produce a snapshot or arguments are invalid.

### 10.3 JSON stability
- Breaking schema changes require a new `schema_version`.
- Field additions should be backward compatible where possible.

## 11. Local API and Events

- Bind only to loopback.
- Provide read endpoints for aggregate snapshot, provider status, history, and settings needed by the dashboard.
- Provide refresh actions only from the local UI/CLI.
- Use SSE for refresh/update events unless a bidirectional WebSocket is proven necessary.
- Validate request/response payloads against shared schemas.

## 12. Dashboard Requirements

### 12.1 Overview
Display five priority provider cards prominently:
- Kimi
- Codex
- Cursor
- OpenCode Go
- Gemini / Antigravity

Each card must show:
- provider status
- source method
- last updated time
- available limit windows with progress indicators
- used and remaining values
- reset time/countdown
- plan metadata when available
- warnings such as unsupported/unavailable/auth required

### 12.2 Global controls
- Refresh All
- auto-refresh on/off
- refresh interval selector
- visible last refresh time
- stale-data indicator

### 12.3 Provider detail
A detail view/panel must show:
- all normalized limit buckets
- connector/version information
- non-secret diagnostic reason if unavailable
- recent history chart where data exists

### 12.4 History
- Persist successful snapshots locally.
- Show usage history for at least 24h / 7d / 30d ranges.
- Default retention: 90 days, configurable.
- Failed polls may be stored as health events but must not overwrite the last good usage values.

## 13. Settings

Local settings must include:
- provider enabled/disabled
- provider display label override
- auto-refresh enabled
- refresh interval
- snapshot retention
- command timeout overrides only when advanced settings are enabled

Settings must not include provider secrets.

## 14. Error and State Model

Provider states:
- `ok`
- `partial`
- `not_installed`
- `not_authenticated`
- `unsupported`
- `timeout`
- `parse_error`
- `unavailable`

Requirements:
- retain last successful snapshot separately from latest health state;
- mark old values stale when current refresh fails;
- expose safe error codes and concise messages;
- detailed debug output must be opt-in and redacted.

## 15. Security Requirements

- Never log credentials, cookies, Authorization headers, environment dumps, or auth-file contents.
- Never expose provider secrets through JSON/API/UI.
- Avoid shell-string execution; use executable + argument arrays.
- Sanitize all provider text before storage/logging.
- Use strict command allowlists internal to connectors.
- Local server must reject non-loopback binding configuration in v1.
- Do not automatically execute arbitrary provider commands supplied by API/UI users.
- Historical data may contain account plan names but should avoid personal identifiers unless necessary.

## 16. Data Storage

SQLite tables/entities should cover:
- application settings
- provider configuration (non-secret only)
- provider capability/version state
- normalized snapshots
- normalized limit rows
- provider health events

Durable invariants:
- snapshot timestamps stored in UTC;
- percentages constrained to sensible range when provider semantics are percentage-based;
- provider and limit IDs use stable internal keys;
- raw provider output is not stored by default.

## 17. Performance and Reliability

- Dashboard should render cached state quickly without waiting for live provider refresh.
- Manual refresh should stream/reflect provider results independently as they complete.
- Provider collection must not block the Node event loop.
- The application should support at least 20 future provider adapters without architectural change.
- A hung CLI must not hang the dashboard or aggregate CLI command indefinitely.

## 18. Accessibility and UX

- Keyboard accessible controls.
- Semantic progress/status text, not color alone.
- WCAG 2.2 AA-oriented contrast and focus behavior.
- Responsive local dashboard usable on common desktop widths.
- English UI is sufficient for v1; architecture should not prevent later Arabic localization.

## 19. Testing Requirements

### 19.1 Unit
- normalized domain calculations
- parser fixtures for every text-based connector
- JSON-RPC response mapping
- timeout/error mapping
- JSON schema serialization

### 19.2 Integration
- fake provider executables/PTY fixtures
- Codex app-server protocol client against mocked stdio
- SQLite repositories
- local API
- refresh orchestration with partial failures

### 19.3 UI
- provider cards for all health states
- refresh controls
- stale values
- history rendering

### 19.4 E2E
- start local server/dashboard
- return cached snapshot
- trigger refresh using fake provider fixtures
- call `ai-limits status --json`
- verify valid output and no secret leakage

Tests must not require consuming real AI credits.

## 20. Observability and Diagnostics

- Structured local logs with levels.
- Default logs must be concise and redacted.
- `ai-limits doctor` must provide actionable diagnostics.
- Each refresh should have a correlation ID for debugging.
- Track provider duration and result state locally.

## 21. Packaging and Operation

- Must run on the user's local development machine.
- Provide development commands and a production local start command.
- Provide a practical install path for the `ai-limits` executable.
- Do not require Docker, PostgreSQL, Redis, or cloud infrastructure.
- Document Windows/WSL considerations because provider CLIs may be installed in different environments.
- The system must not assume a Windows host CLI is visible inside WSL or vice versa; discovery must report environment clearly.

## 22. Future Provider Extension Contract

Adding a provider should require implementing a provider adapter contract and tests, not changing dashboard business logic.

A provider adapter must implement:
- detect
- getVersion
- getAuthState
- getCapabilities
- fetchUsage
- normalize
- health/error mapping

Optional:
- subscribe to live updates
- provider-specific history metadata

## 23. Seed/Demo Mode

Provide deterministic demo fixtures for all five priority providers so the dashboard can be reviewed without real accounts or AI usage.

Demo fixtures must include:
- healthy provider with multiple windows
- provider with one missing window
- unsupported Cursor/OpenCode usage case
- authentication failure
- timeout
- changed parser format causing parse error

## 24. Definition of Done

The project is production-ready for personal local use when:

1. All five priority connectors exist and honestly report available/unsupported states.
2. Codex structured app-server usage works with fixtures and a documented real-account verification path.
3. Kimi `/usage` and Antigravity `/usage` deterministic parsers are fixture-tested.
4. Cursor and OpenCode never consume AI credits merely to obtain usage status.
5. The dashboard shows normalized limits, reset times, health, freshness, history, and refresh controls.
6. `ai-limits status --json` returns a stable aggregate JSON document suitable for a WhatsApp-connected local agent.
7. No provider credentials are stored or emitted.
8. Manual and auto refresh operate with timeouts, staggering, and partial failure isolation.
9. Unit, integration, UI, and E2E tests pass without real AI-credit consumption.
10. Security review confirms loopback-only operation and redacted logs.
11. Documentation covers installation, provider support matrix, CLI commands, troubleshooting, and how to add a provider.
12. Final requirement-by-requirement audit finds no unresolved in-scope placeholders or TODOs.
