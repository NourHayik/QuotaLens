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

## 🖥️ Cross-Platform Desktop App (Linux, Windows 11, macOS)

QuotaLens includes an Electron-powered native desktop application with dark glass UI, system tray integration, and auto-managed backend loopback server:

### 📦 Direct Desktop Downloads (GitHub Releases)
Official installers and bundles are available at [GitHub Releases (v1.0.0)](https://github.com/NourHayik/QuotaLens/releases/tag/v1.0.0):

| Platform | Setup / Installer (App Section) | Portable (No Install) | Embedded CLI Support |
| :--- | :--- | :--- | :--- |
| **Windows 11 / 10** | [**`QuotaLens-Setup-1.0.0.exe`**](https://github.com/NourHayik/QuotaLens/releases/download/v1.0.0/QuotaLens-Setup-1.0.0.exe) | [**`QuotaLens-Portable-1.0.0.exe`**](https://github.com/NourHayik/QuotaLens/releases/download/v1.0.0/QuotaLens-Portable-1.0.0.exe) | ✅ `quotalens` & `ai-limits` in Command Prompt / PowerShell |
| **Linux (Ubuntu/Debian)** | [**`QuotaLens-Setup-1.0.0-linux-amd64.deb`**](https://github.com/NourHayik/QuotaLens/releases/download/v1.0.0/QuotaLens-Setup-1.0.0-linux-amd64.deb) | [**`QuotaLens-Portable-1.0.0-linux-x86_64.AppImage`**](https://github.com/NourHayik/QuotaLens/releases/download/v1.0.0/QuotaLens-Portable-1.0.0-linux-x86_64.AppImage) | ✅ `/usr/bin/quotalens` & `/usr/bin/ai-limits` |
| **macOS (Universal)** | [**`QuotaLens-1.0.0-mac-x64.zip`**](https://github.com/NourHayik/QuotaLens/releases/download/v1.0.0/QuotaLens-1.0.0-mac-x64.zip) *(Drag to `/Applications`)* | Standalone `.app` bundle | ✅ `/usr/local/bin` & `~/.local/bin` |

> **🚀 Instant Global CLI via Desktop App:**
> When you install the QuotaLens Desktop App on any platform, **the command-line tools (`quotalens` and `ai-limits`) are automatically configured in your system `PATH`**!
> You **do NOT need to install Node.js, pnpm, or Python** separately — the desktop app bundles its own ultra-fast embedded runtime. Open any terminal (Command Prompt, PowerShell, Terminal, Bash, Zsh) and immediately run `quotalens status`!

```bash
# Run the desktop app locally:
pnpm run desktop

# Build for Linux (AppImage, deb, tar.gz):
pnpm run desktop:linux

# Build for Windows 11 / 10 (.exe portable & zip):
pnpm run desktop:win

# Build for macOS (Intel & Apple Silicon zip):
pnpm run desktop:mac

# Build all platforms at once:
pnpm run desktop:all
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
