/**
 * src/auth/instagram.ts
 * Instagram OAuth 2.0 + Token Management for Meta Graph API
 *
 * Env vars:
 *   META_APP_ID              — Meta Developer App ID
 *   META_APP_SECRET          — Meta Developer App Secret
 *   META_REDIRECT_URI        — OAuth redirect URI (e.g. http://localhost:3000/auth/instagram/callback)
 *   INSTAGRAM_ACCESS_TOKEN   — Long-lived Instagram Graph API access token
 *   INSTAGRAM_ACCOUNT_ID     — Instagram Business Account ID
 */

import axios from 'axios'

const META_APP_ID = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_REDIRECT_URI = process.env.META_REDIRECT_URI
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InstagramAuthError extends Error {
  statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'InstagramAuthError'
    this.statusCode = statusCode
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

function ensureConfig(requiredVars: string[]): void {
  const missing = requiredVars.filter((v) => !process.env[v])
  if (missing.length > 0) {
    throw new ConfigurationError(
      `Instagram auth is not configured. Missing environment variables: ${missing.join(', ')}. ` +
        'Set these in your .env file.'
    )
  }
}

// ---------------------------------------------------------------------------
// OAuth 2.0 helpers
// ---------------------------------------------------------------------------

const AUTHORIZATION_URL = 'https://www.instagram.com/oauth/authorize'
const TOKEN_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token'
const GRAPH_BASE_URL = 'https://graph.instagram.com'
const GRAPH_API_BASE_URL = 'https://graph.facebook.com'

// Instagram Graph API scopes
const SCOPES = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments']
const SCOPE_STRING = SCOPES.join(',')

/**
 * Build the Instagram OAuth authorization URL.
 * Redirect the user to this URL to authorize your app.
 */
export function getAuthUrl(options: { state?: string } = {}): string {
  if (!META_APP_ID || !META_REDIRECT_URI) {
    throw new ConfigurationError(
      'Instagram OAuth is not configured. Set META_APP_ID and META_REDIRECT_URI in your .env file.'
    )
  }

  const state = options.state || crypto.randomUUID()

  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    scope: SCOPE_STRING,
    response_type: 'code',
    state,
  })

  return `${AUTHORIZATION_URL}?${params.toString()}`
}

export interface InstagramTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
  user_id?: number
}

/**
 * Exchange an authorization code for a short-lived access token.
 * Then exchange again for a long-lived token via the Graph API.
 */
export async function getAccessToken(options: { code: string }): Promise<InstagramTokenResponse> {
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
    throw new ConfigurationError(
      'Instagram OAuth is not configured. Set META_APP_ID, META_APP_SECRET, and META_REDIRECT_URI in your .env file.'
    )
  }

  if (!options.code) {
    throw new InstagramAuthError('Authorization code is required to exchange for an access token.')
  }

  // Step 1: Exchange code for short-lived token
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: META_REDIRECT_URI,
    code: options.code,
  })

  const shortLivedResponse = await axios.post<InstagramTokenResponse>(
    TOKEN_EXCHANGE_URL,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const shortLivedToken = shortLivedResponse.data.access_token

  // Step 2: Exchange short-lived for long-lived token via Graph API
  const longLivedParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID!,
    client_secret: META_APP_SECRET!,
    fb_exchange_token: shortLivedToken,
  })

  const longLivedResponse = await axios.get<InstagramTokenResponse>(
    `${GRAPH_API_BASE_URL}/oauth/access_token`,
    { params: longLivedParams }
  )

  return longLivedResponse.data
}

/**
 * Refresh a long-lived access token.
 * Long-lived tokens expire after ~60 days.
 */
export async function refreshAccessToken(token?: string): Promise<InstagramTokenResponse> {
  const accessToken = token || INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) {
    throw new ConfigurationError(
      'Instagram access token is required. Set INSTAGRAM_ACCESS_TOKEN in your .env file.'
    )
  }

  if (!META_APP_ID || !META_APP_SECRET) {
    throw new ConfigurationError(
      'Instagram OAuth is not configured. Set META_APP_ID and META_APP_SECRET in your .env file.'
    )
  }

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: accessToken,
  })

  const response = await axios.get<InstagramTokenResponse>(`${GRAPH_API_BASE_URL}/oauth/access_token`, { params })
  return response.data
}

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

export function getStoredAccessToken(): string | undefined {
  return INSTAGRAM_ACCESS_TOKEN
}

export function getStoredAccountId(): string | undefined {
  return INSTAGRAM_ACCOUNT_ID
}

// ---------------------------------------------------------------------------
// Rate limit handling with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRateLimit = err?.response?.status === 429
      if (isRateLimit && attempt < retries) {
        const backoff = delayMs * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, backoff))
        continue
      }
      throw err
    }
  }
  // Should not reach here, but satisfy TypeScript
  return fn()
}

// ---------------------------------------------------------------------------
// Account info
// ---------------------------------------------------------------------------

export interface InstagramAccountInfo {
  id: string
  username: string
  name: string
  followers_count: number
  follows_count: number
  media_count: number
  biography: string
  website: string
  profile_picture_url: string
}

/**
 * Fetch Instagram Business Account info.
 */
export async function getAccountInfo(): Promise<InstagramAccountInfo> {
  ensureConfig(['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'])

  return withRetry(async () => {
    const response = await axios.get(`${GRAPH_API_BASE_URL}/${INSTAGRAM_ACCOUNT_ID}`, {
      params: {
        fields: 'id,username,name,followers_count,follows_count,media_count,biography,website,profile_picture_url',
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
    })
    return response.data as InstagramAccountInfo
  })
}

/**
 * Create a media container (photo or video) on Instagram.
 */
export async function createMediaContainer(options: {
  imageUrl?: string
  videoUrl?: string
  caption: string
  coverUrl?: string
  mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
}): Promise<{ id: string }> {
  ensureConfig(['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'])

  const { imageUrl, videoUrl, caption, coverUrl, mediaType = imageUrl ? 'IMAGE' : 'VIDEO' } = options

  const params: Record<string, string> = {
    caption,
    access_token: INSTAGRAM_ACCESS_TOKEN!,
  }

  if (mediaType === 'IMAGE' && imageUrl) {
    params.image_url = imageUrl
    params.media_type = 'IMAGE'
  } else if (mediaType === 'VIDEO' && videoUrl) {
    params.video_url = videoUrl
    params.media_type = 'VIDEO'
    if (coverUrl) params.cover_url = coverUrl
  } else {
    throw new InstagramAuthError('Must provide either imageUrl or videoUrl.')
  }

  const response = await axios.post(`${GRAPH_API_BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/media`, null, { params })
  return { id: response.data.id }
}

/**
 * Publish a media container.
 */
export async function publishMediaContainer(containerId: string): Promise<{ id: string }> {
  ensureConfig(['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'])

  return withRetry(async () => {
    const response = await axios.post(
      `${GRAPH_API_BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: INSTAGRAM_ACCESS_TOKEN,
        },
      }
    )
    return { id: response.data.id }
  })
}

/**
 * List recent media published to the account.
 */
export async function listMedia(options: { limit?: number } = {}): Promise<any> {
  ensureConfig(['INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'])

  const params: Record<string, any> = {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    access_token: INSTAGRAM_ACCESS_TOKEN,
    limit: options.limit ?? 10,
  }

  const response = await axios.get(`${GRAPH_API_BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/media`, { params })
  return response.data
}
