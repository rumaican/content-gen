/**
 * __tests__/auth/instagram.test.ts
 * TDD: Instagram OAuth + token management unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

// Mock axios globally
vi.mock('axios')

describe('Instagram Auth', () => {
  const REAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...REAL_ENV }
    // Reset mock calls between tests
    vi.mocked(axios.post).mockClear()
    vi.mocked(axios.get).mockClear()
  })

  afterEach(() => {
    process.env = REAL_ENV
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // getAccountInfo
  // -------------------------------------------------------------------------

  it('test_getAccountInfo_returns_username_and_follower_count', async () => {
    process.env.INSTAGRAM_ACCOUNT_ID = '123456789'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test_token'

    vi.mocked(axios.get).mockResolvedValue({
      data: {
        id: '123456789',
        username: 'test_user',
        name: 'Test User',
        followers_count: 1000,
        follows_count: 200,
        media_count: 50,
        biography: 'Test bio',
        website: 'https://example.com',
        profile_picture_url: 'https://example.com/pic.jpg',
      },
    })

    const { getAccountInfo } = await import('../../src/auth/instagram.js')
    const result = await getAccountInfo()

    expect(result.username).toBe('test_user')
    expect(result.followers_count).toBe(1000)
    expect(result.id).toBe('123456789')
  })

  it('test_getAccountInfo_throws_on_invalid_credentials', async () => {
    process.env.INSTAGRAM_ACCOUNT_ID = '123456789'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'bad_token'

    vi.mocked(axios.get).mockRejectedValue({
      response: { status: 401, data: { error: { message: 'Invalid token' } } },
    })

    const { getAccountInfo } = await import('../../src/auth/instagram.js')
    await expect(getAccountInfo()).rejects.toThrow()
  })

  // -------------------------------------------------------------------------
  // createMediaContainer + publishMediaContainer
  // -------------------------------------------------------------------------

  it('test_postPhoto_returns_media_container_id', async () => {
    process.env.INSTAGRAM_ACCOUNT_ID = '123456789'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test_token'

    vi.mocked(axios.post).mockResolvedValue({ data: { id: 'container_999' } })
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: 'post_123', permalink: 'https://www.instagram.com/p/post_123/' }],
      },
    })

    const { createMediaContainer, publishMediaContainer } = await import('../../src/auth/instagram.js')

    const container = await createMediaContainer({
      imageUrl: 'https://example.com/image.jpg',
      caption: 'Test caption',
      mediaType: 'IMAGE',
    })

    expect(container.id).toBe('container_999')

    const published = await publishMediaContainer('container_999')
    expect(published.id).toBe('container_999')
  })

  it('test_postReel_returns_media_container_id', async () => {
    process.env.INSTAGRAM_ACCOUNT_ID = '123456789'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test_token'

    vi.mocked(axios.post).mockResolvedValue({ data: { id: 'reel_container_888' } })
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: 'reel_456', permalink: 'https://www.instagram.com/p/reel_456/' }],
      },
    })

    const { createMediaContainer, publishMediaContainer } = await import('../../src/auth/instagram.js')

    const container = await createMediaContainer({
      videoUrl: 'https://example.com/video.mp4',
      caption: 'Reel caption',
      coverUrl: 'https://example.com/cover.jpg',
      mediaType: 'VIDEO',
    })

    expect(container.id).toBe('reel_container_888')

    const published = await publishMediaContainer('reel_container_888')
    expect(published.id).toBe('reel_container_888')
  })

  // -------------------------------------------------------------------------
  // Token helpers
  // -------------------------------------------------------------------------

  it('test_getStoredAccessToken_returns_env_value', async () => {
    process.env.INSTAGRAM_ACCESS_TOKEN = 'stored_token'
    const { getStoredAccessToken } = await import('../../src/auth/instagram.js')
    expect(getStoredAccessToken()).toBe('stored_token')
  })

  it('test_getStoredAccountId_returns_env_value', async () => {
    process.env.INSTAGRAM_ACCOUNT_ID = 'stored_account_id'
    const { getStoredAccountId } = await import('../../src/auth/instagram.js')
    expect(getStoredAccountId()).toBe('stored_account_id')
  })

  // -------------------------------------------------------------------------
  // ConfigurationError when env vars missing
  // -------------------------------------------------------------------------

  it('test_constructor_throws_ConfigurationError_when_env_vars_missing', async () => {
    delete process.env.META_APP_ID
    delete process.env.META_APP_SECRET
    delete process.env.META_REDIRECT_URI
    delete process.env.INSTAGRAM_ACCESS_TOKEN
    delete process.env.INSTAGRAM_ACCOUNT_ID

    const { getAuthUrl, ConfigurationError } = await import('../../src/auth/instagram.js')
    expect(() => getAuthUrl()).toThrow(ConfigurationError)
  })

  // -------------------------------------------------------------------------
  // Token refresh
  // -------------------------------------------------------------------------

  it('test_refreshAccessToken_succeeds_with_new_token', async () => {
    process.env.META_APP_ID = 'app_id'
    process.env.META_APP_SECRET = 'app_secret'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'old_token'

    vi.mocked(axios.get).mockResolvedValue({
      data: { access_token: 'new_long_lived_token', expires_in: 5184000 },
    })

    const { refreshAccessToken } = await import('../../src/auth/instagram.js')
    const result = await refreshAccessToken('old_token')

    expect(result.access_token).toBe('new_long_lived_token')
    expect(vi.mocked(axios.get)).toHaveBeenCalled()
  })

  it('test_getAuthUrl_returns_valid_oauth_url', async () => {
    process.env.META_APP_ID = 'my_app_id'
    process.env.META_REDIRECT_URI = 'http://localhost:3000/callback'

    const { getAuthUrl } = await import('../../src/auth/instagram.js')
    const url = getAuthUrl()
    expect(url).toContain('https://www.instagram.com/oauth/authorize')
    expect(url).toContain('client_id=my_app_id')
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback')
  })
})
