#!/bin/bash
set -e

echo "Starting EventStoreDB..."
docker compose up -d

echo "Waiting for EventStoreDB..."
until curl -s http://localhost:2113/health/live > /dev/null 2>&1; do
  sleep 1
done

echo "EventStoreDB is ready!"

echo "Starting backend..."
cd backend && npm run dev &
BACKEND_PID=$!

echo "Starting frontend..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "POS System running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo "  ESDB UI:  http://localhost:2113"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID; docker compose down" EXIT
wait
