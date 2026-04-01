/**
 * __tests__/platforms/instagram.test.ts
 * TDD: Instagram platform posting unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'

vi.mock('axios')

describe('Instagram Platform', () => {
  const REAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...REAL_ENV }
    process.env.INSTAGRAM_ACCOUNT_ID = '123456789'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test_token'
    vi.mocked(axios.post).mockReset()
    vi.mocked(axios.get).mockReset()
  })

  afterEach(() => {
    process.env = REAL_ENV
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // getProfile
  // -------------------------------------------------------------------------

  it('test_getProfile_returns_account_info', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        id: '123456789',
        username: 'biz_account',
        name: 'Business Account',
        followers_count: 5000,
        follows_count: 100,
        media_count: 200,
        biography: 'Business bio',
        website: 'https://biz.com',
        profile_picture_url: 'https://biz.com/pic.jpg',
      },
    })

    const { getProfile } = await import('../../src/platforms/instagram.js')
    const result = await getProfile()

    expect(result.username).toBe('biz_account')
    expect(result.followers_count).toBe(5000)
    expect(result.id).toBe('123456789')
  })

  // -------------------------------------------------------------------------
  // postInstagramPhoto
  // -------------------------------------------------------------------------

  it('test_postInstagramPhoto_creates_and_publishes_photo', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: 'container_555' } })
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: 'post_777', permalink: 'https://www.instagram.com/p/post_777/' }],
      },
    })

    const { postInstagramPhoto } = await import('../../src/platforms/instagram.js')
    const result = await postInstagramPhoto('My photo post!', 'https://example.com/photo.jpg')

    expect(result.containerId).toBe('container_555')
    expect(result.postId).toBe('container_555')
    expect(result.permalink).toBe('https://www.instagram.com/p/post_777/')
  })

  it('test_postInstagramPhoto_throws_when_imageUrl_missing', async () => {
    const { postInstagramPhoto } = await import('../../src/platforms/instagram.js')
    await expect(postInstagramPhoto('Caption', '')).rejects.toThrow('imageUrl is required')
  })

  it('test_postInstagramPhoto_publishes_container_and_returns_permalink', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: 'container_xyz' } })
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: 'media_abc', permalink: 'https://www.instagram.com/p/media_abc/' }],
      },
    })

    const { postInstagramPhoto } = await import('../../src/platforms/instagram.js')
    const result = await postInstagramPhoto('Great photo!', 'https://cdn.example.com/img.png')

    expect(result.permalink).toContain('instagram.com')
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2) // create container + publish
  })

  // -------------------------------------------------------------------------
  // postInstagramReel
  // -------------------------------------------------------------------------

  it('test_postInstagramReel_creates_and_publishes_reel', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: 'reel_container_123' } })
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: 'reel_post_456', permalink: 'https://www.instagram.com/p/reel_post_456/' }],
      },
    })

    const { postInstagramReel } = await import('../../src/platforms/instagram.js')
    const result = await postInstagramReel(
      'Check out this reel!',
      'https://example.com/reel.mp4',
      'https://example.com/cover.jpg'
    )

    expect(result.containerId).toBe('reel_container_123')
    expect(result.postId).toBe('reel_container_123')
    expect(result.permalink).toBe('https://www.instagram.com/p/reel_post_456/')
  })

  it('test_postInstagramReel_throws_when_videoUrl_missing', async () => {
    const { postInstagramReel } = await import('../../src/platforms/instagram.js')
    await expect(postInstagramReel('Caption', '')).rejects.toThrow('videoUrl is required')
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('test_instagram_platform_error_thrown_when_credentials_missing', async () => {
    delete process.env.INSTAGRAM_ACCESS_TOKEN
    delete process.env.INSTAGRAM_ACCOUNT_ID

    const { getProfile } = await import('../../src/platforms/instagram.js')
    await expect(getProfile()).rejects.toThrow()
  })
})
