/**
 * __tests__/platforms/carouselTextOverlay.test.ts
 * TDD: Instagram Carousel Text Overlay — extractCarouselFramesWithText
 *
 * Tests the FFmpeg-powered carousel frame extraction with text overlays.
 *
 * Card: 69c9acdcf6262128052c1ee0
 * Acceptance criteria:
 *  - Carousel: creates 3-5 slides with text overlays at key moments
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CarouselSlide } from '../../src/platforms/instagram/postGenerator.js'

// ---------------------------------------------------------------------------
// Inline FFmpeg mock factory — fully self-contained (no hoisting issues)
//
// In ESM, vi.mock('x', factory) sets module 'x' to the return value of factory.
// The factory receives vitest utils. The factory MUST be callable synchronously.
// ---------------------------------------------------------------------------

vi.mock('fluent-ffmpeg', () => {
  // Build the chainable command object
  const endHandlers: Array<() => void> = []
  const errorHandlers: Array<(err: Error) => void> = []

  // All methods return `cmd` (this) to support chaining
  const cmd = {
    on: vi.fn((event: string, cb: Function) => {
      if (event === 'end') endHandlers.push(cb as () => void)
      if (event === 'error') errorHandlers.push(cb as (err: Error) => void)
      return cmd
    }),
    seekInput: vi.fn(() => cmd),
    frames: vi.fn(() => cmd),
    outputOptions: vi.fn(() => cmd),
    output: vi.fn(() => cmd),
    jpeg: vi.fn(() => cmd),
    run: vi.fn(() => {
      endHandlers.forEach((cb) => cb())
    }),
  }

  // default export: calling it returns the chainable cmd
  // Also copy cmd's methods onto the function so ffmpeg.on / ffmpeg.seekInput work too
  const defaultFn = Object.assign((_path: string) => cmd, cmd)

  return { __esModule: true, default: defaultFn }
})

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path === '/real/video.mp4'),
  promises: { mkdir: vi.fn().mockResolvedValue(undefined) },
}))

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const REAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...REAL_ENV }
})

afterEach(() => {
  process.env = REAL_ENV
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// extractCarouselFramesWithText — validation
// ---------------------------------------------------------------------------

describe('extractCarouselFramesWithText validation', () => {
  it('test_extractCarouselFramesWithText_throws_when_video_not_found', async () => {
    const { extractCarouselFramesWithText } = await import(
      '../../src/platforms/instagram/postGenerator.js'
    )

    await expect(
      extractCarouselFramesWithText({
        videoPath: '/nonexistent/video.mp4',
        slides: [
          { text: 'First insight', timestamp: 5 },
          { text: 'Second insight', timestamp: 15 },
        ],
      })
    ).rejects.toThrow('Source video not found')
  })

  it('test_extractCarouselFramesWithText_throws_when_less_than_2_slides', async () => {
    const { extractCarouselFramesWithText } = await import(
      '../../src/platforms/instagram/postGenerator.js'
    )

    await expect(
      extractCarouselFramesWithText({
        videoPath: '/real/video.mp4',
        slides: [{ text: 'Only one slide', timestamp: 5 }],
      })
    ).rejects.toThrow('At least 2 slides are required')
  })

  it('test_extractCarouselFramesWithText_throws_when_more_than_10_slides', async () => {
    const { extractCarouselFramesWithText } = await import(
      '../../src/platforms/instagram/postGenerator.js'
    )

    const tooManySlides: CarouselSlide[] = Array.from({ length: 11 }, (_, i) => ({
      text: `Slide ${i}`,
      timestamp: i * 5,
    }))

    await expect(
      extractCarouselFramesWithText({
        videoPath: '/real/video.mp4',
        slides: tooManySlides,
      })
    ).rejects.toThrow('At most 10 slides are allowed')
  })

  it('test_extractCarouselFramesWithText_enforces_min_2_max_10_range', async () => {
    const { extractCarouselFramesWithText } = await import(
      '../../src/platforms/instagram/postGenerator.js'
    )

    // Zero slides
    await expect(
      extractCarouselFramesWithText({ videoPath: '/real/video.mp4', slides: [] })
    ).rejects.toThrow('At least 2 slides are required')

    // One slide
    await expect(
      extractCarouselFramesWithText({
        videoPath: '/real/video.mp4',
        slides: [{ text: 'Only one', timestamp: 5 }],
      })
    ).rejects.toThrow('At least 2 slides are required')
  })
})

// ---------------------------------------------------------------------------
// extractCarouselFramesWithText — result shape
// ---------------------------------------------------------------------------

describe('extractCarouselFramesWithText result shape', () => {
  it('test_extractCarouselFramesWithText_returns_array_of_string_paths', async () => {
    const { extractCarouselFramesWithText } = await import(
      '../../src/platforms/instagram/postGenerator.js'
    )

    const slides: CarouselSlide[] = [
      { text: 'Slide 1', timestamp: 5 },
      { text: 'Slide 2', timestamp: 15 },
    ]

    const result = await extractCarouselFramesWithText({
      videoPath: '/real/video.mp4',
      slides,
    })

    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    result.forEach((item) => expect(typeof item).toBe('string'))
  })

  it('test_extractCarouselFramesWithText_returns_correct_number_of_paths', async () => {
    const { extractCarouselFramesWithText } = await import(
      '../../src/platforms/instagram/postGenerator.js'
    )

    const slides: CarouselSlide[] = [
      { text: 'A', timestamp: 5 },
      { text: 'B', timestamp: 15 },
      { text: 'C', timestamp: 25 },
      { text: 'D', timestamp: 35 },
      { text: 'E', timestamp: 45 },
    ]

    const result = await extractCarouselFramesWithText({
      videoPath: '/real/video.mp4',
      slides,
    })

    expect(result).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// End of __tests__/platforms/carouselTextOverlay.test.ts
// ---------------------------------------------------------------------------
