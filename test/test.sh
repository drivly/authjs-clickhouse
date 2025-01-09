#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Prevent errors in a pipeline from being masked

# Echo the value of GITHUB_ACTIONS for debugging
echo "GITHUB_ACTIONS is set to: $GITHUB_ACTIONS"

# Define ClickHouse connection parameters
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-28123}

# Function to check if ClickHouse is ready
check_clickhouse() {
  if [ "$GITHUB_ACTIONS" != "true" ]; then
    docker exec authjs-clickhouse-test clickhouse-client --query "SELECT 1" >/dev/null 2>&1
  else
    curl --silent --head http://localhost:${CLICKHOUSE_PORT}/ping | grep -q "200 OK"
  fi
}

# Function to apply schema using ClickHouse client
apply_schema() {
  local schema_file=$1
  echo "Applying schema..."
  if [ "$GITHUB_ACTIONS" != "true" ]; then
    docker cp "$schema_file" authjs-clickhouse-test:/tmp/schema.clickhouse.sql
    docker exec authjs-clickhouse-test clickhouse-client --multiquery --queries-file /tmp/schema.clickhouse.sql
  else
    # Create database first
    curl -X POST "http://localhost:${CLICKHOUSE_PORT}/?query=CREATE%20DATABASE%20IF%20NOT%20EXISTS%20adapter_clickhouse_test"
    
    # Then apply schema to the database
    curl -X POST "http://localhost:${CLICKHOUSE_PORT}/adapter_clickhouse_test" --data-binary @"${schema_file}"
  fi
}

if [ "$GITHUB_ACTIONS" != "true" ]; then
  # Clean up any existing container
  echo "Cleaning up any existing container..."
  docker rm -f authjs-clickhouse-test 2>/dev/null || true

  # Not running in GitHub Actions, start ClickHouse container
  echo "Starting ClickHouse container..."
  container_id=$(docker run -d --name authjs-clickhouse-test -p 28123:8123 -p 29000:9000 clickhouse/clickhouse-server:latest)
fi

# Wait for ClickHouse to be ready
echo "Waiting for ClickHouse to be ready..."
for i in {1..30}; do
  echo "Waiting for ClickHouse to become ready... ($i/30)"
  if check_clickhouse; then
    echo "ClickHouse is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ClickHouse failed to initialize"
    exit 1
  fi
  sleep 1
done

# Apply schema
apply_schema "test/schema.clickhouse.sql"

# Verify tables
echo "Verifying tables in ClickHouse..."
if [ "$GITHUB_ACTIONS" != "true" ]; then
  docker exec authjs-clickhouse-test clickhouse-client --query "SHOW DATABASES"
  docker exec authjs-clickhouse-test clickhouse-client --query "USE adapter_clickhouse_test; SHOW TABLES"
else
  # Use format=JSONEachRow for better output parsing
  curl -s "http://localhost:${CLICKHOUSE_PORT}/?query=SHOW%20DATABASES%20FORMAT%20JSONEachRow"
  echo ""
  curl -s "http://localhost:${CLICKHOUSE_PORT}/adapter_clickhouse_test?query=SHOW%20TABLES%20FORMAT%20JSONEachRow"
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
if [ "$GITHUB_ACTIONS" != "true" ]; then
  echo "Removing ClickHouse container authjs-clickhouse-test..."
  docker rm -f authjs-clickhouse-test
fi

exit $test_result
