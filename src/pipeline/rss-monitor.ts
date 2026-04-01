/**
 * RSS Monitor — polls YouTube channel RSS feeds on a configurable interval
 * and creates new Video records in Trello for undiscovered videos.
 *
 * Operates in two modes:
 *  - Scheduled (setInterval): runs automatically every pollIntervalMs ms
 *  - One-shot: call runPollCycle() directly for a single manual run
 */

import { parseRSSFeed, deduplicateVideos } from './rss-parser.js';
import { filterNewVideos } from './duplicate-checker.js';
import { createVideo } from '../lib/trello.js';
import type { ChannelConfig, RssMonitorConfig } from './types.js';

const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Load RSS Monitor configuration from environment variables.
 * RSS_CHANNELS is a JSON array of { channelId, channelTitle, rssUrl }.
 * Falls back to RSS_CHANNELS env var for simple channel-id list (legacy).
 */
export async function loadConfig(): Promise<RssMonitorConfig> {
  const pollIntervalMs =
    parseInt(process.env.RSS_POLL_INTERVAL_MS || '', 10) || DEFAULT_POLL_INTERVAL_MS;

  // Parse YOUTUBE_CHANNELS env var (comma-separated channel IDs)
  const envChannels = (process.env.YOUTUBE_CHANNELS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const channels: ChannelConfig[] = envChannels.map((channelId) => ({
    channelId,
    channelTitle: channelId, // title unknown without RSS feed
    rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
  }));

  return {
    pollIntervalMs,
    channels,
    airtableBaseId: process.env.AIRTABLE_BASE_ID || '',
    airtableApiKey: process.env.AIRTABLE_API_KEY || '',
  };
}

// ---------------------------------------------------------------------------
// Core polling logic
// ---------------------------------------------------------------------------

/**
 * Run one full poll cycle across all configured channels.
 * Fetch → Parse → Deduplicate → Check existing → Create new in Trello.
 */
export async function runPollCycle(config?: RssMonitorConfig): Promise<{ processed: number; created: number; errors: number }> {
  if (isRunning) {
    console.log('[rss-monitor] Poll cycle already in progress, skipping this trigger.');
    return { processed: 0, created: 0, errors: 0 };
  }

  isRunning = true;
  const effectiveConfig = config || (await loadConfig());

  console.log(`[rss-monitor] Poll cycle started — ${effectiveConfig.channels.length} channel(s)`);

  let processed = 0;
  let created = 0;
  let errors = 0;

  for (const channel of effectiveConfig.channels) {
    try {
      const result = await processChannel(channel);
      processed += result.processed;
      created += result.created;
      if (result.error) errors++;
    } catch (err) {
      console.error(`[rss-monitor] Unhandled error for channel ${channel.channelId}:`, err);
      errors++;
    }
  }

  isRunning = false;
  console.log(`[rss-monitor] Poll cycle complete — processed:${processed} created:${created} errors:${errors}`);
  return { processed, created, errors };
}

async function processChannel(channel: ChannelConfig): Promise<{ processed: number; created: number; error: boolean }> {
  console.log(`[rss-monitor] Fetching RSS: ${channel.rssUrl}`);

  let rssXml: string;
  try {
    const res = await fetch(channel.rssUrl, {
      headers: { 'User-Agent': 'content-gen/rss-monitor' },
    });

    if (!res.ok) {
      console.error(`[rss-monitor] HTTP ${res.status} for ${channel.rssUrl}`);
      return { processed: 0, created: 0, error: true };
    }

    rssXml = await res.text();
  } catch (err) {
    console.error(`[rss-monitor] Network error fetching ${channel.rssUrl}:`, err);
    return { processed: 0, created: 0, error: true };
  }

  let videos;
  try {
    videos = parseRSSFeed(rssXml);
  } catch (err) {
    console.error(`[rss-monitor] XML parse error for ${channel.rssUrl}:`, err);
    return { processed: 0, created: 0, error: true };
  }

  if (videos.length === 0) {
    console.log(`[rss-monitor] No videos in feed for ${channel.channelId}`);
    return { processed: 0, created: 0, error: false };
  }

  // Deduplicate within the feed itself
  const uniqueVideos = deduplicateVideos(videos);
  console.log(`[rss-monitor] ${videos.length} video(s) in feed, ${uniqueVideos.length} unique`);

  // Filter out already-existing videos via Trello
  const newVideos = await filterNewVideos(uniqueVideos);
  console.log(`[rss-monitor] ${newVideos.length} new video(s) to create`);

  // Create records in Trello
  let created = 0;
  for (const video of newVideos) {
    try {
      await createVideo(video);
      created++;
      console.log(`[rss-monitor] Created Trello video card: ${video.videoId} — "${video.title}"`);
    } catch (err) {
      // Likely a duplicate race condition or Trello error — log and continue
      console.error(`[rss-monitor] Failed to create video card for ${video.videoId}:`, err);
    }
  }

  return { processed: uniqueVideos.length, created, error: false };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Start the scheduled RSS polling loop.
 * Idempotent — safe to call multiple times (only one interval runs).
 */
export function startScheduler(config?: RssMonitorConfig): void {
  if (intervalHandle !== null) {
    console.log('[rss-monitor] Scheduler already running.');
    return;
  }

  loadConfig().then((cfg) => {
    const interval = config?.pollIntervalMs ?? cfg.pollIntervalMs;
    console.log(`[rss-monitor] Starting scheduler — interval: ${interval}ms`);

    // Run immediately on start
    runPollCycle(config ?? cfg).catch((err) =>
      console.error('[rss-monitor] Initial poll cycle error:', err)
    );

    intervalHandle = setInterval(() => {
      runPollCycle(config ?? cfg).catch((err) =>
        console.error('[rss-monitor] Scheduled poll cycle error:', err)
      );
    }, interval);
  });
}

/**
 * Stop the scheduled polling loop.
 */
export function stopScheduler(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[rss-monitor] Scheduler stopped.');
  }
}
