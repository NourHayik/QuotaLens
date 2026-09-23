#!/usr/bin/env bash
# ==============================================================================
# QuotaLens One-Line Installer for macOS & Linux
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/NourHayik/QuotaLens/main/install.sh | bash
# ==============================================================================

set -e

REPO_TARBALL="https://github.com/NourHayik/QuotaLens/archive/refs/heads/main.tar.gz"
INSTALL_DIR="${QUOTALENS_DIR:-$HOME/.quotalens}"
BIN_DIR="${QUOTALENS_BIN_DIR:-$HOME/.local/bin}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==>${NC} Installing QuotaLens..."

# Check Node.js prerequisite
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is required but not found.${NC}"
  echo "Please install Node.js 22 or later (https://nodejs.org) and run this installer again."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo -e "${YELLOW}[WARNING] Node.js version $(node -v) detected. QuotaLens recommends Node.js 22+ (24+ recommended).${NC}"
fi

# Prepare target directory
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

echo -e "${BLUE}==>${NC} Downloading latest QuotaLens release without git pull..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$REPO_TARBALL" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$REPO_TARBALL" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
else
  echo -e "${RED}[ERROR] Neither curl nor wget was found. Please install curl or wget.${NC}"
  exit 1
fi

# Install dependencies and build project
echo -e "${BLUE}==>${NC} Building QuotaLens (installing dependencies & compiling)..."
cd "$INSTALL_DIR"

if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile=false --prod=false
  pnpm run build
elif command -v npm >/dev/null 2>&1; then
  npm install
  npm run build
else
  echo -e "${RED}[ERROR] npm or pnpm is required to build QuotaLens.${NC}"
  exit 1
fi

# Create global executable symlinks/wrappers in BIN_DIR
ln -sf "$INSTALL_DIR/bin/quotalens.js" "$BIN_DIR/quotalens" 2>/dev/null || {
  cat << EOF > "$BIN_DIR/quotalens"
#!/usr/bin/env bash
QUOTALENS_HOME="\${QUOTALENS_DIR:-$INSTALL_DIR}"
exec node "\$QUOTALENS_HOME/bin/quotalens.js" "\$@"
EOF
}

ln -sf "$INSTALL_DIR/bin/ai-limits.js" "$BIN_DIR/ai-limits" 2>/dev/null || {
  cat << EOF > "$BIN_DIR/ai-limits"
#!/usr/bin/env bash
QUOTALENS_HOME="\${QUOTALENS_DIR:-$INSTALL_DIR}"
exec node "\$QUOTALENS_HOME/bin/ai-limits.js" "\$@"
EOF
}

chmod +x "$BIN_DIR/quotalens" "$BIN_DIR/ai-limits"

# Check if BIN_DIR is in PATH
PATH_UPDATED=0
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  SHELL_PROFILE=""
  if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_PROFILE="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
  elif [ -f "$HOME/.profile" ]; then
    SHELL_PROFILE="$HOME/.profile"
  fi

  if [ -n "$SHELL_PROFILE" ]; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_PROFILE"
    PATH_UPDATED=1
  fi
fi

echo ""
echo -e "${GREEN}✓ QuotaLens successfully installed to $INSTALL_DIR${NC}"
echo -e "${GREEN}✓ Global CLI commands 'quotalens' and 'ai-limits' created in $BIN_DIR${NC}"
echo ""

if [ "$PATH_UPDATED" -eq 1 ]; then
  echo -e "${YELLOW}Note: Added $BIN_DIR to $SHELL_PROFILE. Run:${NC}"
  echo -e "  ${BLUE}export PATH=\"$BIN_DIR:\$PATH\"${NC} (or restart your terminal)"
  echo ""
fi

echo "Quick Start (can be run from ANY directory):"
echo "  quotalens status           # View AI subscription limits table"
echo "  quotalens status --json    # Machine-readable JSON output"
echo "  quotalens doctor           # Health check connected CLI tools"
echo "  quotalens dashboard        # Launch web UI at http://127.0.0.1:3000"
echo ""
