#!/usr/bin/env bash

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Prevent errors in a pipeline from being masked

CONTAINER_NAME=authjs-clickhouse-test
CLICKHOUSE_DB=adapter_clickhouse_test
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123

# Function to clean up existing container
cleanup() {
  if [ "$(docker ps -a -q -f name=^/${CONTAINER_NAME}$)" ]; then
    echo "Removing existing container ${CONTAINER_NAME}..."
    docker rm -f "${CONTAINER_NAME}"
  fi
}

# Ensure cleanup happens on script exit
trap cleanup EXIT

# Start ClickHouse Docker container
echo "Starting ClickHouse container..."
docker run -d --rm \
  --name "${CONTAINER_NAME}" \
  -e CLICKHOUSE_USER=default \
  -e CLICKHOUSE_PASSWORD= \
  -p "${CLICKHOUSE_PORT}":8123 \
  --ulimit nofile=262144:262144 \
  clickhouse/clickhouse-server:latest

echo "Waiting for ClickHouse to initialize..."

# Wait until ClickHouse is ready by polling the /ping endpoint
for i in {1..30}; do
  if curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" | grep -q "Ok"; then
    echo "ClickHouse is ready!"
    break
  fi
  echo "Waiting for ClickHouse to become ready... ($i/30)"
  sleep 1
done

# Verify ClickHouse is ready
if ! curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping" | grep -q "Ok"; then
  echo "ClickHouse did not become ready in time."
  exit 1
fi

echo "Applying schema..."
# Copy the schema file into the container
docker cp ./test/schema.clickhouse.sql "${CONTAINER_NAME}":/tmp/schema.clickhouse.sql

# Execute the schema script inside the container
docker exec -i "${CONTAINER_NAME}" sh -c "clickhouse-client --multiquery < /tmp/schema.clickhouse.sql"

# Optional: Verify tables were created
echo "Verifying tables in ClickHouse..."
docker exec -i "${CONTAINER_NAME}" clickhouse-client --database="${CLICKHOUSE_DB}" --query="SHOW TABLES;"

# Export environment variables for the adapter to use
export CLICKHOUSE_URL="http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"
export CLICKHOUSE_USER="default"
export CLICKHOUSE_PASSWORD=""
export CLICKHOUSE_DB="adapter_clickhouse_test"

echo "Running tests..."
# Run Vitest tests using npx to ensure the local version is used
if npx vitest run -c ../authjs-clickhouse/vitest.config.ts; then
  echo "Tests passed!"
  exit 0
else
  echo "Tests failed!"
  exit 1
fi
