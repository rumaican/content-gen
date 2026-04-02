/**
 * tests/platforms/instagram/reelGenerator.test.ts
 * E2E: Instagram Reel Generator — Video
 *
 * Tests src/platforms/instagram/reelGenerator.ts
 * Coverage: createReel, generateCaptionAndHashtags, createReel with publish
 *
 * Card: 69c9aaff32c905c5c42ccae9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import * as fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Mocks — all hoisted by vitest BEFORE any imports
// ---------------------------------------------------------------------------

// Mock OpenAI
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
                  hashtags: ['#test', '#reel', '#instagram', '#viral', '#fyp'],
                }),
              },
            },
          ],
        }),
      },
    };
  },
}));

// Mock auth/instagram.ts to bypass Meta Graph API auth check
vi.mock('../../../src/auth/instagram.js', () => ({
  createMediaContainer: vi.fn().mockResolvedValue({ id: 'container-123' }),
  publishMediaContainer: vi.fn().mockResolvedValue({ id: 'reel-456' }),
  listMedia: vi.fn().mockResolvedValue({ data: [{ permalink: 'https://instagram.com/p/ABC123' }] }),
  getAccountInfo: vi.fn().mockResolvedValue({ instagramBusinessAccountId: 'account-123' }),
  withRetry: vi.fn((fn: Function) => fn()),
}));

// Mock instagram.ts (required — file extension .js resolves to .ts, no mock = load failure)
vi.mock('../../../src/platforms/instagram.js', () => {
  return {
    postInstagramReel: vi.fn().mockResolvedValue({
      containerId: 'container-123',
      postId: 'reel-456',
      permalink: 'https://instagram.com/p/ABC123',
    }),
    getProfile: vi.fn(),
    default: vi.fn(),
  };
});

// Mock trello.ts
vi.mock('../../../src/lib/trello.js', () => ({
  updateVideoRecord: vi.fn().mockResolvedValue(undefined),
  createVideoRecord: vi.fn().mockResolvedValue('video-record-id'),
  getPostsByVideoId: vi.fn().mockResolvedValue([]),
}));



// Mock fluent-ffmpeg
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
    ffprobe: vi.fn((_path: string, cb: Function) => {
      cb(null, {
        format: { duration: 120 },
        streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
      });
    }),
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

// Mock ffmpegUtils so child_process is never touched
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
// Imports — AFTER all mocks are registered
// ---------------------------------------------------------------------------
import { createReel, generateCaptionAndHashtags, ReelGeneratorError } from '../../../src/platforms/instagram/reelGenerator.js';
import { postInstagramReel } from '../../../src/platforms/instagram.js';
import { updateVideoRecord } from '../../../src/lib/trello.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'outputs', 'test-reels');

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
  // Stub fs.statSync so fileSizeMb doesn't fail
  vi.spyOn(require('fs'), 'statSync').mockReturnValue({ size: 5 * 1024 * 1024 } as any);
});

afterEach(() => {
  try {
    rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// Tests — generateCaptionAndHashtags
// ---------------------------------------------------------------------------
describe('generateCaptionAndHashtags', () => {
  it('returns a caption with hashtags and fullCaption', async () => {
    const result = await generateCaptionAndHashtags('This is a test hook script about productivity');
    expect(result.caption).toBeTruthy();
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(result.hashtags.length).toBeGreaterThan(0);
    expect(result.fullCaption).toContain(result.caption);
    expect(result.fullCaption).toContain(result.hashtags[0]);
  });

  it('uses caption override when provided', async () => {
    const result = await generateCaptionAndHashtags('hook script', {
      captionOverride: 'My custom caption',
      hashtagsOverride: ['#custom', '#tag'],
    });
    expect(result.caption).toBe('My custom caption');
    expect(result.hashtags).toEqual(['#custom', '#tag']);
  });
});

// ---------------------------------------------------------------------------
// Tests — createReel (without publish)
// ---------------------------------------------------------------------------
describe('createReel — generation only', () => {
  it('accepts a valid video path and returns reel metadata', async () => {
    const videoPath = createFakeVideo('test-input.mp4');
    const result = await createReel({
      videoPath,
      hookScript: 'This is a great video about coding',
      outputDir: TEST_OUTPUT_DIR,
    });

    expect(result.outputPath).toBeTruthy();
    expect(result.outputPath.endsWith('.mp4')).toBe(true);
    expect(result.caption).toBeTruthy();
    expect(Array.isArray(result.hashtags)).toBe(true);
    expect(result.thumbnailPath).toBeTruthy();
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('throws ReelGeneratorError when video file does not exist', async () => {
    await expect(
      createReel({ videoPath: '/nonexistent/path/video.mp4', hookScript: 'test' })
    ).rejects.toThrow(ReelGeneratorError);
  });

  it('does not call postInstagramReel when publish=false', async () => {
    const videoPath = createFakeVideo('test-no-publish.mp4');
    await createReel({ videoPath, hookScript: 'test script', publish: false });
    expect(postInstagramReel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — createReel (with publish)
// ---------------------------------------------------------------------------
describe('createReel — with publish', () => {
  it('calls postInstagramReel with correct args when publish=true', async () => {
    const videoPath = createFakeVideo('test-publish.mp4');
    const result = await createReel({
      videoPath,
      hookScript: 'Amazing content about tech',
      videoUrl: 'https://example.com/reel.mp4',
      coverUrl: 'https://example.com/cover.jpg',
      publish: true,
    });

    expect(postInstagramReel).toHaveBeenCalledTimes(1);
    const [caption, videoUrl, coverUrl] = (postInstagramReel as any).mock.calls[0];
    expect(caption).toBeTruthy();
    expect(videoUrl).toBe('https://example.com/reel.mp4');
    expect(coverUrl).toBe('https://example.com/cover.jpg');
    expect(result.publishResult).toBeTruthy();
    expect(result.publishResult?.permalink).toBe('https://instagram.com/p/ABC123');
  });

  it('throws when publish=true but videoUrl is missing', async () => {
    const videoPath = createFakeVideo('test-missing-url.mp4');
    await expect(
      createReel({ videoPath, hookScript: 'test', publish: true })
    ).rejects.toThrow(ReelGeneratorError);
  });

  it('calls updateVideoRecord with status=published and platform=instagram_reel', async () => {
    const videoPath = createFakeVideo('test-airtable.mp4');
    await createReel({
      videoPath,
      hookScript: 'Content for airtable test',
      videoUrl: 'https://example.com/reel.mp4',
      coverUrl: 'https://example.com/cover.jpg',
      publish: true,
      airtableRecordId: 'vid_abc123',
    });

    expect(updateVideoRecord).toHaveBeenCalledWith('vid_abc123', {
      status: 'published',
      platform: 'instagram_reel',
      permalink: 'https://instagram.com/p/ABC123',
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — ReelGeneratorError
// ---------------------------------------------------------------------------
describe('ReelGeneratorError', () => {
  it('has correct name and message', () => {
    const err = new ReelGeneratorError('test message');
    expect(err.name).toBe('ReelGeneratorError');
    expect(err.message).toBe('test message');
    expect(err instanceof Error).toBe(true);
  });
});
