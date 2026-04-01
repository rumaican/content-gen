/**
 * LinkedIn OAuth 2.0
 *
 * Implements Authorization Code Grant flow for LinkedIn.
 * Env vars:
 *   LINKEDIN_CLIENT_ID     — OAuth app Client ID
 *   LINKEDIN_CLIENT_SECRET — OAuth app Client Secret
 *   LINKEDIN_REDIRECT_URI  — e.g. http://localhost:3000/auth/linkedin/callback
 *
 * OAuth scopes requested:
 *   r_liteprofile  — read basic profile
 *   w_member_social — post content on behalf of the user
 *   w_organization_social — post on company pages
 */

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI

// LinkedIn OAuth endpoints
const AUTHORIZATION_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

// OAuth scopes
const SCOPES = ['r_liteprofile', 'w_member_social', 'w_organization_social']
const SCOPE_STRING = SCOPES.join(' ')

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LinkedInOAuthError extends Error {
  statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'LinkedInOAuthError'
    this.statusCode = statusCode
  }
}

function ensureConfig(): void {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_REDIRECT_URI) {
    throw new LinkedInOAuthError(
      'LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI in your .env file.'
    )
  }
}

// ---------------------------------------------------------------------------
// getAuthUrl
// ---------------------------------------------------------------------------

export function getAuthUrl(options: { state?: string } = {}): string {
  ensureConfig()

  const state = options.state || crypto.randomUUID()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID!,
    redirect_uri: LINKEDIN_REDIRECT_URI!,
    scope: SCOPE_STRING,
    state,
  })

  return `${AUTHORIZATION_URL}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// getAccessToken
// ---------------------------------------------------------------------------

export interface LinkedInTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
}

export async function getAccessToken(options: { code: string; state?: string }): Promise<LinkedInTokenResponse> {
  ensureConfig()

  if (!options.code) {
    throw new LinkedInOAuthError('Authorization code is required.')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: LINKEDIN_REDIRECT_URI!,
    client_id: LINKEDIN_CLIENT_ID!,
    client_secret: LINKEDIN_CLIENT_SECRET!,
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    throw new LinkedInOAuthError(
      `Failed to exchange authorization code for access token: ${response.status} ${text}`,
      response.status
    )
  }

  const data = await response.json() as LinkedInTokenResponse
  return data
}

// ---------------------------------------------------------------------------
// Token storage helpers (env-based for simple deployments)
// ---------------------------------------------------------------------------

export function getStoredAccessToken(): string | undefined {
  return process.env.LINKEDIN_ACCESS_TOKEN
}

export function getStoredOrgId(): string | undefined {
  return process.env.LINKEDIN_ORG_ID
}
