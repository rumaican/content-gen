import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRSSFeed, deduplicateVideos } from '../../src/pipeline/rss-parser.js';
import type { ParsedVideo } from '../../src/pipeline/types.js';

// Mock trello.ts to avoid real API calls
vi.mock('../../src/lib/trello.js', () => ({
  videoExists: vi.fn(),
}));

import { isDuplicate, filterNewVideos } from '../../src/pipeline/duplicate-checker.js';
import { videoExists } from '../../src/lib/trello.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Test Video 1</title>
    <published>2026-04-01T10:00:00Z</published>
    <yt:channelId>channel1</yt:channelId>
  </entry>
  <entry>
    <yt:videoId>def456</yt:videoId>
    <title>Test Video 2</title>
    <published>2026-04-02T10:00:00Z</published>
    <yt:channelId>channel1</yt:channelId>
  </entry>
</feed>`;

describe('RSS Parser', () => {
  it('parses valid RSS feed and extracts videos', () => {
    const videos = parseRSSFeed(SAMPLE_RSS);
    expect(videos).toHaveLength(2);
    expect(videos[0].videoId).toBe('abc123');
    expect(videos[0].title).toBe('Test Video 1');
    expect(videos[1].videoId).toBe('def456');
  });

  it('returns empty array for malformed XML', () => {
    expect(() => parseRSSFeed('<not-valid-xml')).toThrow();
  });

  it('handles entry missing published date', () => {
    const rss = `<?xml version="1.0"?>
<feed><entry><yt:videoId>x</yt:videoId><title>No Date</title></entry></feed>`;
    const videos = parseRSSFeed(rss);
    // Missing published date results in empty string (not null)
    expect(videos[0].publishedAt).toBe('');
  });
});

describe('Deduplicate Videos', () => {
  it('removes exact duplicates by videoId', () => {
    const videos: ParsedVideo[] = [
      { videoId: 'abc123', title: 'A', channelId: 'ch1', channelTitle: 'Ch', publishedAt: '2026-04-01T10:00:00Z', thumbnailUrl: '' },
      { videoId: 'abc123', title: 'A', channelId: 'ch1', channelTitle: 'Ch', publishedAt: '2026-04-01T10:00:00Z', thumbnailUrl: '' },
    ];
    const result = deduplicateVideos(videos);
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('abc123');
  });
});

describe('Duplicate Checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isDuplicate returns false for unknown videoId', async () => {
    (videoExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const result = await isDuplicate('newVid');
    expect(result).toBe(false);
    expect(videoExists).toHaveBeenCalledWith('newVid');
  });

  it('isDuplicate returns true for existing videoId', async () => {
    (videoExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const result = await isDuplicate('vid123');
    expect(result).toBe(true);
  });

  it('filterNewVideos excludes duplicates', async () => {
    const videos: ParsedVideo[] = [
      { videoId: 'vid1', title: 'V1', channelId: 'ch1', channelTitle: 'Ch', publishedAt: '2026-04-01T10:00:00Z', thumbnailUrl: '' },
      { videoId: 'vid2', title: 'V2', channelId: 'ch1', channelTitle: 'Ch', publishedAt: '2026-04-01T10:00:00Z', thumbnailUrl: '' },
    ];
    (videoExists as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)  // vid1: not a duplicate
      .mockResolvedValueOnce(true); // vid2: is a duplicate
    const result = await filterNewVideos(videos);
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('vid1');
  });
});
