# @drivly/authjs-clickhouse

A ClickHouse adapter for [Auth.js](https://authjs.dev) / [NextAuth.js](https://next-auth.js.org).

## Features

- Full Auth.js adapter implementation
- Works in any environment (Node.js, Edge, Cloudflare Workers)
- Uses the official ClickHouse HTTP client
- TypeScript support
- Zero dependencies (other than the ClickHouse client)

## Installation

```bash
npm install @drivly/authjs-clickhouse @clickhouse/client-web
# or
yarn add @drivly/authjs-clickhouse @clickhouse/client-web
# or
pnpm add @drivly/authjs-clickhouse @clickhouse/client-web
```

## Prerequisites

Before using this adapter, you must create the required tables in your ClickHouse database. This is a one-time setup step.

1. Copy the schema from [schema.clickhouse.sql](./test/schema.clickhouse.sql)
2. Execute the SQL statements in your ClickHouse database

The schema creates four tables:

- `users` - Stores user information
- `accounts` - Stores OAuth account information
- `sessions` - Stores user sessions
- `verificationToken` - Stores verification tokens for email verification

## Usage

```typescript
import { ClickHouseClient } from '@clickhouse/client-web'
import ClickhouseAdapter from '@drivly/authjs-clickhouse'
import NextAuth from 'next-auth'

const client = new ClickHouseClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
})

export default NextAuth({
  adapter: ClickhouseAdapter(client),
  // ... your NextAuth.js configuration
})
```

## Environment Variables

```bash
CLICKHOUSE_URL=https://your-clickhouse-host:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password
```

## Schema Details

The adapter requires four tables in your ClickHouse database. These tables must be created before using the adapter:

### Users Table

Stores user information including email, name, and profile image.

### Accounts Table

Stores OAuth account information, linking users to their OAuth providers.

### Sessions Table

Manages active user sessions.

### Verification Token Table

Handles email verification tokens.

For the complete schema definition, see [schema.clickhouse.sql](./test/schema.clickhouse.sql).

## License

MIT
