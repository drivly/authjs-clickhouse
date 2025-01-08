#!/bin/bash

# Start ClickHouse container
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

# Apply schema
echo "Applying schema..."
docker cp test/schema.clickhouse.sql authjs-clickhouse-test:/tmp/schema.clickhouse.sql
docker exec authjs-clickhouse-test clickhouse-client --multiquery --queries-file /tmp/schema.clickhouse.sql

# Verify tables
echo "Verifying tables in ClickHouse..."
docker exec authjs-clickhouse-test clickhouse-client --query "SHOW DATABASES"
docker exec authjs-clickhouse-test clickhouse-client --query "USE adapter_clickhouse_test; SHOW TABLES"

# Run tests
echo "Running tests..."
CLICKHOUSE_PORT=28123 vitest run

# Check test result
test_result=$?

echo ""
if [ $test_result -eq 0 ]; then
  echo "Tests passed!"
else
  echo "Tests failed!"
fi

# Cleanup
echo "Removing existing container authjs-clickhouse-test..."
docker rm -f authjs-clickhouse-test

exit $test_result
