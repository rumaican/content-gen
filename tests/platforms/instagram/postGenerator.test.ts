/**
 * tests/platforms/instagram/postGenerator.test.ts
 * Unit tests for Instagram Post Generator
 *
 * Tests src/platforms/instagram/postGenerator.ts:
 *  - addHashtags: hashtag formatting and truncation
 *  - createPostImage: cover extraction + caption generation
 *  - createCarouselPost: carousel creation flow (mocked API)
 *
 * Card: 69c9acdcf6262128052c1ee0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Mocks — hoisted to top (ESM hoisting)
// ---------------------------------------------------------------------------

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mainCaption: 'Test caption\nwith line breaks\n\nFollow for more!',
                  hashtags: ['#test', '#instagram', '#viral', '#fyp', '#trending'],
                }),
              },
            },
          ],
        }),
      },
    };
  },
}));

// Mock axios to intercept Instagram Graph API calls
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [{ permalink: 'https://instagram.com/p/ABC123' }] } }),
    post: vi.fn().mockResolvedValue({ data: { id: 'container-123' } }),
  },
}));

vi.mock('../../../src/auth/instagram.js', () => ({
  createMediaContainer: vi.fn().mockResolvedValue({ id: 'container-123' }),
  publishMediaContainer: vi.fn().mockResolvedValue({ id: 'post-456' }),
  listMedia: vi.fn().mockResolvedValue({ data: [{ id: 'post-456', permalink: 'https://instagram.com/p/ABC123' }] }),
  getAccountInfo: vi.fn().mockResolvedValue({ instagramBusinessAccountId: 'account-123' }),
  withRetry: vi.fn((fn: Function) => fn()),
}));

vi.mock('../../../src/platforms/instagram.js', () => {
  return {
    postInstagramPhoto: vi.fn().mockResolvedValue({
      containerId: 'container-123',
      postId: 'post-456',
      permalink: 'https://instagram.com/p/ABC123',
    }),
    postInstagramReel: vi.fn().mockResolvedValue({
      containerId: 'container-123',
      postId: 'reel-456',
      permalink: 'https://instagram.com/p/ABC123',
    }),
    getProfile: vi.fn(),
    default: vi.fn(),
  };
});

vi.mock('../../../src/lib/trello.js', () => ({
  updateVideoRecord: vi.fn().mockResolvedValue(undefined),
  createVideoRecord: vi.fn().mockResolvedValue('video-record-id'),
  getPostsByVideoId: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/lib/airtable.js', () => ({
  updatePostRecord: vi.fn().mockResolvedValue(undefined),
  createPostTask: vi.fn().mockResolvedValue({ id: 'rec_test' }),
}));

vi.mock('fluent-ffmpeg', () => {
  const mockCommand = {
    input: vi.fn().mockReturnThis(),
    inputOptions: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    seekInput: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
    noAudio: vi.fn().mockReturnThis(),
    videoCodec: vi.fn().mockReturnThis(),
    fps: vi.fn().mockReturnThis(),
    frames: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (this: any, event: string, cb: Function) {
      if (event === 'end') this._endCb = cb;
      if (event === 'error') this._errorCb = cb;
      return this;
    }),
    run: vi.fn().mockImplementation(function (this: any) {
      setTimeout(() => { if (this._endCb) this._endCb(); }, 5);
    }),
  };
  const mockFfmpeg = vi.fn(() => mockCommand) as any;
  mockFfmpeg.ffprobe = vi.fn((_path: string, cb: Function) => {
    cb(null, {
      format: { duration: 120 },
      streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
    });
  });
  return { default: mockFfmpeg };
});

vi.mock('../../../src/utils/ffmpegUtils', () => ({
  ffmpegReady: vi.fn().mockResolvedValue(true),
  getVideoDuration: vi.fn().mockResolvedValue(120),
  parseSrt: vi.fn().mockReturnValue([]),
  isSrtPopulated: vi.fn().mockReturnValue(true),
  runFfmpeg: vi.fn().mockResolvedValue(undefined),
  toFfmpegColor: (hex: string) => hex,
  parseProgress: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'outputs', 'test-posts');

function createFakeVideo(filename: string): string {
  const dir = path.join(TEST_OUTPUT_DIR, 'fixtures');
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const header = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00]);
  writeFileSync(filePath, header);
  return filePath;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// Tests — addHashtags (pure function, no mocks needed)
// ---------------------------------------------------------------------------
import { addHashtags, InstagramPostGeneratorError } from '../../../src/platforms/instagram/postGenerator.js';

describe('addHashtags', () => {
  it('adds # prefix to tags without it', () => {
    const result = addHashtags('Check this out!', ['tag1', 'tag2']);
    expect(result).toContain('#tag1');
    expect(result).toContain('#tag2');
  });

  it('preserves existing # prefix', () => {
    const result = addHashtags('Check this out!', ['#already', '#hashtag']);
    expect(result).toContain('#already');
    expect(result).toContain('#hashtag');
  });

  it('adds double newline before hashtags', () => {
    const result = addHashtags('Check this out!', ['#test']);
    expect(result).toBe('Check this out!\n\n#test');
  });

  it('truncates caption if combined exceeds 2200 chars', () => {
    const longCaption = 'A'.repeat(2200);
    const manyTags = Array.from({ length: 30 }, (_, i) => `#tag${i}`);
    const result = addHashtags(longCaption, manyTags);
    expect(result.length).toBeLessThanOrEqual(2200);
    expect(result).toContain('#tag0');
  });
});

// ---------------------------------------------------------------------------
// Tests — createPostImage (uses real FFmpeg mock)
// ---------------------------------------------------------------------------
import { createPostImage } from '../../../src/platforms/instagram/postGenerator.js';

describe('createPostImage', () => {
  it('extracts a cover frame and generates caption', async () => {
    const videoPath = createFakeVideo('test-post.mp4');
    const result = await createPostImage({
      videoPath,
      summary: 'This is a test video about productivity',
    });

    expect(result.imagePath).toBeTruthy();
    expect(result.imagePath.endsWith('.jpg')).toBe(true);
    expect(result.caption).toBeTruthy();
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(result.hashtags.length).toBeGreaterThan(0);
    expect(result.fullCaption).toContain(result.caption);
  });

  it('uses caption override when provided', async () => {
    const videoPath = createFakeVideo('test-override.mp4');
    const result = await createPostImage({
      videoPath,
      summary: 'Test summary',
      captionOverride: 'My custom caption',
    });

    expect(result.caption).toContain('My custom caption');
  });

  it('uses hashtags override when provided', async () => {
    const videoPath = createFakeVideo('test-tags-override.mp4');
    const result = await createPostImage({
      videoPath,
      summary: 'Test summary',
      hashtagsOverride: ['#custom', '#tag'],
    });

    expect(result.hashtags).toEqual(['#custom', '#tag']);
  });

  it('generates 5-20 hashtags from transcript', async () => {
    const videoPath = createFakeVideo('test-hashtags.mp4');
    const result = await createPostImage({
      videoPath,
      summary: 'This is a test video about productivity, success, and mindset',
    });

    // Spec acceptance criteria: 5-20 hashtags
    expect(result.hashtags.length).toBeGreaterThanOrEqual(5);
    expect(result.hashtags.length).toBeLessThanOrEqual(20);
    expect(result.hashtags[0]).toMatch(/^#./);
  });
});

// ---------------------------------------------------------------------------
// Tests — createCarouselPost (env vars + fresh module needed)
// Uses dynamic import to get fresh module with env vars set
// ---------------------------------------------------------------------------
describe('createCarouselPost', () => {
  beforeEach(() => {
    process.env.INSTAGRAM_ACCOUNT_ID = 'test-account-id';
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test-access-token';
  });

  afterEach(() => {
    delete process.env.INSTAGRAM_ACCOUNT_ID;
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
  });

  it('creates carousel container with multiple images', async () => {
    vi.resetModules();
    const { createCarouselPost: freshCarousel } = await import('../../../src/platforms/instagram/postGenerator.js');

    const result = await freshCarousel({
      videoPath: '/fake/video.mp4',
      summary: 'Test carousel content',
      imageUrls: [
        'https://example.com/slide1.jpg',
        'https://example.com/slide2.jpg',
        'https://example.com/slide3.jpg',
      ],
    });

    expect(result.postId).toBeTruthy();
    expect(result.containerId).toBeTruthy();
    expect(result.permalink).toBeTruthy();
    expect(result.permalink).toContain('instagram.com');
  });

  it('throws InstagramPostGeneratorError when fewer than 2 images provided', async () => {
    vi.resetModules();
    const { createCarouselPost: freshCarousel } = await import('../../../src/platforms/instagram/postGenerator.js');

    await expect(
      freshCarousel({
        videoPath: '/fake/video.mp4',
        summary: 'Test',
        imageUrls: ['https://example.com/only-one.jpg'],
      })
    ).rejects.toThrow('At least 2 image URLs are required for a carousel');
  });

  it('throws InstagramPostGeneratorError when more than 10 images provided', async () => {
    vi.resetModules();
    const { createCarouselPost: freshCarousel } = await import('../../../src/platforms/instagram/postGenerator.js');

    const tooMany = Array.from({ length: 11 }, (_, i) => `https://example.com/slide${i}.jpg`);
    await expect(
      freshCarousel({
        videoPath: '/fake/video.mp4',
        summary: 'Test',
        imageUrls: tooMany,
      })
    ).rejects.toThrow('At most 10 images are allowed for a carousel');
  });

  it('respects caption override', async () => {
    vi.resetModules();
    const { createCarouselPost: freshCarousel } = await import('../../../src/platforms/instagram/postGenerator.js');
    const axios = (await import('axios')).default;

    await freshCarousel({
      videoPath: '/fake/video.mp4',
      summary: 'Test carousel',
      imageUrls: ['https://example.com/slide1.jpg', 'https://example.com/slide2.jpg'],
      captionOverride: 'Custom carousel caption',
    });

    // Verify axios.post was called with the override caption
    expect(axios.post).toHaveBeenCalled();
    const postCalls = (axios.post as any).mock.calls;
    const carouselCall = postCalls.find(
      (call: any[]) => call[0]?.includes('/me/media') && call[1]?.caption?.includes('Custom carousel caption')
    );
    expect(carouselCall).toBeTruthy();
  });

  it('updates Airtable with status=published and permalink', async () => {
    vi.resetModules();
    const { createCarouselPost: freshCarousel } = await import('../../../src/platforms/instagram/postGenerator.js');
    const { updatePostRecord: updateRecord } = await import('../../../src/lib/airtable.js');

    await freshCarousel({
      videoPath: '/fake/video.mp4',
      summary: 'Test carousel',
      imageUrls: ['https://example.com/slide1.jpg', 'https://example.com/slide2.jpg'],
      airtableRecordId: 'rec_abc123',
    });

    expect(updateRecord).toHaveBeenCalledWith('rec_abc123', {
      status: 'published',
      platform: 'instagram_carousel',
      permalink: expect.stringContaining('instagram.com'),
    });
  });

  it('creates CAROUSEL media type container', async () => {
    vi.resetModules();
    const { createCarouselPost: freshCarousel } = await import('../../../src/platforms/instagram/postGenerator.js');
    const axios = (await import('axios')).default;

    await freshCarousel({
      videoPath: '/fake/video.mp4',
      summary: 'Test carousel with key moments',
      imageUrls: [
        'https://example.com/slide1.jpg',
        'https://example.com/slide2.jpg',
        'https://example.com/slide3.jpg',
        'https://example.com/slide4.jpg',
      ],
    });

    // Find the carousel container creation call
    const postCalls = (axios.post as any).mock.calls;
    const carouselCall = postCalls.find(
      (call: any[]) => call[0]?.includes('/me/media') && call[1]?.media_type === 'CAROUSEL'
    );
    expect(carouselCall).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — InstagramPostGeneratorError
// ---------------------------------------------------------------------------
describe('InstagramPostGeneratorError', () => {
  it('has correct name and message', () => {
    const err = new InstagramPostGeneratorError('test message');
    expect(err.name).toBe('InstagramPostGeneratorError');
    expect(err.message).toBe('test message');
    expect(err instanceof Error).toBe(true);
  });
});
