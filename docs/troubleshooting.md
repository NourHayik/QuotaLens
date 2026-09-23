# Troubleshooting

Run `ai-limits doctor` (or `ai-limits doctor --json`) first. Doctor never calls `/usage` or a model.

## Provider status meanings

| Status | Meaning | What to do |
| --- | --- | --- |
| `not_installed` | Executable not on this process PATH | Install the CLI in the **same** environment (Windows vs WSL PATH are separate). |
| `not_authenticated` | CLI is present but login is missing | Log in with that provider's own CLI. This app never takes passwords or tokens. |
| `unsupported` | Installed/auth known; no deterministic local usage surface | Expected today for Cursor and OpenCode Go. Do not use `cursor-agent -p` or `opencode run` to ask a model about quota. |
| `timeout` | Acquisition exceeded the timeout; child process was killed | Retry. Check that the CLI is not hung. Increase timeout only if you understand the cost. |
| `parse_error` | Output shape changed or could not be parsed | Last-good limits stay on screen/JSON as `stale: true`. Update the connector from a sanitized capture; never paste secrets. |
| `unavailable` | Other isolated failure | Other providers still refresh. See `errors[].message` (redacted). |
| `ok` with `stale: true` | Should not happen; stale is paired with a failed latest health | Retry Refresh. |

## WSL and Windows PATH

Discovery uses **this process** PATH only. A CLI installed on Windows is not assumed visible inside WSL, and the reverse is also true. Run `ai-limits doctor` where you actually use the tools. See [operations.md](operations.md).

## Dashboard not reachable / wrong interface

The HTTP server binds only to loopback (`127.0.0.1`). Non-loopback hosts (`0.0.0.0`, LAN IPs) are rejected. It is not reachable from other machines. Open `http://127.0.0.1:<port>` on the same host.

## Cached vs fresh JSON

- `--cached` never runs provider CLIs; it returns the last stored snapshot immediately.
- `--fresh` invokes connectors (still zero AI prompts).
- After a parse/timeout failure, JSON keeps last-good `limits` and sets `stale: true`.

## Backup and restore

Copy the SQLite file as documented in [operations.md](operations.md). Do not commit `~/.ai-limits/ai-limits.db`.

## Secrets in logs or JSON

Logs are redacted JSON lines on stderr. If you see a token, treat it as a bug: do not commit the capture. Doctor and status must never print auth-file contents.
