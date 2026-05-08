#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Browser Agent Mesh - Tests ==="
echo ""

case "${1:-unit}" in
  unit)
    echo "[test] Running unit tests..."
    (cd "$ROOT_DIR" && npx vitest run)
    ;;
  watch)
    echo "[test] Running tests in watch mode..."
    (cd "$ROOT_DIR" && npx vitest)
    ;;
  e2e)
    echo "[test] Running E2E tests..."
    (cd "$ROOT_DIR" && npx playwright test)
    ;;
  *)
    echo "Usage: $0 {unit|watch|e2e}"
    exit 1
    ;;
esac
