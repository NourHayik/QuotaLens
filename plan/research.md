# Engineering Research — AI Limits Dashboard

## 1. Research Context

Research date: 2026-09-15.

The project is a local-only dashboard and CLI utility that aggregates current subscription usage and rate-limit windows from locally authenticated AI coding tools without storing provider credentials and without invoking an LLM during refresh. Priority providers are:

1. Kimi Code CLI
2. OpenAI Codex CLI
3. Cursor CLI
4. OpenCode Go
5. Google Antigravity CLI (`agy`) for Gemini usage

A second primary interface is a machine-readable command such as `ai-limits status --json`, intended for a local automation/WhatsApp agent to execute remotely on the user's behalf.

Hard constraints:
- Local-only application; no public dashboard endpoint.
- No AI/LLM call may be used to interpret usage output.
- Reuse each provider's already-authenticated local CLI/session.
- Do not ask the user to copy credentials into this application.
- Do not read or export provider secrets when a supported local command/protocol can be used.
- The dashboard and CLI must share one normalized usage core.
- Provider failures must be isolated; one broken connector must not prevent other results.

## 2. Recommended Architecture Approach

### Selected approach: local TypeScript modular monolith

Use one Node.js/TypeScript application with three adapters around a shared application core:

- Provider adapters: execute/read local provider interfaces.
- CLI transport: `ai-limits status --json`, human table output, provider-specific commands.
- Local dashboard transport: loopback HTTP plus Server-Sent Events (SSE) or WebSocket only if needed.

Recommended dependency direction:

`UI / CLI -> Application Services -> Provider Contract -> Provider Adapters -> Local provider process/protocol`

The normalized domain model must not depend on provider-specific output shapes.

### Why this fits

- The key integration boundary is local process execution and parsing, which Node.js handles well.
- TypeScript enables strongly typed normalized contracts and JSON schemas.
- One runtime avoids unnecessary Laravel + separate daemon complexity for a personal local utility.
- The same executable can expose both dashboard and CLI behavior.
- SQLite is enough for optional local snapshot history and requires no database service.
- No Docker is needed.

### Provider acquisition priority

For every provider, prefer sources in this order:

1. Structured local protocol/API exposed by the installed authenticated CLI.
2. Structured CLI output (JSON/JSONL).
3. Deterministic parsing of documented TUI/status text via PTY.
4. Read-only local loopback/provider endpoint if the provider itself exposes one and it reuses existing authentication.
5. Unsupported state.

Do not use an LLM as a parser and do not scrape a remote web dashboard unless a future explicit project decision adds such a connector.

## 3. Provider Research

### 3.1 Codex — strongest structured integration

OpenAI's Codex repository documents `codex app-server --stdio` and the JSON-RPC method `account/rateLimits/read`. It can return rate-limit snapshots with fields such as `usedPercent`, `windowDurationMins`, `resetsAt`, plan information, optional credit data, and multiple limit buckets. It also emits `account/rateLimits/updated` notifications.

Recommendation:
- Primary source: Codex app-server JSON-RPC.
- Fallback: deterministic parsing of `/status` only if app-server integration fails.
- Never use Codex itself as an AI parser.
- Treat missing 5-hour or weekly buckets as genuinely unavailable rather than fabricating a value; current reports show that some accounts can expose only one bucket.

### 3.2 Kimi Code — official `/usage`

Kimi Code documentation explicitly exposes `/usage` for token usage, context consumption, and quota information. Kimi documentation also describes rolling 5-hour, weekly, and monthly quota behavior and membership status.

Recommendation:
- Primary source: deterministic PTY execution of `/usage` unless a stable structured usage endpoint is locally exposed by the installed version.
- Parser must be fixture-driven and version-aware.
- Detect membership/extra-usage data when present without assuming every plan exposes every field.

### 3.3 Google Antigravity (`agy`) — official `/usage`

Google Codelabs for Antigravity CLI document `agy` and explicitly recommend `/usage` to inspect model quota when quota issues occur. Google also documents Antigravity CLI as the terminal/headless surface and notes the 2026 transition from Gemini CLI to Antigravity CLI for affected consumer tiers.

Recommendation:
- Primary source: deterministic PTY execution of `/usage` in an authenticated `agy` session.
- Normalize each model/quota bucket separately if Antigravity reports limits per model.
- Do not collapse multiple model quotas into one misleading percentage.

### 3.4 Cursor — partial local support

Cursor documents `cursor-agent`, local browser authentication, `cursor-agent status`, and machine-readable `--output-format json` for print-mode agent responses. Cursor's official usage documentation says real-time subscription usage is visible in the Spending tab of the Cursor dashboard. The documented CLI reference does not currently expose a dedicated machine-readable usage command.

Recommendation:
- Build a Cursor connector with capability probing.
- Probe current installed CLI help/status for any supported usage/status surface added after the research date.
- Do not invoke `cursor-agent -p` with an AI prompt to ask the model about limits; that would consume credits and violates the product requirement.
- If no deterministic local usage source exists, report `usage_status: unsupported` with clear diagnostic metadata while still reporting CLI installation/authentication status.
- Keep the adapter replaceable so a future official usage command can be added without changing the core.

### 3.5 OpenCode Go — limits documented, live usage source not documented in CLI

OpenCode Go currently documents 5-hour, weekly, and monthly usage limits and says current usage can be tracked in the console. The OpenCode CLI documents structured auth listing and JSON output for several commands, but the current public CLI documentation does not expose a dedicated Go usage command.

Recommendation:
- Build a Go-specific connector with capability probing and fixtures.
- Check current installed OpenCode command metadata/help for a supported usage command before falling back.
- Authentication presence may be checked through `opencode auth list --format json` without exposing secret values.
- Never read and return the contents of the OpenCode auth file.
- If no local deterministic usage source is available, return `unsupported` rather than calling an AI model or silently scraping the browser.

## 4. Technology Stack Evaluation

### Recommended

- Node.js: current active LTS at implementation time.
- TypeScript: strict mode.
- Package manager: pnpm.
- Frontend: React + Vite.
- Local API: Fastify or Node built-in HTTP with a minimal router; Fastify is recommended for schema validation and testing ergonomics.
- Local persistence: SQLite.
- SQLite library: `better-sqlite3` if compatible with the chosen Node version; otherwise a maintained SQLite binding selected at implementation time.
- CLI framework: `commander` or `cac`; prefer `commander` for maturity.
- PTY: `node-pty` only for providers requiring interactive slash commands.
- Validation: Zod.
- Process execution: Node `child_process` for non-interactive commands; no shell interpolation with user-controlled strings.
- UI data fetching: native fetch/TanStack Query only if caching complexity justifies it. For this project, native fetch plus a small store is sufficient initially.
- Charts: Recharts only if historical charting is implemented; avoid chart dependency for the first functional dashboard if simple progress bars suffice.
- Testing: Vitest + React Testing Library; provider adapters use captured sanitized fixtures.
- E2E: Playwright for the local dashboard only in final integration phases.
- Formatting/linting: ESLint + Prettier or Biome. Prefer Biome if all project needs are covered by its current stable release.
- Build/package: `tsup` or Vite library build for Node core plus Vite for UI. Resolve the simplest compatible stable setup at implementation time.

### Rejected / not needed

- Laravel backend: capable but unnecessary for a single-user local process-integration tool; it adds PHP/runtime/process-management complexity without a server-side business requirement.
- PostgreSQL/Redis: unnecessary for local snapshots and polling.
- Microservices: unnecessary.
- Docker: unnecessary for a local tool that must directly reuse host CLI authentication and processes.
- Electron/Tauri for v1: optional later. A localhost dashboard plus CLI is simpler and directly satisfies requirements.
- Browser scraping: fragile and contrary to the preferred local-authenticated CLI design.
- LLM parsing: explicitly prohibited because it consumes credits and is nondeterministic.

## 5. Packages / Libraries / Plugins

### Core/backend
- TypeScript — required.
- Fastify — recommended local HTTP server bound strictly to loopback.
- Zod — required for provider output normalization and API/CLI contract validation.
- Commander — required for user-facing CLI commands.
- `execa` — optional; use Node `child_process` directly if sufficient.
- `node-pty` — required only for Kimi/Antigravity or other TUI interactions that cannot be queried non-interactively.

### Frontend
- React — required.
- Vite — required.
- No heavy component framework required. Use accessible semantic components and CSS variables.

### Data
- SQLite — recommended for settings, snapshots, provider health history.
- Retention should be configurable; default 90 days of snapshots.

### Testing
- Vitest — required.
- React Testing Library — required.
- Playwright — required for final E2E smoke flows, not for provider CLI simulation.

### Security
- No provider credential vault should exist.
- No secrets should be logged.
- Provider subprocess environment should be inherited minimally and never printed wholesale.
- Loopback server should bind to `127.0.0.1`/`::1` only.
- If local API mutation endpoints are introduced, protect them with an ephemeral local session token or same-origin controls.

## 6. Engineering Best Practices

### Deterministic parsing
- Every text parser must have sanitized fixture tests.
- Parser output must include connector version and acquisition source.
- Unknown formats must fail closed as `parse_error` instead of guessing.
- Strip ANSI escape sequences before deterministic parsing.
- Locale-sensitive output should be detected; force English locale only when supported and safe.

### Provider health model
Each provider should report independently:
- `installed`
- `authenticated`
- `capability`
- `status`
- `source`
- `fetched_at`
- `stale`
- `limits[]`
- `errors[]`

### Freshness
- Manual refresh is always available.
- Auto-refresh is opt-in.
- Default suggested interval: 60 seconds.
- Minimum interval: 15 seconds to avoid aggressive polling.
- Provider-specific cooldowns may override the global interval.

### CLI JSON contract
`ai-limits status --json` must:
- return one valid JSON document on stdout;
- write diagnostics only to stderr;
- never include ANSI formatting;
- include partial results when one provider fails;
- use a stable schema version;
- exit 0 when the command ran and produced a snapshot, even if some providers are unavailable; reserve non-zero exit codes for command/system failure;
- support `--fresh` to force a live refresh and `--cached` to return last-known data without provider calls.

Example shape:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-09-15T07:55:00+03:00",
  "fresh": true,
  "providers": [
    {
      "id": "codex",
      "display_name": "Codex",
      "status": "ok",
      "source": "app-server",
      "limits": [
        {
          "id": "primary",
          "window_minutes": 300,
          "used_percent": 42,
          "remaining_percent": 58,
          "resets_at": "2026-09-15T10:20:00+03:00"
        }
      ],
      "errors": []
    }
  ]
}
```

## 7. Tooling & Developer Experience

- Provide `ai-limits doctor` to detect required executables, versions, auth presence, and connector capability without exposing secrets.
- Provide `ai-limits providers` and `ai-limits status --provider <id> --json`.
- Add golden/sanitized fixture capture tooling for maintainers, but never persist credentials.
- Maintain a connector compatibility matrix with last-tested CLI versions.
- Include a debug mode that logs commands and parser stages but redacts paths/tokens/account identifiers.

## 8. Risks & Watch Items

1. Provider CLI output can change without notice. Mitigation: adapter isolation + fixtures + capability probing.
2. Cursor currently lacks a documented CLI usage endpoint. Its connector may initially expose auth/install state but mark live quota unsupported.
3. OpenCode Go documents limits and console usage but not a dedicated CLI usage command. Treat extraction as capability-dependent.
4. Codex account snapshots can omit expected windows for some accounts. Never infer absent buckets.
5. Antigravity is evolving rapidly; `/usage` shape may change. Use PTY fixtures and version diagnostics.
6. TUI automation can hang. Every connector must have a strict timeout and process cleanup.
7. Polling all providers simultaneously can create load. Stagger refresh jobs and cache results.

## 9. Final Recommended Toolchain

- Node.js active LTS
- TypeScript strict mode
- pnpm
- React + Vite
- Fastify local-only API
- SQLite
- Zod
- Commander
- node-pty where interactive TUI control is necessary
- Vitest + React Testing Library + Playwright
- Biome or ESLint/Prettier based on implementation-time compatibility
- No Docker
- No LLM calls in runtime usage collection

## 10. Sources

Accessed 2026-09-15:

1. OpenAI Codex app-server README — `account/rateLimits/read`, updates, usage: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
2. OpenAI Codex app-server protocol source: https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/account.rs
3. Kimi Code slash commands — `/usage`: https://www.kimi.com/code/docs/en/kimi-code-cli/reference/slash-commands.html
4. Kimi Code error reference — quota windows: https://www.kimi.com/code/docs/en/kimi-code/error-reference.html
5. Google Codelab — Antigravity CLI (`agy`) and `/usage`: https://codelabs.developers.google.com/sdd-agy-cli
6. Google Cloud — Antigravity surfaces: https://cloud.google.com/blog/topics/developers-practitioners/choosing-your-surface-antigravity-20-antigravity-cli-antigravity-ide-or-antigravity-sdk
7. Google Cloud MCP docs — Gemini CLI transition notice: https://docs.cloud.google.com/mcp/configure-mcp-ai-application
8. Cursor CLI reference: https://docs.cursor.com/en/cli/reference/parameters
9. Cursor authentication: https://docs.cursor.com/en/cli/reference/authentication
10. Cursor usage and limits: https://prod.cursor.com/help/models-and-usage/usage-limits
11. OpenCode Go limits: https://opencode.ai/v2/docs/console/go
12. OpenCode CLI: https://dev.opencode.ai/docs/cli/
13. OpenCode providers / Go setup: https://opencode.ai/docs/providers
