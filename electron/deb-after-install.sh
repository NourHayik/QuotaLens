#!/bin/bash
set -e

# Create wrapper script in /usr/bin/quotalens
cat << 'EOF' > /usr/bin/quotalens
#!/usr/bin/env bash
TARGET_EXE="/opt/QuotaLens/quotalens"
ASAR_PATH="/opt/QuotaLens/resources/app.asar"

if [ $# -eq 0 ]; then
  exec "$TARGET_EXE" "$@"
fi

if [ -f "$ASAR_PATH" ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec "$TARGET_EXE" "$ASAR_PATH/dist/cli/index.js" "$@"
else
  exec "$TARGET_EXE" --no-sandbox "$@"
fi
EOF

chmod 755 /usr/bin/quotalens
ln -sf /usr/bin/quotalens /usr/bin/ai-limits

# Also link into /usr/local/bin if present
if [ -d /usr/local/bin ]; then
  ln -sf /usr/bin/quotalens /usr/local/bin/quotalens 2>/dev/null || true
  ln -sf /usr/bin/quotalens /usr/local/bin/ai-limits 2>/dev/null || true
fi

# Refresh desktop and icon databases
if which gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi
if which update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications 2>/dev/null || true
fi
