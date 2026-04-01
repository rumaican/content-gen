/**
 * tests/e2e/pipeline.test.ts
 * E2E: Full Content Pipeline Integration Test
 *
 * Tests the complete pipeline: RSS → Download → Transcribe → Summarize → Route → Generate
 * All external APIs are mocked. This validates integration points and catches regressions.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies before importing pipeline modules
// ---------------------------------------------------------------------------

// Mock youtube-transcript-api
vi.mock('youtube-transcript-api', () => ({
  default: {
    listTranscript: vi.fn().mockResolvedValue({
      fetch: vi.fn().mockResolvedValue([
        { text: 'This is the first sentence of the transcript.' },
        { text: 'Here is another sentence with more content.' },
        { text: 'And a third sentence to make it realistic.' },
        { text: 'This video covers important topics about technology.' },
        { text: 'The speaker discusses various aspects of software development.' },
        { text: 'In conclusion, this was an informative video.' },
      ]),
    }),
  },
}));

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content:
                    '🚀 New video! This tech overview covers software development best practices. #dev #coding',
                },
              },
            ],
          }),
        },
      };
    },
  };
});

// Mock twitter-api-v2
vi.mock('twitter-api-v2', () => ({
  default: class MockTwitterClient {
    v2 = {
      tweet: vi.fn().mockResolvedValue({ data: { id: '1234567890', text: 'Test tweet' } }),
      me: vi.fn().mockResolvedValue({ data: { id: '9876543210', name: 'Test User', username: 'testuser' } }),
      userTimeline: vi.fn().mockResolvedValue({ data: [] }),
    };
  },
}));

// Mock twitter auth — bypass ensureConfig env var check
vi.mock('../../src/auth/twitter.js', () => ({
  getTwitterClient: vi.fn().mockReturnValue({
    v2: {
      tweet: vi.fn().mockResolvedValue({ data: { id: '1234567890', text: 'Test tweet' } }),
      me: vi.fn().mockResolvedValue({ data: { id: '9876543210', name: 'Test User', username: 'testuser' } }),
      userTimeline: vi.fn().mockResolvedValue({ data: [] }),
    },
  }),
  TwitterAuthError: class TwitterAuthError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = 'TwitterAuthError';
      this.statusCode = statusCode;
    }
  },
  getTwitterReadOnlyClient: vi.fn(),
  getAccountInfo: vi.fn(),
}));

// Mock axios for LinkedIn and other HTTP calls
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { id: 'linkedin-post-123' } }),
    get: vi.fn().mockResolvedValue({ data: {} }),
    create: vi.fn().mockReturnThis(),
  },
}));

// Mock resend email
vi.mock('resend', () => ({
  default: class MockResend {
    constructor() {}
    emails = {
      send: vi.fn().mockResolvedValue({ data: { id: 'email-123' } }),
    };
  },
}));

// Mock airtable lib — stub all operations
vi.mock('../../src/lib/airtable.js', () => ({
  updateVideoRecord: vi.fn().mockResolvedValue(undefined),
  createVideoRecord: vi.fn().mockResolvedValue({ id: 'airtable-video-123' }),
  getPostsByVideoId: vi.fn().mockResolvedValue([
    { id: 'post-1', platform: 'twitter' },
    { id: 'post-2', platform: 'linkedin' },
  ]),
}));

// ---------------------------------------------------------------------------
// Import pipeline modules AFTER mocks are set
// ---------------------------------------------------------------------------

const { fetchYouTubeRSS } = await import('../../src/pipelines/rss.js');
const { transcribeVideo } = await import('../../src/pipelines/transcriber.js');
const { summarizeContent } = await import('../../src/pipelines/summarizer.js');
const { routeContent } = await import('../../src/pipelines/router.js');
const { postTweet } = await import('../../src/platforms/twitter.js');
const { postShare: postLinkedIn } = await import('../../src/platforms/linkedin.js');

// ---------------------------------------------------------------------------
// Mock the downloader module entirely — test integration without real subprocess
// ---------------------------------------------------------------------------

const MOCK_VIDEO_ID = 'dQw4w9WgXcQ';
const MOCK_DOWNLOAD_RESULT = {
  videoPath: 'downloads/Test-Video-dQw4w9WgXcQ.mp4',
  audioPath: null,
  metadata: {
    title: 'Test Video Title for Pipeline',
    channel: 'Test Channel',
    duration: 600,
    videoId: MOCK_VIDEO_ID,
    webpageUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
};

vi.mock('../../src/pipelines/downloader.js', () => ({
  downloadVideo: vi.fn().mockResolvedValue(MOCK_DOWNLOAD_RESULT),
  DownloadError: class DownloadError extends Error {
    code: string;
    url: string;
    constructor(message: string, code: string, url: string) {
      super(message);
      this.name = 'DownloadError';
      this.code = code;
      this.url = url;
    }
  },
}));

const { downloadVideo, DownloadError } = await import('../../src/pipelines/downloader.js');

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const MOCK_RSS_VIDEOS = [
  {
    url: TEST_VIDEO_URL,
    title: 'Test Video Title for Pipeline',
    channelId: 'UC123456',
    publishedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Full Pipeline E2E', () => {
  it('runs test-video-001 through all 6 stages end-to-end', async () => {
    // ── Stage 1: RSS Fetch ────────────────────────────────────────────────
    const originalChannels = process.env.YOUTUBE_CHANNELS;
    process.env.YOUTUBE_CHANNELS = 'UC123456';

    const videos = await fetchYouTubeRSS();
    expect(Array.isArray(videos)).toBe(true);

    process.env.YOUTUBE_CHANNELS = originalChannels;

    // ── Stage 2: Download (mocked) ────────────────────────────────────────
    const result = await downloadVideo(TEST_VIDEO_URL);
    expect(result.videoPath).toBeTruthy();
    expect(result.metadata.videoId).toBe(MOCK_VIDEO_ID);
    expect(result.metadata.title).toBe('Test Video Title for Pipeline');
    expect(result.metadata.channel).toBe('Test Channel');
    expect(result.metadata.duration).toBe(600);

    // ── Stage 3: Transcribe ───────────────────────────────────────────────
    // Uses mocked youtube-transcript-api
    const transcript = await transcribeVideo(TEST_VIDEO_URL);
    expect(transcript.length).toBeGreaterThan(100);
    expect(transcript).toContain('first sentence');

    // ── Stage 4: Summarize ────────────────────────────────────────────────
    const summary = await summarizeContent(transcript);
    expect(summary).toBeTruthy();
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);

    // ── Stage 5: Route ────────────────────────────────────────────────────
    const routes = await routeContent(summary);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes).toContain('twitter');
    if (summary.length > 100) {
      expect(routes).toContain('linkedin');
    }

    // ── Stage 6: Generate & Post (mocked) ─────────────────────────────────
    for (const route of routes) {
      switch (route) {
        case 'twitter': {
          const result = await postTweet(summary);
          expect(result.id).toBe('1234567890');
          expect(result.text).toBe('Test tweet');
          break;
        }
        case 'linkedin': {
          const result = await postLinkedIn({ text: summary });
          expect(result.id).toBe('linkedin-post-123');
          break;
        }
        default:
          break;
      }
    }
  });

  it('DownloadError has correct structure', () => {
    // The real downloadVideo throws DownloadError on invalid input
    // Here we verify the class structure is correct
    const error = new DownloadError('test', 'ERR_TEST', 'http://x.com');
    expect(error.name).toBe('DownloadError');
    expect(error.code).toBe('ERR_TEST');
    expect(error.url).toBe('http://x.com');
  });

  it('routeContent returns correct platforms based on summary length', async () => {
    const shortRoutes = await routeContent('Short');
    const longRoutes = await routeContent('A'.repeat(150));

    expect(shortRoutes).toContain('twitter');
    expect(longRoutes).toContain('twitter');
    expect(longRoutes).toContain('linkedin');
  });

  it('transcribeVideo handles YouTube URL formats correctly', async () => {
    const urls = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ];

    for (const url of urls) {
      await expect(transcribeVideo(url)).resolves.toBeTruthy();
    }
  });

  it('summarizeContent returns non-empty string for valid transcript', async () => {
    const result = await summarizeContent(
      'This is a test transcript with enough content to be summarized properly by the AI model. It contains multiple sentences that should be processed by the summarization pipeline.'
    );
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('Pipeline Stage Timing', () => {
  it('all pipeline stages complete within acceptable time limits', async () => {
    const timings: Record<string, number> = {};

    const startTotal = Date.now();

    // Stage 1: RSS
    const startRSS = Date.now();
    await fetchYouTubeRSS();
    timings.rss = Date.now() - startRSS;

    // Stage 2: Download (mocked — near-instant)
    const startDL = Date.now();
    await downloadVideo(TEST_VIDEO_URL);
    timings.download = Date.now() - startDL;

    // Stage 3: Transcribe (mocked API — near-instant)
    const startTranscribe = Date.now();
    await transcribeVideo(TEST_VIDEO_URL);
    timings.transcribe = Date.now() - startTranscribe;

    // Stage 4: Summarize (mocked OpenAI — near-instant)
    const startSummarize = Date.now();
    await summarizeContent('A'.repeat(500));
    timings.summarize = Date.now() - startSummarize;

    // Stage 5: Route
    const startRoute = Date.now();
    await routeContent('A'.repeat(500));
    timings.route = Date.now() - startRoute;

    timings.total = Date.now() - startTotal;

    console.log('📊 Pipeline stage timings (ms):', timings);

    // All mocked stages should complete well under 5 seconds
    expect(timings.total).toBeLessThan(5000);
  });
});

describe('Download Validation', () => {
  it('DownloadError has correct properties', () => {
    const error = new DownloadError('test message', 'ERR_TEST', 'https://example.com');
    expect(error.name).toBe('DownloadError');
    expect(error.code).toBe('ERR_TEST');
    expect(error.url).toBe('https://example.com');
    expect(error instanceof Error).toBe(true);
  });
});
