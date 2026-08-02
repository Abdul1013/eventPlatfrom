#!/bin/bash

# Load testing runner for EventTruffle Security Engine
# Usage: ./run-loadtest.sh [vus] [duration] [ramp-up]
# Example: ./run-loadtest.sh 1000 60s 30 — tests with 1000 VUs for 60 seconds, ramping up over 30 seconds

set -e

# Defaults
VUS=${1:-100}
DURATION=${2:-30s}
RAMP_UP=${3:-10}
ENGINE_URL=${SECURITY_ENGINE_URL:-http://localhost:8000}

echo "🚀 Starting load test..."
echo "  Engine URL: $ENGINE_URL"
echo "  VUs: $VUS"
echo "  Duration: $DURATION"
echo "  Ramp-up: ${RAMP_UP}s"
echo ""

# Check if security engine is running
if ! curl -s "$ENGINE_URL/health" > /dev/null 2>&1; then
  echo "❌ Error: Security engine not running at $ENGINE_URL"
  echo "   Start it with: cd apps/security-engine && python -m uvicorn main:app --reload"
  exit 1
fi

echo "✅ Security engine is running"
echo ""

# Run k6 load test
k6 run \
  -u "$VUS" \
  -d "$DURATION" \
  --env "VUS=$VUS" \
  --env "DURATION=$DURATION" \
  --env "RAMP_UP=$RAMP_UP" \
  --env "SECURITY_ENGINE_URL=$ENGINE_URL" \
  loadtest.js

echo ""
echo "✅ Load test complete"
echo "📊 Summary saved to /tmp/summary.json"
