import type { AdapterSession, VerificationToken } from '@auth/core/adapters'
import { type ClickHouseClient, createClient } from '@clickhouse/client-web'
import ClickhouseAdapter, { parseDateTimeFields } from '../src'
import { runBasicTests } from './adapter'

const POOL_SIZE = 20

const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'adapter_clickhouse_test',
  max_open_connections: POOL_SIZE,
}) satisfies ClickHouseClient

function dbHelpers() {
  return {
    // The "disconnect" method, if you want to close any connections:
    disconnect: async () => {
      await client.close()
    },

    // Return a single user row or null
    user: async (id: string) => {
      const query = await client.query({
        query: `
          SELECT id, name, email, emailVerified, image
          FROM users
          WHERE id = {id: String}
          LIMIT 1
        `,
        query_params: { id },
        format: 'JSONEachRow',
      })
      const rows = await query.json<any[]>()

      return rows.length ? parseDateTimeFields(rows[0]) : null
    },

    // Return an account row or null
    account: async (account) => {
      const { providerAccountId } = account
      const query = await client.query({
        query: `
          SELECT *
          FROM accounts
          WHERE providerAccountId = {providerAccountId: String}
          LIMIT 1
        `,
        query_params: { providerAccountId },
        format: 'JSONEachRow',
      })
      const rows = await query.json<any[]>()
      return rows.length ? parseDateTimeFields(rows[0]) : null
    },

    // Return a session row or null
    session: async (sessionToken: string) => {
      const query = await client.query({
        query: `
          SELECT * FROM sessions
          WHERE sessionToken = { sessionToken: String }
          LIMIT 1
        `,
        query_params: { sessionToken },
        format: 'JSONEachRow',
      })
      const rows = await query.json<AdapterSession>()
      return rows.length ? parseDateTimeFields(rows[0]) : null
    },

    // Return a verification token row or null
    verificationToken: async ({ identifier, token }) => {
      const query = await client.query({
        query: `
          SELECT * FROM verificationToken
          WHERE identifier = { identifier: String } AND token = { token: String }
          LIMIT 1
        `,
        query_params: { identifier, token },
        format: 'JSONEachRow',
      })
      const rows = await query.json<VerificationToken>()
      return rows.length ? parseDateTimeFields(rows[0]) : null
    },
  }
}

runBasicTests({
  adapter: ClickhouseAdapter(client),
  db: dbHelpers(),
})
