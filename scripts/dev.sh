#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Browser Agent Mesh ==="
echo ""

case "${1:-native}" in
  docker)
    echo "Starting via docker-compose..."
    exec "$SCRIPT_DIR/docker-up.sh" dev
    ;;
  native)
    echo "[setup] Installing root dependencies..."
    (cd "$ROOT_DIR" && npm install)

    echo "[setup] Installing signaling server dependencies..."
    (cd "$ROOT_DIR/signaling-server" && npm install)

    echo "[signaling] Starting on ws://localhost:4444"
    (cd "$ROOT_DIR/signaling-server" && npm run dev) &
    SIGNALING_PID=$!

    cleanup() {
      echo ""
      echo "Shutting down..."
      kill "$SIGNALING_PID" 2>/dev/null || true
      exit 0
    }
    trap cleanup SIGINT SIGTERM

    echo "[app] Starting Vite dev server on http://localhost:5173"
    echo ""
    (cd "$ROOT_DIR" && npx vite --host)
    cleanup
    ;;
  *)
    echo "Usage: $0 [native|docker]"
    echo "  native (default): start signaling server + vite locally"
    echo "  docker:           start via docker-compose"
    exit 1
    ;;
esac
