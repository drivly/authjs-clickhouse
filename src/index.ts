/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <p>An official <a href="https://clickhouse.com/">Clickhouse</a> adapter for Auth.js / NextAuth.js.</p>
 *  <a href="https://clickhouse.com/">
 *   <img style={{display: "block"}} src="/img/adapters/pg.svg" width="48" />
 *  </a>
 * </div>
 *
 * ## Installation
 *
 * ```bash npm2yarn
 * npm install next-auth @auth/clickhouse-adapter pg
 * ```
 *
 * @module @auth/clickhouse-adapter
 */

import type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from '@auth/core/adapters'
import type { ClickHouseClient } from '@clickhouse/client-web'

const randomUUID = () => crypto.randomUUID()

/**
 * Formats a Date object into 'YYYY-MM-DD HH:MM:SS.fff' in UTC.
 * @param date - The Date object to format.
 * @returns The formatted date string.
 * @throws {Error} If the input is not a valid Date object.
 */
function formatDate(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid Date object provided to formatDate')
  }

  const pad = (n: number, width: number = 2) => n.toString().padStart(width, '0')

  const year = date.getUTCFullYear()
  const month = pad(date.getUTCMonth() + 1) // Months are zero-based
  const day = pad(date.getUTCDate())

  const hours = pad(date.getUTCHours())
  const minutes = pad(date.getUTCMinutes())
  const seconds = pad(date.getUTCSeconds())
  const milliseconds = pad(date.getUTCMilliseconds(), 3) // Ensure three digits for milliseconds

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}` // 'YYYY-MM-DD HH:MM:SS.fff'
}

/**
 * Parses date fields in a row object, converting them from strings to Date objects in UTC.
 *
 * - Also parses expires_at field from a string to a number.
 * @param row - The row object containing date fields.
 * @returns The row object with parsed date fields.
 */
export function parseDateTimeFields<T extends object>(row?: T) {
  const parsedRow = {} as {
    emailVerified?: Date
    expires?: Date
    expires_at?: number
  }

  if (row && 'emailVerified' in row && row.emailVerified && typeof row.emailVerified === 'string') {
    parsedRow.emailVerified = parseUTCDate(row.emailVerified)
    if (isNaN(parsedRow.emailVerified.getTime())) {
      console.warn(`Invalid date format for emailVerified: ${row.emailVerified}`)
      parsedRow.emailVerified = undefined
    } else {
      console.log(`Parsed emailVerified as Date object: ${parsedRow.emailVerified.toISOString()}`)
    }
  }
  if (row && 'expires' in row && row.expires && typeof row.expires === 'string') {
    parsedRow.expires = parseUTCDate(row.expires)
    if (isNaN(parsedRow.expires.getTime())) {
      console.warn(`Invalid date format for expires: ${row.expires}`)
      parsedRow.expires = undefined
    } else {
      console.log(`Parsed expires as Date object: ${parsedRow.expires.toISOString()}`)
    }
  }

  if (row && 'expires_at' in row && row.expires_at && typeof row.expires_at === 'string') {
    parsedRow.expires_at = parseInt(row.expires_at)
    if (isNaN(parsedRow.expires_at)) {
      console.warn(`Invalid date format for expires_at: ${row.expires_at}`)
      parsedRow.expires_at = undefined
    } else {
      console.log(`Parsed expires_at as number: ${parsedRow.expires_at}`)
    }
  }

  return { ...row, ...parsedRow } as T
}

/**
 * Parses a date string in the format 'YYYY-MM-DD HH:MM:SS.fff' as UTC.
 * @param dateString - The date string to parse.
 * @returns A Date object representing the UTC date and time.
 * @throws {Error} If the date string format is invalid.
 */
function parseUTCDate(dateString: string): Date {
  if (!dateString) {
    throw new Error('Date string is required')
  }

  const regex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?$/
  const match = regex.exec(dateString)
  if (!match) {
    throw new Error(`Invalid date format: ${dateString}. Expected format: YYYY-MM-DD HH:MM:SS.fff`)
  }

  const [_, year, month, day, hours, minutes, seconds, ms] = match

  // Validate date components
  const monthNum = Number(month)
  const dayNum = Number(day)
  if (monthNum < 1 || monthNum > 12) {
    throw new Error(`Invalid month: ${month}`)
  }
  if (dayNum < 1 || dayNum > 31) {
    throw new Error(`Invalid day: ${day}`)
  }

  // Correct milliseconds extraction: remove the dot and pad to three digits
  const milliseconds = ms ? Number(ms.slice(1).padEnd(3, '0')) : 0

  const date = new Date(
    Date.UTC(
      Number(year),
      monthNum - 1, // Months are zero-based in JS
      dayNum,
      Number(hours),
      Number(minutes),
      Number(seconds),
      milliseconds,
    ),
  )

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date components in string: ${dateString}`)
  }

  console.log(`Parsed date string "${dateString}" into Date: ${date.toISOString()}`)
  return date
}

/**
 * Creates an Auth.js / NextAuth.js adapter for ClickHouse.
 *
 * This adapter implements the Auth.js adapter interface for ClickHouse, providing:
 * - User management (create, read, update, delete)
 * - Session handling
 * - Account linking
 * - Verification token management
 *
 * @example
 * ```typescript
 * import { ClickHouseClient } from '@clickhouse/client-web'
 * import ClickhouseAdapter from '@drivly/clickhouse-adapter-authjs'
 *
 * const client = new ClickHouseClient({
 *   url: process.env.CLICKHOUSE_HOST,
 *   username: process.env.CLICKHOUSE_USER,
 *   password: process.env.CLICKHOUSE_PASSWORD,
 *   database: process.env.CLICKHOUSE_DB,
 * })
 *
 * // Initialize the adapter
 * const adapter = ClickhouseAdapter(client)
 *
 * // Use in Auth.js configuration
 * export default NextAuth({
 *   adapter,
 *   providers: [
 *     // ... your providers
 *   ],
 * })
 * ```
 *
 * @param client - An initialized ClickHouse client instance
 * @returns An Auth.js compatible adapter for ClickHouse
 * @throws {Error} When database operations fail or required fields are missing
 *
 * @see {@link https://authjs.dev/reference/adapters} - Auth.js Adapter Documentation
 * @see {@link https://clickhouse.com/docs/en/interfaces/http} - ClickHouse HTTP Interface
 */
export default function ClickhouseAdapter(client: ClickHouseClient): Adapter {
  if (!client) {
    throw new Error('ClickHouseClient is required')
  }

  // Test client connection
  const testConnection = async () => {
    try {
      await client.ping()
      console.log('ClickHouse connection successful')
    } catch (error) {
      throw new Error('Failed to connect to ClickHouse. Please check your client configuration.')
    }
  }

  // Attempt to connect
  testConnection()

  return {
    // ---------- VERIFICATION TOKEN METHODS ----------
    async createVerificationToken(verificationToken: VerificationToken): Promise<VerificationToken> {
      if (!verificationToken?.identifier || !verificationToken?.token) {
        throw new Error('Verification token identifier and token are required')
      }

      const { identifier, expires, token } = verificationToken

      try {
        await client.insert({
          table: 'verificationToken',
          values: [{ identifier, expires: formatDate(expires), token }],
          format: 'JSONEachRow',
        })
        return verificationToken
      } catch (error) {
        console.error('Error creating verification token:', error)
        throw new Error('Failed to create verification token')
      }
    },

    async useVerificationToken({
      identifier,
      token,
    }: {
      identifier: string
      token: string
    }): Promise<VerificationToken | null> {
      const selectQuery = `
        SELECT identifier, expires, token 
        FROM verificationToken
        WHERE identifier = { identifier: String } AND token = { token: String }
        LIMIT 1
      `

      try {
        const existing = await client.query({
          query: selectQuery,
          query_params: { identifier, token },
          format: 'JSONEachRow',
        })

        const rows = await existing.json<VerificationToken>()

        if (rows.length === 0) {
          console.warn(`No verification token found for identifier: ${identifier} and token: ${token}`)
          return null
        }

        const deleteQuery = `ALTER TABLE verificationToken DELETE WHERE identifier = { identifier: String } AND token = { token: String }`

        await client.exec({
          query: deleteQuery,
          query_params: { identifier, token },
        })

        // Force the deletion to be processed immediately
        await client.exec({ query: `OPTIMIZE TABLE verificationToken FINAL` })

        console.log(`Verification token ${token} used and deleted successfully.`)
        return parseDateTimeFields(rows[0])
      } catch (error) {
        console.error('Error using verification token:', error)
        throw error
      }
    },

    // ---------- USER METHODS ----------
    async createUser(user: Partial<AdapterUser>): Promise<AdapterUser> {
      if (!user.email) {
        throw new Error('User email is required')
      }

      const id = randomUUID()
      const { name, email, emailVerified, image } = user

      const newUser = {
        id,
        name: name || '',
        email,
        emailVerified: emailVerified ? formatDate(new Date(emailVerified)) : null,
        image: image || '',
      }

      try {
        await client.insert({
          table: 'users',
          values: [newUser],
          format: 'JSONEachRow',
        })

        return newUser as AdapterUser
      } catch (error) {
        console.error('Error creating user:', error)
        throw new Error('Failed to create user')
      }
    },
    async getUser(id: string): Promise<AdapterUser | null> {
      if (!id) {
        throw new Error('User ID is required')
      }

      try {
        const result = await client.query({
          query: `SELECT * FROM users WHERE id = { id: String } LIMIT 1`,
          query_params: { id },
          format: 'JSONEachRow',
        })

        const rows = await result.json<AdapterUser>()

        return rows.length ? parseDateTimeFields(rows[0]) : null
      } catch (error) {
        console.error(`Error retrieving user with id ${id}:`, error)
        throw new Error('Failed to retrieve user')
      }
    },
    async getUserByEmail(email: string): Promise<AdapterUser | null> {
      try {
        const result = await client.query({
          query: `SELECT * FROM users WHERE email = { email: String } LIMIT 1`,
          query_params: { email },
          format: 'JSONEachRow',
        })

        const rows = await result.json<AdapterUser>()
        return rows.length ? parseDateTimeFields(rows[0]) : null
      } catch (error) {
        console.error(`Error retrieving user by email ${email}:`, error)
        return null
      }
    },
    async getUserByAccount({ providerAccountId, provider }): Promise<AdapterUser | null> {
      const selectQuery = `
        SELECT 
          u.id AS id, 
          u.name AS name, 
          u.email AS email, 
          u.emailVerified AS emailVerified, 
          u.image AS image
        FROM accounts a
        JOIN users u ON a.userId = u.id
        WHERE a.provider = { provider: String } 
        AND a.providerAccountId = { providerAccountId: String }
        LIMIT 1
      `

      try {
        const result = await client.query({
          query: selectQuery,
          query_params: { provider, providerAccountId },
          format: 'JSONEachRow',
        })

        const rows = await result.json<AdapterUser>()
        return rows.length ? parseDateTimeFields(rows[0]) : null
      } catch (error) {
        console.error('Error getting user by account:', error)
        return null
      }
    },
    async updateUser(user: Partial<AdapterUser> & { id: string }): Promise<AdapterUser> {
      const { id } = user

      try {
        const result = await client.query({
          query: `SELECT * FROM users WHERE id = { id: String } LIMIT 1`,
          query_params: { id },
          format: 'JSONEachRow',
        })

        const rows = await result.json<AdapterUser>()
        if (rows.length === 0) {
          throw new Error(`No user found with id: ${id}`)
        }

        const existingUser = parseDateTimeFields(rows[0])
        const updatedUser = {
          ...existingUser,
          ...user,
          emailVerified: user.emailVerified ? new Date(user.emailVerified) : existingUser.emailVerified,
        }

        await client.exec({
          query: `ALTER TABLE users DELETE WHERE id = { id: String }`,
          query_params: { id },
        })

        // Force the deletion to be processed immediately
        await client.exec({ query: `OPTIMIZE TABLE users FINAL` })

        const userToInsert = {
          ...updatedUser,
          emailVerified: updatedUser.emailVerified ? formatDate(updatedUser.emailVerified) : null,
        }

        await client.insert({
          table: 'users',
          values: [userToInsert],
          format: 'JSONEachRow',
        })

        console.log('User updated successfully:', updatedUser)
        return updatedUser as AdapterUser
      } catch (error) {
        console.error('Error updating user:', error)
        throw error
      }
    },
    async deleteUser(userId: string): Promise<void> {
      try {
        await client.exec({
          query: `ALTER TABLE users DELETE WHERE id = { userId: String }`,
          query_params: { userId },
        })

        // Force the user deletion to be processed immediately
        await client.exec({
          query: `OPTIMIZE TABLE users FINAL`,
        })

        await client.exec({
          query: `ALTER TABLE sessions DELETE WHERE userId = { userId: String }`,
          query_params: { userId },
        })

        // Force the sessions deletion to be processed immediately
        await client.exec({
          query: `OPTIMIZE TABLE sessions FINAL`,
        })

        await client.exec({
          query: `ALTER TABLE accounts DELETE WHERE userId = { userId: String }`,
          query_params: { userId },
        })

        // Force the accounts deletion to be processed immediately
        await client.exec({ query: `OPTIMIZE TABLE accounts FINAL` })

        console.log(`User with id ${userId} deleted successfully.`)
      } catch (error) {
        console.error(`Error deleting user with id ${userId}:`, error)
        throw error
      }
    },

    // ---------- ACCOUNT (OAUTH) METHODS ----------
    async linkAccount(account: AdapterAccount): Promise<AdapterAccount> {
      if (!account.provider || !account.providerAccountId || !account.userId) {
        throw new Error('Provider, providerAccountId, and userId are required for account linking')
      }

      const id = randomUUID()
      const accountWithId = { ...account, id }

      try {
        await client.insert({
          table: 'accounts',
          values: [accountWithId],
          format: 'JSONEachRow',
        })

        console.log('Account linked successfully:', accountWithId)
        return parseDateTimeFields(accountWithId)
      } catch (error) {
        console.error('Error linking account:', error)
        throw new Error('Failed to link account')
      }
    },
    async unlinkAccount({ providerAccountId, provider }): Promise<void> {
      if (!providerAccountId || !provider) {
        throw new Error('Provider and providerAccountId are required for unlinking account')
      }

      try {
        const deleteQuery = `
          ALTER TABLE accounts DELETE 
          WHERE provider = { provider: String } 
          AND providerAccountId = { providerAccountId: String }
        `
        await client.exec({
          query: deleteQuery,
          query_params: { provider, providerAccountId },
        })

        // Force the deletion to be processed immediately
        await client.exec({ query: `OPTIMIZE TABLE accounts FINAL` })

        console.log(
          `Account with provider ${provider} and providerAccountId ${providerAccountId} unlinked successfully.`,
        )
      } catch (error) {
        console.error('Error unlinking account:', error)
        throw new Error('Failed to unlink account')
      }
    },

    // ---------- SESSION METHODS ----------
    async createSession({ sessionToken, userId, expires }): Promise<AdapterSession> {
      if (!sessionToken) {
        throw new Error('Session token is required')
      }
      if (!userId) {
        throw new Error('User ID is required for session creation')
      }
      if (!expires) {
        throw new Error('Session expiry is required')
      }

      const id = randomUUID()
      const session = {
        id,
        userId,
        expires: formatDate(new Date(expires)),
        sessionToken,
      }

      try {
        await client.insert({
          table: 'sessions',
          values: [session],
          format: 'JSONEachRow',
        })

        const query = await client.query({
          query: `SELECT * from sessions where id = { id: String }`,
          query_params: { id },
          format: 'JSONEachRow',
        })

        const rows = await query.json<AdapterSession>()
        if (rows.length === 0) {
          throw new Error('Failed to create session: Session not found after insertion')
        }

        return parseDateTimeFields(rows[0])
      } catch (error) {
        console.error('Error creating session:', error)
        throw new Error('Failed to create session')
      }
    },

    async getSessionAndUser(sessionToken: string | undefined): Promise<{
      session: AdapterSession
      user: AdapterUser
    } | null> {
      if (!sessionToken) {
        console.warn('Session token is required')
        return null
      }

      try {
        const sessionRes = await client.query({
          query: `SELECT * FROM sessions where sessionToken = { sessionToken: String }`,
          query_params: { sessionToken },
          format: 'JSONEachRow',
        })

        const sessionRows = await sessionRes.json<AdapterSession>()
        if (sessionRows.length === 0) {
          console.warn(`No session found with token: ${sessionToken}`)
          return null
        }

        const session: AdapterSession = parseDateTimeFields(sessionRows[0])
        if (!session.userId) {
          console.error('Session found but missing userId')
          return null
        }

        const userRes = await client.query({
          query: `SELECT * from users WHERE id = { id: String }`,
          query_params: {
            id: session.userId,
          },
          format: 'JSONEachRow',
        })

        const userRows = await userRes.json<AdapterUser>()
        if (userRows.length === 0) {
          console.error(`Session references non-existent user: ${session.userId}`)
          return null
        }

        const user = parseDateTimeFields(userRows[0])
        return { session, user }
      } catch (error) {
        console.error('Error retrieving session and user:', error)
        throw new Error('Failed to retrieve session and user')
      }
    },
    async updateSession(
      session: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>,
    ): Promise<AdapterSession | null> {
      const { sessionToken } = session
      const selRes = await client.query({
        query: `SELECT * FROM sessions WHERE sessionToken = { sessionToken: String }`,
        query_params: { sessionToken },
        format: 'JSONEachRow',
      })

      const selRows = await selRes.json<AdapterSession>()
      if (selRows.length === 0) return null

      const originalSession: AdapterSession = parseDateTimeFields(selRows[0])

      const newSession = { ...originalSession, ...session } satisfies AdapterSession

      await client.exec({
        query: `ALTER TABLE sessions DELETE WHERE sessionToken = { sessionToken: String }`,
        query_params: { sessionToken },
      })

      // Force the deletion to be processed immediately
      await client.exec({ query: `OPTIMIZE TABLE sessions FINAL` })

      await client.insert({
        table: 'sessions',
        values: [
          {
            id: randomUUID(),
            userId: newSession.userId,
            expires: newSession.expires ? formatDate(new Date(newSession.expires)) : null,
            sessionToken: newSession.sessionToken,
          },
        ],
        format: 'JSONEachRow',
      })
      const selectQuery = `SELECT * from sessions where sessionToken = { sessionToken: String } AND expires = { expires: String }`

      const sessionRes = await client.query({
        query: selectQuery,
        query_params: {
          sessionToken: newSession.sessionToken,
          expires: formatDate(new Date(newSession.expires)),
        },
        format: 'JSONEachRow',
      })

      const rows = await sessionRes.json<AdapterSession>()
      return rows.length ? parseDateTimeFields(rows[0]) : null
    },
    async deleteSession(sessionToken: string): Promise<void> {
      try {
        await client.exec({
          query: `ALTER TABLE sessions DELETE WHERE sessionToken = { sessionToken: String }`,
          query_params: { sessionToken },
        })

        // Force the deletion to be processed immediately
        await client.exec({ query: `OPTIMIZE TABLE sessions FINAL` })

        console.log(`Session with token ${sessionToken} deleted successfully.`)
      } catch (error) {
        console.error('Error deleting session:', error)
        throw error
      }
    },
  }
}
