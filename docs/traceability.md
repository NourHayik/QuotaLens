# Requirements traceability

Living audit for production-readiness. Every Definition of Done item and hard constraint in `plan/requerment_en.md` maps to implementation, tests, and docs. Browser Playwright coverage was intentionally omitted; dashboard E2E is HTTP-level plus React Testing Library.

## Definition of Done (section 24)

| # | Requirement | Implementation | Tests | Docs |
| --- | --- | --- | --- | --- |
| 1 | Five priority connectors exist and honestly report available/unsupported states | `src/providers/{codex,kimi,antigravity,cursor,opencode}` registered in `src/providers/index.ts` | `tests/codex-adapter.test.ts`, `tests/kimi-adapter.test.ts`, `tests/antigravity-adapter.test.ts`, `tests/cursor-adapter.test.ts`, `tests/opencode-adapter.test.ts`, `tests/compatibility-matrix.test.ts` | `docs/support-matrix.md` |
| 2 | Codex app-server usage works with fixtures and a documented real-account path | `src/providers/codex/app-server-client.ts`, `rate-limit-mapper.ts`, `status-fallback.ts` | `tests/codex-app-server-client.test.ts`, `tests/codex-integration.test.ts`, `tests/codex-rate-limit-mapper.test.ts` | `docs/support-matrix.md` (tested 0.154.0) |
| 3 | Kimi `/usage` and Antigravity `/usage` parsers are fixture-tested | `src/providers/kimi/usage-parser.ts`, `src/providers/antigravity/usage-parser.ts` | `tests/kimi-parser.test.ts`, `tests/antigravity-parser.test.ts`, `tests/pty-integration.test.ts` | `docs/support-matrix.md` |
| 4 | Cursor and OpenCode never consume AI credits to obtain usage | Allowlists + capability probe; no `-p` / `run` | `tests/zero-llm-invariant.test.ts`, `tests/cursor-adapter.test.ts`, `tests/opencode-adapter.test.ts` | `docs/support-matrix.md`, `docs/troubleshooting.md` |
| 5 | Dashboard shows limits, reset times, health, freshness, history, refresh | `src/web/src/App.tsx`, cards/modals/hooks | `tests/web-components.test.tsx`, `tests/web-a11y.test.tsx`, `tests/e2e/dashboard-http.test.ts` | `README.md` |
| 6 | `ai-limits status --json` is stable for an external agent | `src/cli/commands/status.ts`, `src/cli/formatters/json.ts`, schema `1.0` | `tests/e2e/cli-automation-agent.test.ts`, `tests/cli-contract.test.ts` | `docs/json-schema.md` |
| 7 | No provider credentials stored or emitted | Redaction, no credential tables, allowlists | `tests/secret-leakage-and-fakes.test.ts`, `tests/e2e/cli-automation-agent.test.ts` | `docs/operations.md` |
| 8 | Manual/auto refresh with timeouts, staggering, partial isolation | `src/core/application/refresh-service.ts`, `src/web/src/hooks/useDashboard.ts` | `tests/refresh-service.test.ts`, `tests/auto-refresh.test.ts`, `tests/e2e/partial-failure-timeout.test.ts` | `docs/troubleshooting.md` |
| 9 | Unit, integration, UI, and E2E pass without real AI credits | Vitest suites; demo/fake adapters | `pnpm test` (`tests/**`, including `tests/e2e/**`) | `README.md` (`pnpm verify`) |
| 10 | Loopback-only operation and redacted logs | `src/server/loopback.ts`, `src/infra/logging/redact.ts` | `tests/server-loopback.test.ts`, `tests/e2e/dashboard-http.test.ts`, `tests/logging.test.ts` | `README.md`, `docs/troubleshooting.md`, `docs/operations.md` (audit) |
| 11 | Docs: install, support matrix, CLI, troubleshooting, add a provider | See documentation index below | Packaging smoke + this audit | `README.md`, `docs/*` |
| 12 | No unresolved in-scope placeholders or TODOs | Source sweep in Phase 9 | `rg` on `src/` / `tests/` for TODO/FIXME | this file |

## Hard constraints (section 4)

| Constraint | Implementation | Tests |
| --- | --- | --- |
| 4.1 Local-only / loopback bind | `src/server/loopback.ts`, dashboard binds `127.0.0.1` | `tests/server-loopback.test.ts`, `tests/e2e/dashboard-http.test.ts` |
| 4.2 No credential capture/storage | No secret columns; doctor/auth flags only | `tests/secret-leakage-and-fakes.test.ts` |
| 4.3 Zero runtime AI-credit parsing | Deterministic parsers + allowlists | `tests/zero-llm-invariant.test.ts` |
| 4.4 Failure honesty | Status enum; no fabricated windows | parser tests, `tests/e2e/parser-drift-recovery.test.ts` |

## CLI / API contracts (sections 10–11)

| Contract | Implementation | Tests | Docs |
| --- | --- | --- | --- |
| `status`, `--json`, `--fresh`, `--cached`, `--provider` | `src/cli/commands/status.ts` | `tests/cli-status.test.ts`, `tests/e2e/cli-automation-agent.test.ts` | `README.md`, `docs/json-schema.md` |
| Exactly one JSON document on stdout; logs on stderr | `src/cli/formatters/json.ts` | `tests/cli-contract.test.ts` | `docs/json-schema.md` |
| Exit 0 on partial provider failure | CLI + refresh isolation | `tests/cli-contract.test.ts`, `tests/e2e/partial-failure-timeout.test.ts` | `docs/json-schema.md` |
| Loopback API + SSE | `src/server/` | `tests/server-api.test.ts`, `tests/server-sse.test.ts` | `README.md` |

## Accessibility and UX (section 18)

| Requirement | Implementation | Tests |
| --- | --- | --- |
| Keyboard-accessible controls | Buttons/selects/switch; Escape closes modals; skip link | `tests/web-a11y.test.tsx` |
| Semantic status, not color alone | `Badge` text labels; progressbar `aria-*` | `tests/web-components.test.tsx` |
| Focus-visible | `.btn:focus-visible`, `.select-input:focus-visible`, skip-link | stylesheet + a11y tests |
| Responsive desktop widths | `.cards-grid` + `@media (max-width: 640px)`; header `flex-wrap` | `tests/web-a11y.test.tsx` (CSS contract) |

## Testing requirements (section 19)

| Layer | Evidence |
| --- | --- |
| Unit | domain schemas, parsers, process timeout, JSON serialization |
| Integration | fake executables/PTY, Codex mocked stdio, SQLite, local API, partial refresh |
| UI | provider cards, refresh, stale, history |
| E2E | `tests/e2e/cli-automation-agent.test.ts`, `partial-failure-timeout.test.ts`, `parser-drift-recovery.test.ts`, `dashboard-http.test.ts` (no real AI credits). Browser Playwright was omitted by request; dashboard E2E is HTTP-level plus React Testing Library. |

## Seed/demo mode (section 23)

| Fixture mode | Where |
| --- | --- |
| Healthy with multiple windows | `src/providers/demo/demo-fixtures.ts` (codex, kimi, antigravity) |
| Missing window | `missing_window` demo mode |
| Unsupported Cursor/OpenCode | default demo modes |
| Authentication failure | `not_authenticated` |
| Timeout | `timeout` |
| Parser drift | `parse_error` |

## Documentation index

- [README.md](../README.md) — install, commands, demo, verify
- [docs/json-schema.md](json-schema.md) — `status --json` schema `1.0`
- [docs/support-matrix.md](support-matrix.md) — provider compatibility
- [docs/troubleshooting.md](troubleshooting.md) — failure states and WSL/loopback
- [docs/extending-providers.md](extending-providers.md) — adapter contract
- [docs/operations.md](operations.md) — backup/restore, logs, autostart
