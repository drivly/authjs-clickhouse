#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Prevent errors in a pipeline from being masked

# Define ClickHouse connection parameters
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-28123}

# Function to apply schema using ClickHouse client
apply_schema() {
  local schema_file=$1
  echo "Applying schema..."
  if [ -z "$GITHUB_ACTIONS" ]; then
    docker cp "$schema_file" authjs-clickhouse-test:/tmp/schema.clickhouse.sql
    docker exec authjs-clickhouse-test clickhouse-client --multiquery --queries-file /tmp/schema.clickhouse.sql
  else
    clickhouse-client --host=${CLICKHOUSE_HOST} --port=${CLICKHOUSE_PORT} --multiquery < "${schema_file}"
  fi
}

# Determine if running in GitHub Actions
if [ -z "$GITHUB_ACTIONS" ]; then
  # Clean up any existing container
  echo "Cleaning up any existing container..."
  docker rm -f authjs-clickhouse-test 2>/dev/null || true

  # Not running in GitHub Actions, start ClickHouse container
  echo "Starting ClickHouse container..."
  container_id=$(docker run -d --name authjs-clickhouse-test -p 28123:8123 -p 29000:9000 clickhouse/clickhouse-server:latest)

  # Wait for ClickHouse to initialize
  echo "Waiting for ClickHouse to initialize..."
  for i in {1..30}; do
    echo "Waiting for ClickHouse to become ready... ($i/30)"
    if docker exec authjs-clickhouse-test clickhouse-client --query "SELECT 1" >/dev/null 2>&1; then
      echo "ClickHouse is ready!"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "ClickHouse failed to initialize"
      exit 1
    fi
    sleep 1
  done
else
  # Running in GitHub Actions, ClickHouse service is already started
  echo "Waiting for ClickHouse service to initialize..."
  for i in {1..30}; do
    echo "Waiting for ClickHouse to become ready... ($i/30)"
    if clickhouse-client --host=${CLICKHOUSE_HOST} --port=${CLICKHOUSE_PORT} --query "SELECT 1" >/dev/null 2>&1; then
      echo "ClickHouse is ready!"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "ClickHouse service failed to initialize"
      exit 1
    fi
    sleep 1
  done
fi

# Apply schema
apply_schema "test/schema.clickhouse.sql"

# Verify tables
echo "Verifying tables in ClickHouse..."
if [ -z "$GITHUB_ACTIONS" ]; then
  docker exec authjs-clickhouse-test clickhouse-client --query "SHOW DATABASES"
  docker exec authjs-clickhouse-test clickhouse-client --query "USE adapter_clickhouse_test; SHOW TABLES"
else
  clickhouse-client --host=${CLICKHOUSE_HOST} --port=${CLICKHOUSE_PORT} --query "SHOW DATABASES"
  clickhouse-client --host=${CLICKHOUSE_HOST} --port=${CLICKHOUSE_PORT} --query "USE adapter_clickhouse_test; SHOW TABLES"
fi

# Run tests
echo "Running tests..."
vitest run

# Check test result
test_result=$?

echo ""
if [ $test_result -eq 0 ]; then
  echo "Tests passed!"
else
  echo "Tests failed!"
fi

# Cleanup
if [ -z "$GITHUB_ACTIONS" ]; then
  echo "Removing ClickHouse container authjs-clickhouse-test..."
  docker rm -f authjs-clickhouse-test
fi

exit $test_result
