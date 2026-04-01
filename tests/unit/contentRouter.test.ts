/**
 * contentRouter.test.ts — Unit tests for the main routing function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the Airtable module before importing contentRouter
// Use vi.hoisted so mocks are defined before hoisting
// ---------------------------------------------------------------------------

const mockCreatePostTask = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 'rec_123', fields: {}, createdTime: '2026-04-01' })
);
const mockUpdateVideoRecord = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined)
);

vi.mock('../../src/lib/airtable.js', () => ({
  createPostTask: mockCreatePostTask,
  updateVideoRecord: mockUpdateVideoRecord,
  pipelineConfig: {
    AIRTABLE_API_KEY: 'test-key',
    AIRTABLE_BASE_ID: 'test-base',
  },
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import { routeContent } from '../../src/router/contentRouter.js';
import type { VideoRecord } from '../../src/lib/airtable.js';

// ---------------------------------------------------------------------------
// Helper — standard valid video record
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    videoId: 'vid_test_001',
    title: 'How to build a tech startup in 2024',
    transcript:
      'First insight here. Second point made. Third idea presented. ' +
      'Fourth thought here. Fifth observation. Sixth note made. ' +
      'Seventh insight. Eighth point made.',
    duration: 30,
    tags: 'how-to,tutorial,tech',
    routingStatus: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // routeContent returns 3-8 PostTasks for standard transcribed video
  // -------------------------------------------------------------------------

  it('routeContent_returns_3_to_8_tasks for standard video', async () => {
    const record = makeRecord();

    const result = await routeContent(record);

    expect(result.postTasks.length).toBeGreaterThanOrEqual(3);
    expect(result.postTasks.length).toBeLessThanOrEqual(8);
    expect(result.routingExplanation).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // routeContent returns empty array for unsupported/no-eligible video
  // -------------------------------------------------------------------------

  it('routeContent_returns_empty_array_for_unsupported_video', async () => {
    const record = makeRecord({
      duration: 400,
      transcript: 'Short.',
      title: 'Random vlog content',
      tags: 'vlog',
    });

    const result = await routeContent(record);

    expect(result.postTasks).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // routeContent returns empty array when transcript missing (no crash)
  // -------------------------------------------------------------------------

  it('routeContent_returns_empty_for_missing_transcript_no_crash', async () => {
    const record = makeRecord({ transcript: null });

    const result = await routeContent(record);

    expect(result.postTasks).toEqual([]);
    expect(result.routingExplanation).toContain('No transcript');
  });

  it('routeContent_returns_empty_for_empty_transcript_no_crash', async () => {
    const record = makeRecord({ transcript: '' });

    const result = await routeContent(record);

    expect(result.postTasks).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // routeContent saves postTasks to Airtable via createPostTask
  // -------------------------------------------------------------------------

  it('routeContent_saves_postTasks_to_airtable', async () => {
    const record = makeRecord();

    const result = await routeContent(record);

    expect(mockCreatePostTask).toHaveBeenCalled();
    expect(mockCreatePostTask.mock.calls.length).toBe(result.postTasks.length);
  });

  // -------------------------------------------------------------------------
  // routeContent returns PostTasks with required fields
  // -------------------------------------------------------------------------

  it('routeContent_returns_tasks_with_required_fields', async () => {
    const record = makeRecord();

    const result = await routeContent(record);

    for (const task of result.postTasks) {
      expect(task.platform).toBeTruthy();
      expect(task.contentType).toBeTruthy();
      expect(task.priority).toBeGreaterThanOrEqual(1);
      expect(task.priority).toBeLessThanOrEqual(3);
      expect(task.videoId).toBe('vid_test_001');
      expect(task.status).toBe('queued');
      expect(task.estimatedEffort).toBeGreaterThan(0);
      expect(task.routingExplanation).toBeTruthy();
    }
  });

  // -------------------------------------------------------------------------
  // routeContent handles missing videoId gracefully
  // -------------------------------------------------------------------------

  it('routeContent_returns_empty_for_missing_videoId', async () => {
    const record = makeRecord({ videoId: '' });

    const result = await routeContent(record);

    expect(result.postTasks).toEqual([]);
    expect(result.routingExplanation).toContain('videoId');
  });

  // -------------------------------------------------------------------------
  // routeContent updates video routingStatus to routed on success
  // -------------------------------------------------------------------------

  it('routeContent_updates_routingStatus_to_routed', async () => {
    const record = makeRecord();

    await routeContent(record);

    expect(mockUpdateVideoRecord).toHaveBeenCalledWith('vid_test_001', {
      routingStatus: 'routed',
    });
  });

  // -------------------------------------------------------------------------
  // routeContent throws descriptive error on Airtable failure
  // -------------------------------------------------------------------------

  it('routeContent_throws_descriptive_error_on_airtable_failure', async () => {
    mockCreatePostTask.mockRejectedValueOnce(new Error('HTTP 500 Internal Server Error'));
    const record = makeRecord();

    await expect(routeContent(record)).rejects.toThrow(
      'Airtable createPostTask failed for platform='
    );
  });

  // -------------------------------------------------------------------------
  // TikTok included for video < 60s
  // -------------------------------------------------------------------------

  it('routeContent_includes_tiktok_for_short_video', async () => {
    const record = makeRecord({ duration: 45 });

    const result = await routeContent(record);

    const platforms = result.postTasks.map((t) => t.platform);
    expect(platforms).toContain('tiktok');
  });

  // -------------------------------------------------------------------------
  // Twitter included for insight-rich transcript
  // -------------------------------------------------------------------------

  it('routeContent_includes_twitter_for_insight_rich_transcript', async () => {
    const record = makeRecord({
      transcript:
        'First insight here. Second point made. Third idea presented. ' +
        'Fourth thought here. Fifth observation. Sixth note made. ' +
        'Seventh insight. Eighth point made.',
    });

    const result = await routeContent(record);

    const platforms = result.postTasks.map((t) => t.platform);
    expect(platforms).toContain('twitter');
  });

  // -------------------------------------------------------------------------
  // LinkedIn included for long-form educational
  // -------------------------------------------------------------------------

  it('routeContent_includes_linkedin_for_educational_long_form', async () => {
    const record = makeRecord({
      duration: 700,
      title: 'How to build a startup — complete guide',
      tags: 'how-to,tutorial',
      transcript:
        'First insight here. Second point made. Third idea presented. ' +
        'Fourth thought here. Fifth observation. Sixth note made. ' +
        'Seventh insight. Eighth point made.',
    });

    const result = await routeContent(record);

    const platforms = result.postTasks.map((t) => t.platform);
    expect(platforms).toContain('linkedin');
  });

  // -------------------------------------------------------------------------
  // PostTask priority is 1-3
  // -------------------------------------------------------------------------

  it('routeContent_assigns_priority_1_to_3', async () => {
    const record = makeRecord();

    const result = await routeContent(record);

    for (const task of result.postTasks) {
      expect([1, 2, 3]).toContain(task.priority);
    }
  });

  // -------------------------------------------------------------------------
  // routeContent covers multiple platforms
  // -------------------------------------------------------------------------

  it('routeContent_covers_multiple_platforms', async () => {
    const record = makeRecord();

    const result = await routeContent(record);

    const uniquePlatforms = new Set(result.postTasks.map((t) => t.platform));
    expect(uniquePlatforms.size).toBeGreaterThanOrEqual(2);
  });
});
