/**
 * __tests__/generators/instagramCarouselSlides.test.ts
 * TDD: Instagram Carousel — slides-based creation with text overlays
 *
 * Tests createInstagramCarousel with slides parameter for text overlays.
 *
 * Card: 69c9acdcf6262128052c1ee0
 * Acceptance criteria:
 *  - Carousel: creates 3-5 slides with text overlays at key moments
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — stable references used inside vi.mock factories
// ---------------------------------------------------------------------------

const mockExtractCarouselFramesWithText = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    '/outputs/instagram/slide_text_1.jpg',
    '/outputs/instagram/slide_text_2.jpg',
    '/outputs/instagram/slide_text_3.jpg',
  ])
)

// ---------------------------------------------------------------------------
// vi.mock factories — use vi.fn() and vi.hoisted() only (no top-level refs)
// ---------------------------------------------------------------------------

vi.mock('openai', () => ({
  default: function MockOpenAI() {
    this.chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mainCaption: 'Carousel caption!',
                  hashtags: ['#carousel', '#instagram', '#reels', '#content', '#creator', '#viral'],
                }),
              },
            },
          ],
        }),
      },
    }
  },
}))

vi.mock('axios')
vi.mock('fluent-ffmpeg')

vi.mock('../../src/lib/airtable.js', () => ({
  updatePostRecord: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/platforms/instagram/postGenerator.js', () => ({
  createPostImage: vi.fn(() =>
    Promise.resolve({
      imagePath: '/outputs/instagram/post_001.jpg',
      caption: 'Carousel caption!',
      hashtags: ['#carousel', '#instagram'],
      fullCaption: 'Carousel caption! #carousel #instagram',
    })
  ),
  createCarouselPost: vi.fn(() =>
    Promise.resolve({
      postId: 'mock_post_id',
      containerId: 'mock_container_id',
      permalink: 'https://www.instagram.com/p/mock/',
    })
  ),
  extractCoverFrame: vi.fn(),
  extractCarouselFrames: vi.fn(),
  extractCarouselFramesWithText: mockExtractCarouselFramesWithText,
  generateCaptionAndHashtags: vi.fn(() =>
    Promise.resolve({
      caption: 'Carousel caption!',
      hashtags: ['#carousel', '#instagram'],
      fullCaption: 'Carousel caption! #carousel #instagram',
    })
  ),
  addHashtags: vi.fn((caption: string, tags: string[]) => `${caption} ${tags.join(' ')}`),
}))

vi.mock('../../src/platforms/instagram/reelGenerator.js', () => ({
  createReel: vi.fn(),
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
  vi.mocked(mockExtractCarouselFramesWithText).mockClear()
  vi.mocked(mockExtractCarouselFramesWithText).mockResolvedValue([
    '/outputs/instagram/slide_text_1.jpg',
    '/outputs/instagram/slide_text_2.jpg',
    '/outputs/instagram/slide_text_3.jpg',
  ])
})

afterEach(() => {
  process.env = REAL_ENV
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// createInstagramCarousel — slides parameter (text overlays)
// ---------------------------------------------------------------------------

describe('createInstagramCarousel with slides (text overlays)', () => {
  it('test_createInstagramCarousel_with_slides_calls_extractCarouselFramesWithText', async () => {
    const { createInstagramCarousel } = await import(
      '../../src/generators/instagramGenerator.js'
    )

    const slides = [
      { text: 'First insight about focus', timestamp: 5 },
      { text: 'Second insight about clarity', timestamp: 20 },
      { text: 'Third insight about action', timestamp: 40 },
    ]

    await createInstagramCarousel({
      videoPath: '/real/video.mp4',
      summary: 'Three key insights about productivity',
      slides,
    })

    expect(mockExtractCarouselFramesWithText).toHaveBeenCalledWith({
      videoPath: '/real/video.mp4',
      slides,
      outputDir: expect.any(String),
    })
  })

  it('test_createInstagramCarousel_with_slides_returns_permalink_postId_containerId', async () => {
    const { createInstagramCarousel } = await import(
      '../../src/generators/instagramGenerator.js'
    )

    const slides = [
      { text: 'Slide 1', timestamp: 5 },
      { text: 'Slide 2', timestamp: 20 },
      { text: 'Slide 3', timestamp: 40 },
    ]

    const result = await createInstagramCarousel({
      videoPath: '/real/video.mp4',
      summary: 'Three insights',
      slides,
    })

    expect(result.permalink).toBe('https://www.instagram.com/p/mock/')
    expect(result.postId).toBe('mock_post_id')
    expect(result.containerId).toBe('mock_container_id')
  })

  it('test_createInstagramCarousel_with_slides_creates_3_to_5_slides', async () => {
    const { createInstagramCarousel } = await import(
      '../../src/generators/instagramGenerator.js'
    )

    const slides = [
      { text: 'Point 1', timestamp: 5 },
      { text: 'Point 2', timestamp: 20 },
      { text: 'Point 3', timestamp: 40 },
    ]

    const result = await createInstagramCarousel({
      videoPath: '/real/video.mp4',
      summary: 'Three points',
      slides,
    })

    expect(result.postId).toBeTruthy()
    expect(mockExtractCarouselFramesWithText).toHaveBeenCalled()
    const callArg = vi.mocked(mockExtractCarouselFramesWithText).mock.calls[0][0]
    expect(callArg.slides).toHaveLength(3)
  })

  it('test_createInstagramCarousel_throws_when_extractCarouselFramesWithText_fails', async () => {
    vi.mocked(mockExtractCarouselFramesWithText).mockRejectedValue(
      new Error('FFmpeg carousel frame error: video not found')
    )

    const { createInstagramCarousel } = await import(
      '../../src/generators/instagramGenerator.js'
    )

    await expect(
      createInstagramCarousel({
        videoPath: '/nonexistent/video.mp4',
        summary: 'Test',
        slides: [
          { text: 'Slide 1', timestamp: 5 },
          { text: 'Slide 2', timestamp: 15 },
        ],
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// End of __tests__/generators/instagramCarouselSlides.test.ts
// ---------------------------------------------------------------------------
