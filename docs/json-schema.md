# `ai-limits status --json` schema

Stable public contract version: **`1.0`**.

Stdout is exactly one JSON document (pretty-printed, trailing newline, no ANSI). Diagnostics go to stderr. Breaking changes require a new `schema_version`. Field additions are backward compatible.

The same document is returned by `GET /api/snapshot` and consumed by the dashboard. Zod source of truth: `src/core/domain/`.

## Top-level aggregate

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | `"1.0"` | Literal. Reject unknown versions. |
| `generated_at` | string | UTC ISO 8601 with offset |
| `fresh` | boolean | `true` when providers were invoked; `false` for `--cached` |
| `providers` | array | One entry per enabled provider (filterable with `--provider`) |

## Provider snapshot

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable id: `kimi`, `codex`, `cursor`, `opencode`, `antigravity` |
| `display_name` | string | Human label; may be overridden in settings |
| `installed` | boolean | Executable detected on PATH |
| `auth_state` | `"authenticated"` \| `"not_authenticated"` \| `"unknown"` | Never a secret |
| `usage_capability` | `"supported"` \| `"unsupported"` \| `"unknown"` | Live quota readable? |
| `status` | see below | Honest result; never invented usage |
| `source` | `"app-server"` \| `"cli-json"` \| `"cli-text"` \| `"tui-pty"` \| `"local-api"` \| `"fixture"` \| `"none"` | Acquisition method |
| `cli_version` | string? | When detectable |
| `fetched_at` | string | UTC ISO 8601 |
| `fetch_started_at` | string | UTC ISO 8601 |
| `stale` | boolean | `true` when showing last-good limits after a failed refresh |
| `plan_label` | string? | Privacy-safe plan name only |
| `limits` | array | Empty when unsupported/missing; last-good preserved when `stale` |
| `errors` | array | `{ code, message }` non-secret |

### `status` values

`ok`, `partial`, `not_installed`, `not_authenticated`, `unsupported`, `timeout`, `parse_error`, `unavailable`.

## Usage limit

Absent provider data stays absent (optional fields). Nothing is fabricated to look uniform.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable local key (`primary`, `weekly`, `gemini-flash`, …) |
| `name` | string? | Provider-native name |
| `category` | `"rolling_window"` \| `"weekly"` \| `"monthly"` \| `"credit"` \| `"model_specific"` \| `"other"` | |
| `window_minutes` | integer? | Positive |
| `used_percent` / `remaining_percent` | number? | `0`–`100` when percentage-based |
| `used_amount` / `limit_amount` / `remaining_amount` | number? | Non-negative when reported |
| `amount_unit` | `"USD"` \| `"credits"` \| `"requests"` \| `"tokens"` \| `"percent"` \| `"provider-unit"` | |
| `resets_at` | string? | UTC ISO 8601 |
| `reset_countdown_seconds` | integer? | Derived locally from `resets_at` |
| `model_id` | string? | Model-specific quotas |

## Error object

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | e.g. `timeout`, `parse_error`, `auth_required`, `usage_unsupported` |
| `message` | string | Concise, redacted |

## Agent consumption example

```bash
ai-limits status --json --cached
```

Parse stdout with a standard JSON parser. Validate `schema_version === "1.0"`. Do not parse stderr. Exit code `0` means a valid aggregate was produced even if some providers failed.

Contract tests: `tests/domain-schemas.test.ts`, `tests/cli-contract.test.ts`, `tests/e2e/cli-automation-agent.test.ts`.
