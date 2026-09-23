# Local operations

## Data directory

Default SQLite path: `~/.ai-limits/ai-limits.db`

Overrides:

- CLI: `ai-limits --db /path/to/ai-limits.db status --json --cached`
- Environment: `AI_LIMITS_DB_PATH`

The database may include plan names and normalized usage history. It never stores provider passwords, API keys, or OAuth tokens. Do not commit it.

## Backup

Copy the database file and WAL sidecars while the dashboard is stopped (or after a clean CLI exit):

```bash
mkdir -p ~/backups/ai-limits
cp ~/.ai-limits/ai-limits.db ~/backups/ai-limits/
cp ~/.ai-limits/ai-limits.db-wal ~/backups/ai-limits/ 2>/dev/null || true
cp ~/.ai-limits/ai-limits.db-shm ~/backups/ai-limits/ 2>/dev/null || true
```

## Restore

```bash
cp ~/backups/ai-limits/ai-limits.db ~/.ai-limits/ai-limits.db
cp ~/backups/ai-limits/ai-limits.db-wal ~/.ai-limits/ai-limits.db-wal 2>/dev/null || true
cp ~/backups/ai-limits/ai-limits.db-shm ~/.ai-limits/ai-limits.db-shm 2>/dev/null || true
ai-limits --db ~/.ai-limits/ai-limits.db status --json --cached
```

You can also open a backup copy without replacing the live file:

```bash
ai-limits --db ~/backups/ai-limits/ai-limits.db status --json --cached
```

## Logs

`ai-limits` writes structured, secret-redacted logs to stderr only. It does not persist log files, so log rotation is not used.

## Windows and WSL

Discovery uses the PATH of **this process**. A CLI installed on Windows is not assumed visible inside WSL, and a CLI installed only in WSL is not assumed visible on Windows.

Run `ai-limits doctor` in the environment where you actually use the provider CLIs. Doctor reports `runtime: wsl | win32 | linux | darwin` and PATH found/not found without dumping the full environment.

## Optional autostart

Autostart is optional and off by default. Do not enable it unless you want the dashboard running at login.

Example systemd user unit (`~/.config/systemd/user/ai-limits-dashboard.service`):

```
[Unit]
Description=AI Limits local dashboard

[Service]
ExecStart=%h/.local/share/pnpm/ai-limits dashboard --no-open --port 3000
Restart=on-failure

[Install]
WantedBy=default.target
```

Then: `systemctl --user enable --now ai-limits-dashboard.service`

On Windows, use Task Scheduler to run `ai-limits dashboard --no-open` at logon. On macOS, use a Login Item or a LaunchAgent. None of these are installed by the project.

## Dependency audit

Production gate: `pnpm run audit` (`pnpm audit --audit-level=high`).

As of 2026-09-15 the remaining findings are **moderate** in the **vitest** test runner ([GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), also reported on `@vitest/mocker`). They do not affect the `ai-limits` runtime; vitest is a devDependency and is not executed when collecting usage. Upgrade vitest when adopting the 4.x line. There are no high-severity issues in project-owned runtime dependencies.
