#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Legion Browser Agent Mesh - Docker ==="
echo ""

COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

case "${1:-up}" in
  up)
    echo "Starting services..."
    docker compose -f "$COMPOSE_FILE" up -d
    echo ""
    echo "Services running:"
    echo "  app:       http://localhost:3000"
    echo "  signaling: ws://localhost:4444"
    echo ""
    echo "Use 'docker compose -f $COMPOSE_FILE logs -f' to follow logs."
    ;;
  down)
    echo "Stopping services..."
    docker compose -f "$COMPOSE_FILE" down
    ;;
  build)
    echo "Building services..."
    docker compose -f "$COMPOSE_FILE" build
    ;;
  full)
    echo "Starting services (with TURN)..."
    docker compose -f "$COMPOSE_FILE" --profile full up -d
    echo ""
    echo "Services running:"
    echo "  app:       http://localhost:3000"
    echo "  signaling: ws://localhost:4444"
    echo "  turn:      turn://localhost:3478"
    ;;
  *)
    echo "Usage: $0 {up|down|build|full}"
    exit 1
    ;;
esac
