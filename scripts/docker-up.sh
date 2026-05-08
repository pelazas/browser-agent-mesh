#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Legion Browser Agent Mesh - Docker ==="
echo ""

COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

case "${1:-up}" in
  up|start)
    echo "Starting services in background..."
    docker compose -f "$COMPOSE_FILE" up -d
    echo ""
    echo "Services running:"
    echo "  app:       http://localhost:3000"
    echo "  signaling: ws://localhost:4444"
    echo ""
    echo "Use '$0 logs' to follow logs."
    ;;
  dev)
    echo "Starting services in foreground (Ctrl+C to stop)..."
    echo "  app:       http://localhost:3000"
    echo "  signaling: ws://localhost:4444"
    echo ""
    docker compose -f "$COMPOSE_FILE" up
    ;;
  down|stop)
    echo "Stopping services..."
    docker compose -f "$COMPOSE_FILE" down
    ;;
  build)
    echo "Building services..."
    docker compose -f "$COMPOSE_FILE" build
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;
  full)
    echo "Starting full stack (with TURN)..."
    docker compose -f "$COMPOSE_FILE" --profile full up -d
    echo ""
    echo "Services running:"
    echo "  app:       http://localhost:3000"
    echo "  signaling: ws://localhost:4444"
    echo "  turn:      turn://localhost:3478"
    ;;
  *)
    echo "Usage: $0 {up|down|build|logs|dev|full}"
    echo "  up (default):  start services in background"
    echo "  dev:           start services in foreground with live logs"
    echo "  down:          stop all services"
    echo "  build:         rebuild images"
    echo "  logs:          tail service logs"
    echo "  full:          start with TURN server (NAT traversal)"
    exit 1
    ;;
esac
