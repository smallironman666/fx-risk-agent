#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs Foundry, initializes git submodules, and installs npm deps so that
# `forge test` / `npm run test:ts` / `npx tsc --noEmit` work out of the box.
set -euo pipefail

# Only run inside Claude Code on the web; locally the user already has their env.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[session-start] Initializing git submodules (forge-std, openzeppelin-contracts)..."
git submodule update --init --recursive

echo "[session-start] Installing Foundry (forge, cast, anvil)..."
FOUNDRY_BIN="$HOME/.foundry/bin"
mkdir -p "$FOUNDRY_BIN"
export PATH="$FOUNDRY_BIN:$PATH"

if ! command -v forge >/dev/null 2>&1; then
  # Try foundryup first (uses api.github.com, may be rate-limited).
  if [ ! -x "$FOUNDRY_BIN/foundryup" ]; then
    curl -fsSL https://foundry.paradigm.xyz | bash || true
  fi
  if "$FOUNDRY_BIN/foundryup" -i stable 2>/dev/null; then
    :
  else
    # Fallback: pinned direct download from the release CDN (bypasses api.github.com).
    FOUNDRY_VERSION="${FOUNDRY_VERSION:-v1.4.1}"
    echo "[session-start] foundryup unavailable; downloading Foundry $FOUNDRY_VERSION directly..."
    ARCH="$(uname -m)"
    case "$ARCH" in
      x86_64) FARCH="amd64" ;;
      aarch64|arm64) FARCH="arm64" ;;
      *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
    esac
    TARBALL="foundry_${FOUNDRY_VERSION}_linux_${FARCH}.tar.gz"
    URL="https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/${TARBALL}"
    curl -fsSL --retry 4 --retry-delay 2 -o "/tmp/${TARBALL}" "$URL"
    tar -xzf "/tmp/${TARBALL}" -C "$FOUNDRY_BIN"
    rm -f "/tmp/${TARBALL}"
    chmod +x "$FOUNDRY_BIN"/forge "$FOUNDRY_BIN"/cast "$FOUNDRY_BIN"/anvil "$FOUNDRY_BIN"/chisel 2>/dev/null || true
  fi
fi
forge --version

# Persist Foundry on PATH for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

echo "[session-start] Installing npm dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund

echo "[session-start] Pre-building Solidity contracts (warm forge cache)..."
"$HOME/.foundry/bin/forge" build || true

echo "[session-start] Done."
