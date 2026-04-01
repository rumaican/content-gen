/**
 * __tests__/platforms/reelGenerator.test.ts
 * TDD: Instagram Reel Generator
 *
 * Tests focus on exported, unit-testable functions:
 *  1. ReelGeneratorError — error class
 *  2. generateCaptionAndHashtags — OpenAI caption generation (mocked OpenAI)
 *  3. publishReel — validation and API call (mocked instagram.js)
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
            mainCaption: 'Amazing reel caption! 🚀\nSave this for later!',
            hashtags: ['#reels', '#instagram', '#viral', '#fyp', '#trending'],
          }),
        },
      },
    ],
  })
)

const mockPostInstagramReel = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    containerId: 'container_abc',
    postId: 'post_xyz',
    permalink: 'https://www.instagram.com/p/reel_abc/',
  })
)

const mockUpdateVideoRecord = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

const mockExecAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ stdout: 'ffmpeg version' }))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('openai', () => ({
  default: function MockOpenAI() {
    this.chat = { completions: { create: mockOpenAIChatCreate } }
  },
}))

vi.mock('child_process', () => ({
  exec: mockExecAsync,
  promisify: () => mockExecAsync,
}))

vi.mock('fluent-ffmpeg', () => ({
  default: {
    on: vi.fn(),
    seekInput: vi.fn().mockReturnThis(),
    frames: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    noAudio: vi.fn().mockReturnThis(),
    videoCodec: vi.fn().mockReturnThis(),
    fps: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    run: vi.fn(),
  },
  ffprobe: vi.fn((path, cb) => {
    cb(null, {
      streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
      format: { duration: 120 },
    })
  }),
}))

vi.mock('../../src/lib/airtable.js', () => ({
  updateVideoRecord: mockUpdateVideoRecord,
}))

vi.mock('../../src/platforms/instagram.js', () => ({
  postInstagramReel: mockPostInstagramReel,
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
  vi.mocked(mockPostInstagramReel).mockClear()
  mockOpenAIChatCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            mainCaption: 'Amazing reel caption! 🚀\nSave this for later!',
            hashtags: ['#reels', '#instagram', '#viral', '#fyp', '#trending'],
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
// ReelGeneratorError
// ---------------------------------------------------------------------------

describe('ReelGeneratorError', () => {
  it('test_reelGeneratorError_has_correct_name_and_message', async () => {
    const { ReelGeneratorError } = await import('../../src/platforms/instagram/reelGenerator.js')
    const err = new ReelGeneratorError('Video not found')
    expect(err.name).toBe('ReelGeneratorError')
    expect(err.message).toBe('Video not found')
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// generateCaptionAndHashtags
// ---------------------------------------------------------------------------

describe('generateCaptionAndHashtags', () => {
  it('test_generateCaptionAndHashtags_returns_caption_and_hashtags', async () => {
    const { generateCaptionAndHashtags } = await import('../../src/platforms/instagram/reelGenerator.js')

    const result = await generateCaptionAndHashtags('Key insights about productivity and focus')

    expect(result.caption).toBeTruthy()
    expect(result.fullCaption).toBeTruthy()
    expect(Array.isArray(result.hashtags)).toBe(true)
    expect(result.hashtags.length).toBeGreaterThan(0)
  })

  it('test_generateCaptionAndHashtags_fullCaption_under_2200_chars', async () => {
    const { generateCaptionAndHashtags } = await import('../../src/platforms/instagram/reelGenerator.js')

    const result = await generateCaptionAndHashtags('Key insights about productivity and focus')

    expect(result.fullCaption.length).toBeLessThanOrEqual(2200)
  })

  it('test_generateCaptionAndHashtags_uses_caption_override', async () => {
    const { generateCaptionAndHashtags } = await import('../../src/platforms/instagram/reelGenerator.js')

    const result = await generateCaptionAndHashtags('Some summary', {
      captionOverride: 'My custom caption!',
      hashtagsOverride: ['#custom', '#tag'],
    })

    expect(result.caption).toBe('My custom caption!')
    expect(result.hashtags).toEqual(['#custom', '#tag'])
  })

  it('test_generateCaptionAndHashtags_generates_20_to_30_hashtags', async () => {
    mockOpenAIChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mainCaption: 'Check this out! 🚀',
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

    const { generateCaptionAndHashtags } = await import('../../src/platforms/instagram/reelGenerator.js')

    const result = await generateCaptionAndHashtags('A great topic')

    expect(result.hashtags.length).toBeGreaterThanOrEqual(20)
    expect(result.hashtags.length).toBeLessThanOrEqual(30)
  })

  it('test_generateCaptionAndHashtags_parses_json_without_markdown_fences', async () => {
    mockOpenAIChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '```json\n' +
              JSON.stringify({
                mainCaption: 'Great content!',
                hashtags: ['#test', '#reel'],
              }) +
              '\n```',
          },
        },
      ],
    })

    const { generateCaptionAndHashtags } = await import('../../src/platforms/instagram/reelGenerator.js')

    const result = await generateCaptionAndHashtags('Topic')

    expect(result.caption).toBeTruthy()
    expect(Array.isArray(result.hashtags)).toBe(true)
  })

  it('test_generateCaptionAndHashtags_throws_when_openai_unavailable', async () => {
    mockOpenAIChatCreate.mockRejectedValue(new Error('API error'))
    delete process.env.OPENAI_API_KEY

    const { generateCaptionAndHashtags } = await import('../../src/platforms/instagram/reelGenerator.js')

    await expect(generateCaptionAndHashtags('Topic')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// publishReel
// ---------------------------------------------------------------------------

describe('publishReel', () => {
  it('test_publishReel_requires_videoUrl', async () => {
    const { publishReel } = await import('../../src/platforms/instagram/reelGenerator.js')

    await expect(publishReel('Caption', '')).rejects.toThrow('videoUrl is required')
  })

  it('test_publishReel_calls_postInstagramReel', async () => {
    const { publishReel } = await import('../../src/platforms/instagram/reelGenerator.js')

    await publishReel('Check this out! #reels', 'https://cdn.example.com/video.mp4', 'https://cover.jpg')

    expect(mockPostInstagramReel).toHaveBeenCalledWith(
      'Check this out! #reels',
      'https://cdn.example.com/video.mp4',
      'https://cover.jpg'
    )
  })
})

// ---------------------------------------------------------------------------
// End of __tests__/platforms/reelGenerator.test.ts
// ---------------------------------------------------------------------------
