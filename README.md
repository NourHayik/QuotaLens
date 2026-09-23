<p align="center">
  <img src="assets/icon.png" width="140" alt="QuotaLens Logo" style="border-radius: 24px;"/>
</p>

# QuotaLens

Local-only CLI, web dashboard, and desktop application that aggregates AI coding subscription limits from already-authenticated provider CLIs (Codex, Kimi, Google Antigravity, Cursor, OpenCode). It operates entirely locally, does not store provider credentials, and does not call AI models to collect usage.

Works seamlessly across **macOS**, **Windows**, and **Linux**. Once installed, the CLI commands can be executed **globally from ANY directory** without navigating into the project folder.

---

## ⚡ One-Line Quick Install (No Git Pull Needed)

### macOS & Linux
Run in your terminal:
```bash
curl -fsSL https://raw.githubusercontent.com/NourHayik/QuotaLens/main/install.sh | bash
```

### Windows (PowerShell)
Run in PowerShell:
```powershell
irm https://raw.githubusercontent.com/NourHayik/QuotaLens/main/install.ps1 | iex
```

### Universal (via npm)
If you already have Node.js and npm installed:
```bash
npm install -g git+https://github.com/NourHayik/QuotaLens.git
```

---

## 🖥️ Linux Desktop App (Electron)

QuotaLens includes an Electron-powered native desktop application for Linux with system tray support and a dark glass UI:

```bash
# Run the desktop app directly:
pnpm run desktop

# Build unpacked standalone Linux application (release/linux-unpacked/quotalens):
pnpm run desktop:build

# Build standalone portable Linux AppImage (release/QuotaLens-1.0.0-linux-x86_64.AppImage):
pnpm run desktop:package
```

---

## 🚀 CLI Usage (Run from Anywhere)

Both `quotalens` and `ai-limits` are available globally as identical CLI commands:

```bash
# View table of current AI usage limits
quotalens status

# Machine-readable JSON output (single clean JSON document on stdout)
quotalens status --json

# Force fresh live refresh bypassing local cache
quotalens status --json --fresh

# Instant cached read without triggering provider queries (ideal for background helpers/WhatsApp bots)
quotalens status --json --cached

# Filter status for a specific provider
quotalens status --provider codex --json

# List supported AI providers
quotalens providers

# Run system & provider diagnostic checks
quotalens doctor
quotalens doctor --json

# Launch local web dashboard (http://127.0.0.1:3000)
quotalens dashboard

# Launch dashboard on a custom port without automatically opening browser
quotalens dashboard --no-open --port 3000
```

> **Note:** You can also use `ai-limits` interchangeably with `quotalens`.

---

## 📋 Requirements

- **Node.js**: 22+ (24+ recommended)
- **Supported Platforms**: macOS, Linux, Windows (native & WSL)
- Provider CLIs installed and authenticated in your environment (e.g. `codex`, `kimi`, `agy`, `cursor-agent`, `opencode`)

---

## 💻 Manual Local Development Setup

If you prefer cloning the repository manually for development:

```bash
git clone git@github.com:NourHayik/QuotaLens.git
cd QuotaLens
pnpm install
pnpm build
pnpm link --global
quotalens doctor
```

To run tests and verify the build:
```bash
pnpm verify
```

---

## 🔒 Security & Loopback Isolation

- **Local-Only**: The HTTP dashboard binds strictly to `127.0.0.1` (loopback). It is never accessible from the local area network (LAN).
- **Zero AI-Credit Consumption**: Never consumes token quotas to determine your limits.
- **Redacted Logging**: All secrets, bearer tokens, and session keys are sanitized and redacted from stdout/stderr.
- **SQLite Database**: Stored in `~/.ai-limits/ai-limits.db` (can be overridden with `--db` or `AI_LIMITS_DB_PATH`).

---

## 📚 Documentation

- [JSON schema](docs/json-schema.md) — machine-readable `status --json` contract
- [Provider support matrix](docs/support-matrix.md) — compatibility and tested versions
- [Troubleshooting](docs/troubleshooting.md) — install/auth/timeout/parse/WSL/loopback
- [Adding a provider](docs/extending-providers.md) — adapter contract
- [Local operations](docs/operations.md) — backup/restore, Windows/WSL, optional autostart
- [Requirements traceability](docs/traceability.md) — Definition of Done evidence
