/**
 * __tests__/auth/linkedin.test.ts
 * TDD: LinkedIn OAuth + token management unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('LinkedIn Auth', () => {
  const REAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...REAL_ENV }
  })

  afterEach(() => {
    process.env = REAL_ENV
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // getAuthUrl
  // -------------------------------------------------------------------------

  it('test_getAuthUrl_returns_authorization_url_with_correct_params', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback'

    const { getAuthUrl } = await import('../../src/auth/linkedin.js')
    const url = getAuthUrl()

    expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization')
    expect(url).toContain('client_id=test-client-id')
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Flinkedin%2Fcallback')
    expect(url).toContain('response_type=code')
    expect(url).toContain('scope=')
    expect(url).toContain('state=')
  })

  it('test_getAuthUrl_includes_custom_state_when_provided', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback'

    const { getAuthUrl } = await import('../../src/auth/linkedin.js')
    const url = getAuthUrl({ state: 'my-custom-state' })

    expect(url).toContain('state=my-custom-state')
  })

  it('test_getAuthUrl_throws_when_not_configured', async () => {
    delete process.env.LINKEDIN_CLIENT_ID
    delete process.env.LINKEDIN_CLIENT_SECRET
    delete process.env.LINKEDIN_REDIRECT_URI

    const { getAuthUrl } = await import('../../src/auth/linkedin.js')
    expect(() => getAuthUrl()).toThrow()
  })

  // -------------------------------------------------------------------------
  // getAccessToken
  // -------------------------------------------------------------------------

  it('test_getAccessToken_exchanges_code_for_token', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback'

    const mockResponse = {
      access_token: 'test-access-token',
      expires_in: 5184000,
      refresh_token: 'test-refresh-token',
      scope: 'r_liteprofile w_member_social',
    }

    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getAccessToken } = await import('../../src/auth/linkedin.js')
    const result = await getAccessToken({ code: 'test-auth-code' })

    expect(result.access_token).toBe('test-access-token')
    expect(result.expires_in).toBe(5184000)
    expect(result.refresh_token).toBe('test-refresh-token')
  })

  it('test_getAccessToken_throws_on_missing_code', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback'

    const { getAccessToken } = await import('../../src/auth/linkedin.js')
    await expect(getAccessToken({ code: '' })).rejects.toThrow()
  })

  it('test_getAccessToken_throws_on_http_error', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
    process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback'

    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid_grant'),
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { getAccessToken } = await import('../../src/auth/linkedin.js')
    await expect(getAccessToken({ code: 'bad-code' })).rejects.toThrow()
  })

  // -------------------------------------------------------------------------
  // Token storage helpers
  // -------------------------------------------------------------------------

  it('test_getStoredAccessToken_returns_token_from_env', async () => {
    process.env.LINKEDIN_ACCESS_TOKEN = 'env-stored-token'
    const { getStoredAccessToken } = await import('../../src/auth/linkedin.js')
    expect(getStoredAccessToken()).toBe('env-stored-token')
  })

  it('test_getStoredAccessToken_returns_undefined_when_not_set', async () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN
    const { getStoredAccessToken } = await import('../../src/auth/linkedin.js')
    expect(getStoredAccessToken()).toBeUndefined()
  })

  it('test_getStoredOrgId_returns_org_id_from_env', async () => {
    process.env.LINKEDIN_ORG_ID = '12345678'
    const { getStoredOrgId } = await import('../../src/auth/linkedin.js')
    expect(getStoredOrgId()).toBe('12345678')
  })

  it('test_getStoredOrgId_returns_undefined_when_not_set', async () => {
    delete process.env.LINKEDIN_ORG_ID
    const { getStoredOrgId } = await import('../../src/auth/linkedin.js')
    expect(getStoredOrgId()).toBeUndefined()
  })
})
