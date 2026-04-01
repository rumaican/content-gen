/**
 * YouTube RSS Monitor — fetches and returns new videos from RSS feeds.
 *
 * Given a list of YouTube channel IDs, fetches their RSS feeds,
 * deduplicates within and across feeds, and returns new videos
 * that are not yet in Airtable.
 *
 * Used by src/index.ts as the entry point for the content pipeline.
 */

import { parseRSSFeed, deduplicateVideos } from '../pipeline/rss-parser.js';
import { filterNewVideos } from '../pipeline/duplicate-checker.js';
import type { ChannelConfig } from '../pipeline/types.js';

interface VideoItem {
  url: string;
  title: string;
  channelId: string;
  publishedAt: string;
}

function buildChannelConfigs(): ChannelConfig[] {
  const envChannels = (process.env.YOUTUBE_CHANNELS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return envChannels.map((channelId) => ({
    channelId,
    channelTitle: channelId,
    rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
  }));
}

/**
 * Fetch new videos from all configured YouTube RSS feeds.
 * Returns only videos that are not already in Airtable (deduplicated).
 */
export async function fetchYouTubeRSS(): Promise<VideoItem[]> {
  const channels = buildChannelConfigs();
  const allNewVideos: VideoItem[] = [];

  for (const channel of channels) {
    let rssXml: string;
    try {
      const res = await fetch(channel.rssUrl, {
        headers: { 'User-Agent': 'content-gen/rss-monitor' },
      });

      if (!res.ok) {
        console.error(`[rss] HTTP ${res.status} for ${channel.rssUrl}`);
        continue;
      }

      rssXml = await res.text();
    } catch (err) {
      console.error(`[rss] Network error fetching ${channel.rssUrl}:`, err);
      continue;
    }

    let parsed;
    try {
      parsed = parseRSSFeed(rssXml);
    } catch (err) {
      console.error(`[rss] XML parse error for ${channel.rssUrl}:`, err);
      continue;
    }

    if (parsed.length === 0) continue;

    const unique = deduplicateVideos(parsed);
    const newOnes = await filterNewVideos(unique);

    for (const v of newOnes) {
      allNewVideos.push({
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: v.title,
        channelId: v.channelId,
        publishedAt: v.publishedAt,
      });
    }
  }

  return allNewVideos;
}
