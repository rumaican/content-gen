/**
 * RSS Parser — pure function for parsing YouTube RSS XML into structured video records.
 * No I/O. Fully testable with TDD.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ParsedVideo } from './types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Parse a YouTube RSS XML string into an array of ParsedVideo records.
 * @param rssXml - Raw RSS XML string from YouTube channel feed
 * @returns Array of parsed video entries (never null — empty feed returns [])
 * @throws Error if XML is malformed beyond recovery
 */
export function parseRSSFeed(rssXml: string): ParsedVideo[] {
  if (!rssXml || !rssXml.trim()) {
    throw new Error('parseRSSFeed: received empty or null XML string');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(rssXml);
  } catch (err) {
    throw new Error(`parseRSSFeed: failed to parse XML — ${err instanceof Error ? err.message : String(err)}`);
  }

  // YouTube RSS structure: feed > entry[]
  const feed = parsed['feed'] as Record<string, unknown> | undefined;
  if (!feed) {
    throw new Error('parseRSSFeed: XML root <feed> element not found — malformed YouTube RSS');
  }

  const rawEntries = feed['entry'];
  if (!rawEntries) {
    return []; // No entries — valid empty feed
  }

  // Normalise: may be a single object or an array
  const entries: Record<string, unknown>[] = Array.isArray(rawEntries)
    ? rawEntries
    : [rawEntries];

  return entries.map(parseEntry).filter((v): v is ParsedVideo => v !== null);
}

function parseEntry(entry: Record<string, unknown>): ParsedVideo | null {
  try {
    // videoId from yt:videoId or media:group/media:content@_url
    const ytVideoId = entry['yt:videoId'] as string | undefined;
    const mediaGroup = entry['media:group'] as Record<string, unknown> | undefined;
    const mediaContent = mediaGroup
      ? (mediaGroup['media:content'] as Record<string, unknown> | undefined)
      : undefined;
    const mediaThumbnail = mediaGroup
      ? (mediaGroup['media:thumbnail'] as Record<string, unknown> | undefined)
      : undefined;

    const videoId = ytVideoId || '';
    if (!videoId) return null;

    // channelId from yt:channelId
    const channelId = (entry['yt:channelId'] as string | undefined) || null;

    // title
    const title = (entry['title'] as string | undefined) || '';

    // channelTitle from feed author / name
    const author = entry['author'] as Record<string, unknown> | undefined;
    const channelTitle = (author?.['name'] as string | undefined) || '';

    // published date — try <published> then <updated>
    const publishedAt =
      (entry['published'] as string | undefined) ||
      (entry['updated'] as string | undefined) ||
      '';

    // thumbnail
    const thumbnailUrl = buildThumbnailUrl(videoId);

    return {
      videoId,
      title,
      channelId: channelId ?? '',
      channelTitle,
      publishedAt,
      thumbnailUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Build the standard YouTube hqdefault thumbnail URL for a given videoId.
 */
export function buildThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Deduplicate an array of ParsedVideo by videoId.
 * Preserves first-seen order.
 */
export function deduplicateVideos(videos: ParsedVideo[]): ParsedVideo[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}
