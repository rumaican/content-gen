/**
 * Twitter Platform API — post, profile, and tweet fetch.
 *
 * Provides:
 *   postTweet(text)    — post a tweet from the authenticated user
 *   getProfile()       — fetch the authenticated user's profile
 *   getMyTweets()      — fetch recent tweets from the authenticated user
 */

import { getTwitterClient } from '../auth/twitter'

const USER_CONTEXT_CONFIG_ERROR =
  'Twitter user-context client is not configured. ' +
  'Ensure TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and ' +
  'TWITTER_ACCESS_SECRET are set in your .env file.'

// ---------------------------------------------------------------------------
// postTweet
// ---------------------------------------------------------------------------

export async function postTweet(text: string): Promise<{ id: string; text: string }> {
  const client = getTwitterClient()

  if (!client) {
    throw new Error(USER_CONTEXT_CONFIG_ERROR)
  }

  const result = await client.v2.tweet(text)
  return { id: result.data.id, text: result.data.text }
}

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<{
  id: string
  name: string
  username: string
  followers_count?: number
  following_count?: number
  description?: string
}> {
  const client = getTwitterClient()

  if (!client) {
    throw new Error(USER_CONTEXT_CONFIG_ERROR)
  }

  const me = await client.v2.me({
    'user.fields': ['followers_count', 'following_count', 'description'] as any,
  })

  return me.data as any
}

// ---------------------------------------------------------------------------
// getMyTweets
// ---------------------------------------------------------------------------

export async function getMyTweets(options: { maxResults?: number } = {}): Promise<
  Array<{ id: string; text: string; created_at: string }>
> {
  const client = getTwitterClient()

  if (!client) {
    throw new Error(USER_CONTEXT_CONFIG_ERROR)
  }

  const maxResults = options.maxResults || 10

  const me = await client.v2.me()

  const tweets = await client.v2.userTimeline(me.data.id, {
    max_results: maxResults,
    'tweet.fields': ['created_at', 'text'],
    expansions: [],
  })

  const data = tweets.data
  if (!data) return []
  return (Array.isArray(data) ? data : data.data ?? []).map((tweet) => ({
    id: tweet.id,
    text: tweet.text,
    created_at: tweet.created_at!,
  }))
}
