/**
 * LinkedIn Platform API
 *
 * Provides profile fetch and post functions using LinkedIn's REST API.
 * Requires a valid access token (from OAuth flow or env LINKEDIN_ACCESS_TOKEN).
 */

import { getStoredAccessToken, getStoredOrgId } from '../auth/linkedin'

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function linkedInFetch(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const accessToken = getStoredAccessToken()
  if (!accessToken) {
    throw new Error(
      'LinkedIn access token is not set. Complete the OAuth flow or set LINKEDIN_ACCESS_TOKEN in .env.'
    )
  }

  const url = endpoint.startsWith('http') ? endpoint : `${LINKEDIN_API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202304',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    throw new Error(`LinkedIn API error for ${endpoint}: ${response.status} ${text}`)
  }

  // Handle empty responses (e.g. 204 No Content)
  const text = await response.text()
  if (!text) return {}
  return JSON.parse(text)
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function fetchLinkedInProfile(): Promise<{
  id: string
  firstName?: string
  lastName?: string
  headline?: string
  vanityName?: string
  picture?: string
  email?: string
}> {
  return linkedInFetch('/me') as Promise<{
    id: string
    firstName?: string
    lastName?: string
    headline?: string
    vanityName?: string
    picture?: string
    email?: string
  }>
}

export async function fetchLinkedInEmail(): Promise<{ email: string }> {
  return linkedInFetch('/emailAddress') as Promise<{ email: string }>
}

// ---------------------------------------------------------------------------
// Post / Share
// ---------------------------------------------------------------------------

export interface PostShareOptions {
  text: string
  url?: string
  useOrg?: boolean
}

export async function postShare(options: PostShareOptions): Promise<{ id: string }> {
  const orgId = options.useOrg ? (getStoredOrgId() || process.env.LINKEDIN_ORG_ID) : undefined

  const ugcPostBody = {
    author: orgId
      ? `urn:li:organization:${orgId}`
      : `urn:li:person:${getStoredAccessToken() ? 'me' : 'UNKNOWN'}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: options.text,
        },
        shareMediaCategory: options.url ? 'ARTICLE' : 'NONE',
        media: options.url
          ? [{ status: 'READY', originalUrl: options.url }]
          : [],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': orgId ? 'PUBLIC' : 'CONNECTIONS',
    },
  }

  const result = await linkedInFetch('/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(ugcPostBody),
  }) as { id: string }

  return { id: result.id }
}

export async function postArticle(title: string, content: string, url: string): Promise<{ id: string }> {
  return postShare({ text: `${title}\n\n${content}`, url })
}

export async function postLinkedIn(content: string): Promise<{ id: string }> {
  return postShare({ text: content })
}
