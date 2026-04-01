/**
 * Shared types for the RSS Monitor pipeline
 */

export interface ParsedVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string; // ISO 8601
  thumbnailUrl: string;
}

export interface ChannelConfig {
  channelId: string;
  channelTitle: string;
  rssUrl: string;
}

export interface RssMonitorConfig {
  pollIntervalMs: number;
  channels: ChannelConfig[];
  airtableBaseId: string;
  airtableApiKey: string;
}
