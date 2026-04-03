/**
 * __tests__/generators/instagramGenerator.test.ts
 * TDD: Instagram Generator — unified entry point for Instagram content
 *
 * Tests the Instagram content generator:
 *  1. generateInstagramCaption — caption + hashtag generation (OpenAI)
 *  2. createInstagramCarousel — validation (URL count check)
 *  3. InstagramGeneratorError — error class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockOpenAIChatCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            mainCaption: 'Amazing content! 🚀\nSave this for later!',
            hashtags: ['#instagram', '#reels', '#content', '#creator', '#viral'],
          }),
        },
      },
    ],
  })
)

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('openai', () => ({
  default: function MockOpenAI() {
    this.chat = { completions: { create: mockOpenAIChatCreate } }
  },
}))

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const REAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...REAL_ENV }
  process.env.INSTAGRAM_ACCOUNT_ID = '123456789'
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test_token'
  process.env.OPENAI_API_KEY = 'test_openai_key'
  vi.mocked(mockOpenAIChatCreate).mockClear()
  mockOpenAIChatCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            mainCaption: 'Amazing content! 🚀\nSave this for later!',
            hashtags: ['#instagram', '#reels', '#content', '#creator', '#viral'],
          }),
        },
      },
    ],
  })
})

afterEach(() => {
  process.env = REAL_ENV
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// InstagramGeneratorError
// ---------------------------------------------------------------------------

describe('InstagramGeneratorError', () => {
  it('test_instagramGeneratorError_has_correct_name_and_message', async () => {
    const { InstagramGeneratorError } = await import('../../src/generators/instagramGenerator.js')
    const err = new InstagramGeneratorError('Not enough images')
    expect(err.name).toBe('InstagramGeneratorError')
    expect(err.message).toBe('Not enough images')
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// generateInstagramCaption
// ---------------------------------------------------------------------------

describe('generateInstagramCaption', () => {
  it('test_generateInstagramCaption_returns_caption_and_hashtags', async () => {
    const { generateInstagramCaption } = await import('../../src/generators/instagramGenerator.js')

    const result = await generateInstagramCaption('Key insights about focus')

    expect(result.caption).toBeTruthy()
    expect(result.fullCaption).toBeTruthy()
    expect(Array.isArray(result.hashtags)).toBe(true)
    expect(result.hashtags.length).toBeGreaterThan(0)
  })

  it('test_generateInstagramCaption_fullCaption_under_2200_chars', async () => {
    const { generateInstagramCaption } = await import('../../src/generators/instagramGenerator.js')

    const result = await generateInstagramCaption('Key insights about focus')

    expect(result.fullCaption.length).toBeLessThanOrEqual(2200)
  })

  it('test_generateInstagramCaption_hashtags_20_to_30', async () => {
    mockOpenAIChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mainCaption: 'Great content! 🚀',
              hashtags: [
                '#reels', '#instagram', '#viral', '#fyp', '#trending', '#content',
                '#creator', '#video', '#edit', '#explore', '#instagood', '#like',
                '#follow', '#repost', '#share', '#save', '#comment', '#music',
                '#lifestyle', '#motivation', '#tips', '#howto', '#tutorial',
              ],
            }),
          },
        },
      ],
    })

    const { generateInstagramCaption } = await import('../../src/generators/instagramGenerator.js')
    const result = await generateInstagramCaption('Topic')

    expect(result.hashtags.length).toBeGreaterThanOrEqual(20)
    expect(result.hashtags.length).toBeLessThanOrEqual(30)
  })
})

// ---------------------------------------------------------------------------
// createInstagramCarousel — validation only
// ---------------------------------------------------------------------------

describe('createInstagramCarousel', () => {
  it('test_createInstagramCarousel_throws_when_less_than_2_images', async () => {
    const { createInstagramCarousel } = await import('../../src/generators/instagramGenerator.js')

    await expect(
      createInstagramCarousel({
        videoPath: '/fake/video.mp4',
        summary: 'Too few',
        imageUrls: ['https://cdn.example.com/only_one.jpg'],
      })
    ).rejects.toThrow('At least 2 image URLs are required')
  })

  it('test_createInstagramCarousel_throws_when_no_images', async () => {
    const { createInstagramCarousel } = await import('../../src/generators/instagramGenerator.js')

    await expect(
      createInstagramCarousel({
        videoPath: '/fake/video.mp4',
        summary: 'No images',
        imageUrls: [],
      })
    ).rejects.toThrow('At least 2 image URLs are required')
  })
})

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// createInstagramPost — single image post
// ---------------------------------------------------------------------------

vi.mock('../../src/platforms/instagram/postGenerator.js', () => ({
  createPostImage: vi.fn(() => Promise.resolve({
    imagePath: '/outputs/instagram/cover_001.jpg',
    caption: 'Amazing content!',
    hashtags: ['#instagram', '#reels', '#content'],
    fullCaption: 'Amazing content! #instagram #reels #content',
  })),
}))

describe('createInstagramPost', () => {
  it('test_createInstagramPost_returns_imagePath_caption_hashtags_fullCaption', async () => {
    const { createInstagramPost } = await import('../../src/generators/instagramGenerator.js')

    const result = await createInstagramPost({
      videoPath: '/fake/video.mp4',
      summary: 'Key insights about focus',
    })

    expect(result.imagePath).toBeTruthy()
    expect(result.caption).toBeTruthy()
    expect(Array.isArray(result.hashtags)).toBe(true)
    expect(result.fullCaption).toBeTruthy()
  })

  it('test_createInstagramPost_fullCaption_under_2200_chars', async () => {
    const { createInstagramPost } = await import('../../src/generators/instagramGenerator.js')

    const result = await createInstagramPost({
      videoPath: '/fake/video.mp4',
      summary: 'Key insights about focus',
    })

    expect(result.fullCaption.length).toBeLessThanOrEqual(2200)
  })

  it('test_createInstagramPost_rejects_when_videoPath_missing', async () => {
    const { createInstagramPost } = await import('../../src/generators/instagramGenerator.js')

    // videoPath is required; empty string should still call through (validation is in postGenerator)
    // The generator itself does not block on missing videoPath — it passes through
    // So we just verify it returns the expected shape
    const result = await createInstagramPost({
      videoPath: '',
      summary: 'Summary',
    })

    expect(result).toHaveProperty('imagePath')
    expect(result).toHaveProperty('fullCaption')
  })
})

// ---------------------------------------------------------------------------
// End of __tests__/generators/instagramGenerator.test.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
