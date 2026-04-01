/**
 * Twitter OAuth 1.0a + Bearer Token initialization via twitter-api-v2.
 *
 * Env vars:
 *   TWITTER_API_KEY        — Consumer API Key
 *   TWITTER_API_SECRET     — Consumer API Secret
 *   TWITTER_ACCESS_TOKEN   — User access token
 *   TWITTER_ACCESS_SECRET  — User access token secret
 *   TWITTER_BEARER_TOKEN   — App-only Bearer Token (optional, for read-only)
 *   TWITTER_CLIENT_ID      — OAuth 2.0 Client ID (optional)
 *   TWITTER_CLIENT_SECRET  — OAuth 2.0 Client Secret (optional)
 */

import { TwitterApi, TwitterApiTokens } from 'twitter-api-v2'

const TWITTER_API_KEY = process.env.TWITTER_API_KEY
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TwitterAuthError extends Error {
  statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'TwitterAuthError'
    this.statusCode = statusCode
  }
}

function ensureConfig(): void {
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) {
    throw new TwitterAuthError(
      'Twitter OAuth is not configured. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_SECRET in your .env file.'
    )
  }
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export function getTwitterClient(): TwitterApi {
  ensureConfig()

  const tokens: TwitterApiTokens = {
    appKey: TWITTER_API_KEY!,
    appSecret: TWITTER_API_SECRET!,
    accessToken: TWITTER_ACCESS_TOKEN!,
    accessSecret: TWITTER_ACCESS_SECRET!,
  }
  return new TwitterApi(tokens)
}

/**
 * Get a read-only client using the Bearer token (app-only).
 * Falls back to user-context client if no bearer token is set.
 */
export function getTwitterReadOnlyClient(): TwitterApi {
  if (TWITTER_BEARER_TOKEN) {
    return new TwitterApi(TWITTER_BEARER_TOKEN)
  }
  return getTwitterClient()
}

// ---------------------------------------------------------------------------
// Connection verification
// ---------------------------------------------------------------------------

export async function getAccountInfo(): Promise<{ id: string; name: string; username: string; followers_count?: number }> {
  const client = getTwitterClient().readOnly
  const me = await client.v2.me({ 'user.fields': ['followers_count'] as any })
  return me.data as any
}
