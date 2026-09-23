# Adding a provider

A new provider is an adapter plus tests. Do not change dashboard cards, CLI formatting, or refresh orchestration for provider-specific logic.

## Contract

Implement `ProviderAdapter` in `src/core/application/provider-adapter.ts`:

- `id` / `displayName` — stable id, human name
- `detect` — executable present?
- `getVersion` — CLI version or `null`
- `getAuthState` — `authenticated` / `not_authenticated` / `unknown` (never secrets)
- `getCapabilities` — usage supported/unsupported and `source`
- `fetchUsage` — normalized `UsageLimit[]` from a deterministic local source
- optional `getPlanLabel` — privacy-safe plan name

Map failures to honest statuses (`not_installed`, `timeout`, `parse_error`, …). Do not invent missing windows.

## Required files

1. `src/providers/<id>/` — adapter, parser, types, **command allowlist**
2. Register in `registerDefaultProviders` in `src/providers/index.ts`
3. Fixture tests under `tests/` (healthy, missing fields, auth failure, timeout, drifted format)
4. Update `docs/support-matrix.md` after a sanitized real-CLI probe

Spawn only via `runProcess` / PTY with `assertAllowedArgs`. No shell strings. No LLM parsing. No `cursor-agent -p` / `opencode run` style model prompts.

## Capability-first providers

If the installed CLI has no local usage command, return `usage_capability: "unsupported"` with a reason. Still report install/auth. That is a successful connector, not a dashboard bug.

## UI and CLI

Overview cards, JSON, and the API read `ProviderSnapshot`. They must not import the new adapter. Demo fixtures can be extended in `src/providers/demo/` for offline review.
