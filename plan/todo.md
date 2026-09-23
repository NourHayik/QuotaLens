# AI Limits Dashboard — Project Implementation TODO

## Rules
- `[ ]` means not yet verified complete.
- `[x]` means implemented and verified.
- Never check a phase before every child item and acceptance gate passes.
- If a regression appears, reopen the affected checkbox.
- Do not mark later phases complete while an earlier required phase is incomplete.
- Provider unsupported states are acceptable only when they match the documented capability rules; they must not be hidden or fabricated.

- [x] Phase 1 — Repository, Contracts, and Local Runtime Foundation
  - [x] Node.js/TypeScript/pnpm workspace and module boundaries created
  - [x] Normalized Zod/type contracts implemented
  - [x] Safe subprocess and PTY abstractions implemented
  - [x] Structured redacted logging implemented
  - [x] Unit test/lint/type-check baseline passes
  - [x] Fake provider demonstrates normalized architecture
  - [x] Phase 1 verification and acceptance criteria passed

- [x] Phase 2 — SQLite Persistence, Refresh Orchestration, and Cache Semantics
  - [x] SQLite migrations/repositories implemented
  - [x] Provider registry and settings implemented
  - [x] Bounded concurrent refresh with failure isolation implemented
  - [x] Last-good, stale, health, cached/fresh semantics implemented
  - [x] History retention/pruning implemented
  - [x] Phase 2 integration tests pass
  - [x] Phase 2 verification and acceptance criteria passed

- [x] Phase 3 — CLI Product Surface and Stable JSON Contract
  - [x] Required `ai-limits` commands implemented
  - [x] Schema-versioned `status --json` output implemented
  - [x] stdout/stderr and exit-code contracts verified
  - [x] `--fresh`, `--cached`, and provider filter implemented
  - [x] Demo/fake mode available for deterministic tests
  - [x] CLI JSON contract tests pass
  - [x] Phase 3 verification and acceptance criteria passed

- [x] Phase 4 — Codex Connector via App Server
  - [x] Codex detection/version/auth state implemented
  - [x] App-server stdio JSON-RPC client implemented
  - [x] `account/rateLimits/read` mapping implemented
  - [x] Multiple/missing quota bucket behavior verified
  - [x] Deterministic `/status` fallback implemented where applicable
  - [x] Codex fixtures and integration tests pass
  - [x] No Codex model prompt is used for usage collection
  - [x] Phase 4 verification and acceptance criteria passed

- [x] Phase 5 — Kimi and Antigravity PTY Usage Connectors
  - [x] Kimi executable/version/auth capability detection implemented
  - [x] Kimi `/usage` PTY capture and parser implemented
  - [x] Antigravity `agy` detection/version/auth capability implemented
  - [x] Antigravity `/usage` PTY capture and parser implemented
  - [x] Model-specific Antigravity limits remain distinct
  - [x] ANSI/control stripping, timeout, cleanup, and parser drift behavior verified
  - [x] Kimi/Antigravity sanitized fixture suites pass
  - [x] No AI prompt is used for usage collection
  - [x] Phase 5 verification and acceptance criteria passed

- [x] Phase 6 — Cursor and OpenCode Go Capability-Aware Connectors
  - [x] Cursor install/version/auth detection implemented
  - [x] Cursor deterministic usage capability probing implemented
  - [x] Cursor unsupported path reports honestly without AI prompt
  - [x] OpenCode install/version/auth/provider detection implemented
  - [x] OpenCode Go deterministic usage capability probing implemented
  - [x] OpenCode Go unsupported path reports honestly without AI prompt
  - [x] Secret leakage and fake executable tests pass
  - [x] Compatibility matrix metadata implemented
  - [x] Phase 6 verification and acceptance criteria passed

- [x] Phase 7 — Local API, Dashboard, History, and Auto-Refresh
  - [x] Fastify server binds only to loopback
  - [x] Validated snapshot/history/settings/refresh endpoints implemented
  - [x] SSE provider update stream implemented
  - [x] React dashboard with five priority provider cards implemented
  - [x] Manual refresh and per-provider refresh implemented
  - [x] Auto-refresh toggle, safe intervals, staggering, and cooldowns implemented
  - [x] Provider detail/history views implemented
  - [x] Unsupported/stale/error states are accessible and clear
  - [x] UI/API tests pass
  - [x] Phase 7 verification and acceptance criteria passed

- [x] Phase 8 — Diagnostics, Security Hardening, Packaging, and Real-Provider Validation
  - [x] `ai-limits doctor` completed
  - [x] Windows/WSL environment diagnostics implemented
  - [x] Secret-redaction and command-injection security review passed
  - [x] Child-process cleanup/shutdown hardening completed
  - [x] Local package/install flow verified
  - [x] Five priority providers validated or explicitly recorded unsupported on tested versions
  - [x] Sanitized compatibility/support matrix documented
  - [x] Backup/restore and local operation documentation verified
  - [x] Phase 8 verification and acceptance criteria passed

- [x] Phase 9 — Full E2E and Production-Readiness Closure
  - [x] Full requirements traceability review completed
  - [x] Unit/integration/UI/E2E suites pass
  - [x] CLI JSON automation-agent scenario passes
  - [x] Partial failure, timeout, parser drift, and recovery scenarios pass
  - [x] Zero-LLM-usage collector invariant verified
  - [x] Loopback-only exposure verified
  - [x] Dependency/security audit completed and blockers fixed
  - [x] Accessibility/responsive checks completed
  - [x] README, JSON schema, provider support matrix, troubleshooting, and extension guide completed
  - [x] Debug code/placeholders/in-scope unfinished TODOs removed
  - [x] Phase 9 verification and acceptance criteria passed

- [x] Final production-readiness / Definition-of-Done closure passed
