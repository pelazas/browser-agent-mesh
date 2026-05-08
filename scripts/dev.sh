#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Legion Browser Agent Mesh - Dev ==="
echo ""

SIGNALING_DIR="$ROOT_DIR/signaling-server"

if [ -f "$SIGNALING_DIR/package.json" ]; then
  echo "[signaling] Installing dependencies..."
  (cd "$SIGNALING_DIR" && npm install --silent)

  echo "[signaling] Starting on ws://localhost:4444"
  (cd "$SIGNALING_DIR" && npm run dev) &
  SIGNALING_PID=$!
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "${SIGNALING_PID:-}" ] && kill "$SIGNALING_PID" 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "[app] Starting Vite dev server..."
echo ""
(cd "$ROOT_DIR" && npx vite --host)

cleanup
