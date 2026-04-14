/**
 * Unit tests for RSS Monitor — loadConfig
 * Tests for: loadConfig env var parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock trello to avoid real API calls in any imported modules
vi.mock('../../src/lib/trello.js', () => ({
  createVideo: vi.fn(),
  videoExists: vi.fn(),
}));

import { loadConfig } from '../../src/pipeline/rss-monitor.js';

// ---------------------------------------------------------------------------
// loadConfig tests
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses default poll interval when RSS_POLL_INTERVAL_MS is not set', async () => {
    delete process.env.RSS_POLL_INTERVAL_MS;
    const config = await loadConfig();
    expect(config.pollIntervalMs).toBe(60 * 60 * 1000); // 1 hour
  });

  it('parses custom poll interval from RSS_POLL_INTERVAL_MS', async () => {
    process.env.RSS_POLL_INTERVAL_MS = '300000'; // 5 minutes
    const config = await loadConfig();
    expect(config.pollIntervalMs).toBe(300000);
  });

  it('builds channel configs from YOUTUBE_CHANNELS env var', async () => {
    process.env.YOUTUBE_CHANNELS = 'UCabc,UCdef';
    const config = await loadConfig();
    expect(config.channels).toHaveLength(2);
    expect(config.channels[0].channelId).toBe('UCabc');
    expect(config.channels[0].rssUrl).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCabc');
    expect(config.channels[1].channelId).toBe('UCdef');
  });

  it('returns empty channels array when YOUTUBE_CHANNELS is empty', async () => {
    process.env.YOUTUBE_CHANNELS = '';
    const config = await loadConfig();
    expect(config.channels).toHaveLength(0);
  });

  it('strips whitespace from channel IDs', async () => {
    process.env.YOUTUBE_CHANNELS = ' UCabc , UCdef ';
    const config = await loadConfig();
    expect(config.channels).toHaveLength(2);
    expect(config.channels[0].channelId).toBe('UCabc');
    expect(config.channels[1].channelId).toBe('UCdef');
  });

  it('filters empty strings from channel list', async () => {
    process.env.YOUTUBE_CHANNELS = 'UCabc,,UCdef';
    const config = await loadConfig();
    expect(config.channels).toHaveLength(2);
  });

  it('returns empty airtable fields when env vars not set', async () => {
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_API_KEY;
    const config = await loadConfig();
    expect(config.airtableBaseId).toBe('');
    expect(config.airtableApiKey).toBe('');
  });
});
