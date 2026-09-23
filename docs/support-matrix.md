# Provider support matrix

Sanitized compatibility for the five priority providers. Live versions were recorded from `ai-limits doctor --json` and `ai-limits status --json --fresh` on native Linux (x64) on 2026-09-15. Raw CLI captures, tokens, emails, and auth-file paths are not stored in the repository.

Windows/WSL PATH isolation still applies: a result on this Linux host does not imply the same binary is visible in another OS.

| Provider | ID | Executable | Acquisition | Fallback | Usage | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI Codex | `codex` | `codex` | app-server JSON-RPC `account/rateLimits/read` | deterministic `/status` text | supported | Never infers missing 5-hour or weekly buckets. Never prompts a model. |
| Kimi Code | `kimi` | `kimi` | PTY `/usage` | none | supported | Parser is fixture-driven. Unknown output is `parse_error`. |
| Gemini / Antigravity | `antigravity` | `agy` | PTY `/usage` | none | supported | Model quotas stay distinct. |
| Cursor | `cursor` | `cursor-agent` | CLI status/help probe | none | unsupported | Auth/install reported. Live quota is not exposed locally; do not use `cursor-agent -p`. |
| OpenCode Go | `opencode` | `opencode` | CLI auth list + help probe | none | unsupported | Go credential presence only. Do not use `opencode run` to ask a model about quota. |

## Tested versions (Phase 8)

Validation host: native Linux (not WSL), Node.js v26.8.2. All five CLIs were installed and authenticated. No model prompts were used.

| Provider | Tested CLI version | Validation host status |
| --- | --- | --- |
| Codex | 0.154.0 | `ok` via app-server (normalized limit buckets present) |
| Kimi | 0.43.0 | `ok` via PTY `/usage` |
| Antigravity | 1.2.3 | `ok` via PTY `/usage` (distinct model quotas) |
| Cursor | 2026.09.10-fd3934a | installed + authenticated; live quota `unsupported` |
| OpenCode Go | 1.18.27 | installed + authenticated; live Go quota `unsupported` |

Update this table after future doctor/status probes. Do not paste tokens, emails, auth-file paths, or raw TUI dumps.
