/**
 * __tests__/platforms/linkedin.test.ts
 * TDD: LinkedIn platform posting unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LinkedInOAuthError } from '../../src/auth/linkedin.js'

describe('LinkedIn Platform', () => {
  const REAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...REAL_ENV }
    process.env.LINKEDIN_ACCESS_TOKEN = 'test-access-token'
    process.env.LINKEDIN_ORG_ID = 'test-org-id'
  })

  afterEach(() => {
    process.env = REAL_ENV
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // fetchLinkedInProfile
  // -------------------------------------------------------------------------

  it('test_fetchLinkedInProfile_returns_profile_data', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          id: '123456',
          firstName: 'Test',
          lastName: 'User',
          headline: 'Software Engineer',
          vanityName: 'testuser',
          picture: 'https://example.com/pic.jpg',
        })),
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchLinkedInProfile } = await import('../../src/platforms/linkedin.js')
    const result = await fetchLinkedInProfile()

    expect(result.id).toBe('123456')
    expect(result.firstName).toBe('Test')
    expect(result.lastName).toBe('User')
    expect(result.headline).toBe('Software Engineer')
    expect(result.vanityName).toBe('testuser')
  })

  it('test_fetchLinkedInProfile_throws_when_no_token', async () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN

    const { fetchLinkedInProfile } = await import('../../src/platforms/linkedin.js')
    await expect(fetchLinkedInProfile()).rejects.toThrow('LinkedIn access token is not set')
  })

  it('test_fetchLinkedInProfile_throws_on_api_error', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchLinkedInProfile } = await import('../../src/platforms/linkedin.js')
    await expect(fetchLinkedInProfile()).rejects.toThrow('LinkedIn API error for /me: 401 Unauthorized')
  })

  // -------------------------------------------------------------------------
  // fetchLinkedInEmail
  // -------------------------------------------------------------------------

  it('test_fetchLinkedInEmail_returns_email_address', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ emailAddress: 'test@example.com' })),
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchLinkedInEmail } = await import('../../src/platforms/linkedin.js')
    const result = await fetchLinkedInEmail()

    expect(result.emailAddress).toBe('test@example.com')
  })

  // -------------------------------------------------------------------------
  // postShare
  // -------------------------------------------------------------------------

  it('test_postShare_posts_text_to_personal_profile', async () => {
    let postedBody: unknown
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('/ugcPosts')) {
        postedBody = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'urn:li:ugcPost:123456' })),
        })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { postShare } = await import('../../src/platforms/linkedin.js')
    const result = await postShare({ text: 'Hello LinkedIn!', useOrg: false })

    expect(result.id).toBe('urn:li:ugcPost:123456')
    expect(postedBody).toMatchObject({
      lifecycleState: 'PUBLISHED',
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'CONNECTIONS',
      },
    })
  })

  it('test_postShare_posts_to_organization_when_useOrg_true', async () => {
    let postedBody: unknown
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('/ugcPosts')) {
        postedBody = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'urn:li:ugcPost:789' })),
        })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { postShare } = await import('../../src/platforms/linkedin.js')
    await postShare({ text: 'Company update!', url: 'https://example.com/article', useOrg: true })

    expect(postedBody).toMatchObject({
      author: 'urn:li:organization:test-org-id',
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    })
  })

  it('test_postShare_includes_url_as_article_media', async () => {
    let postedBody: unknown
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('/ugcPosts')) {
        postedBody = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'post-123' })),
        })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { postShare } = await import('../../src/platforms/linkedin.js')
    await postShare({ text: 'Check this out!', url: 'https://example.com/video' })

    const content = postedBody as Record<string, unknown>
    const shareContent = (content.specificContent as Record<string, unknown>)['com.linkedin.ugc.ShareContent'] as Record<string, unknown>
    expect(shareContent.shareMediaCategory).toBe('ARTICLE')
    expect((shareContent.media as unknown[])[0]).toMatchObject({
      originalUrl: 'https://example.com/video',
      status: 'READY',
    })
  })

  it('test_postShare_sets_no_media_for_text_only', async () => {
    let postedBody: unknown
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('/ugcPosts')) {
        postedBody = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'post-456' })),
        })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { postShare } = await import('../../src/platforms/linkedin.js')
    await postShare({ text: 'Text only post' })

    const content = postedBody as Record<string, unknown>
    const shareContent = (content.specificContent as Record<string, unknown>)['com.linkedin.ugc.ShareContent'] as Record<string, unknown>
    expect(shareContent.shareMediaCategory).toBe('NONE')
    expect(shareContent.media).toEqual([])
  })

  it('test_postShare_throws_when_no_token', async () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN

    const { postShare } = await import('../../src/platforms/linkedin.js')
    await expect(postShare({ text: 'Test' })).rejects.toThrow('LinkedIn access token is not set')
  })

  it('test_postShare_throws_on_api_error', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { postShare } = await import('../../src/platforms/linkedin.js')
    await expect(postShare({ text: 'Test' })).rejects.toThrow('LinkedIn API error for /ugcPosts: 500 Internal Server Error')
  })

  // -------------------------------------------------------------------------
  // postArticle
  // -------------------------------------------------------------------------

  it('test_postArticle_posts_title_and_content_with_url', async () => {
    let postedBody: unknown
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('/ugcPosts')) {
        postedBody = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'article-123' })),
        })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { postArticle } = await import('../../src/platforms/linkedin.js')
    await postArticle('My Article Title', 'Article body content here', 'https://example.com/article')

    const content = postedBody as Record<string, unknown>
    const shareContent = (content.specificContent as Record<string, unknown>)['com.linkedin.ugc.ShareContent'] as Record<string, unknown>
    expect(shareContent.shareCommentary.text).toBe('My Article Title\n\nArticle body content here')
    expect((shareContent.media as unknown[])[0]).toMatchObject({ originalUrl: 'https://example.com/article' })
  })

  // -------------------------------------------------------------------------
  // postLinkedIn (alias)
  // -------------------------------------------------------------------------

  it('test_postLinkedIn_is_alias_for_postShare', async () => {
    let postedBody: unknown
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('/ugcPosts')) {
        postedBody = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ id: 'alias-test' })),
        })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { postLinkedIn } = await import('../../src/platforms/linkedin.js')
    const result = await postLinkedIn('Quick LinkedIn post content')

    expect(result.id).toBe('alias-test')
    const content = postedBody as Record<string, unknown>
    const shareContent = (content.specificContent as Record<string, unknown>)['com.linkedin.ugc.ShareContent'] as Record<string, unknown>
    expect(shareContent.shareCommentary.text).toBe('Quick LinkedIn post content')
  })
})
