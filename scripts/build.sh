#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Browser Agent Mesh - Build ==="
echo ""

echo "[app] Installing dependencies..."
(cd "$ROOT_DIR" && npm ci)

echo "[app] Type checking..."
(cd "$ROOT_DIR" && npx tsc --noEmit || echo "Type check warnings (non-blocking)")

echo "[app] Building..."
(cd "$ROOT_DIR" && npx vite build)

echo ""
echo "Build complete. Output in $ROOT_DIR/dist/"
