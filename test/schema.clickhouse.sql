-- schema.clickhouse.sql
CREATE DATABASE IF NOT EXISTS adapter_clickhouse_test;

USE adapter_clickhouse_test;

CREATE TABLE IF NOT EXISTS verificationToken
(
  identifier String,
  expires DateTime64(3),
  token String
)
ENGINE = MergeTree
ORDER BY (identifier, token);

CREATE TABLE IF NOT EXISTS accounts
(
  id String,
  userId String,
  provider String,
  type String,
  providerAccountId String,
  access_token String,
  expires_at Int64 DEFAULT 0,
  refresh_token String,
  id_token String,
  scope String,
  session_state String,
  token_type String
)
ENGINE = MergeTree
ORDER BY id;

CREATE TABLE IF NOT EXISTS sessions
(
  id String,
  userId String,
  expires DateTime64(3),
  sessionToken String
)
ENGINE = MergeTree
ORDER BY id;

CREATE TABLE IF NOT EXISTS users
(
  id String,
  name String,
  email String,
  emailVerified Nullable(DateTime64(3)),
  image Nullable(String)
)
ENGINE = MergeTree
ORDER BY id;
