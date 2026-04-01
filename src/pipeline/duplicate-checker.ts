/**
 * Duplicate Checker — checks Trello for existing videoId before creation.
 * Wraps videoExists() from trello.ts.
 */

import { videoExists } from '../lib/trello.js';

/**
 * Returns true if the videoId already exists in Trello (duplicate).
 * Returns false if the video is new.
 *
 * @throws Error if the Trello API call fails
 */
export async function isDuplicate(videoId: string): Promise<boolean> {
  return videoExists(videoId);
}

/**
 * Filter an array of ParsedVideo to only those not already in Trello.
 * Queries Trello once per unique videoId.
 *
 * @param videos - Array of parsed video records
 * @returns Array of videos that are NOT duplicates (safe to create)
 */
export async function filterNewVideos<T extends { videoId: string }>(
  videos: T[]
): Promise<T[]> {
  const uniqueIds = [...new Set(videos.map((v) => v.videoId))];
  const results = await Promise.all(
    uniqueIds.map(async (id) => ({ videoId: id, exists: await isDuplicate(id) }))
  );

  const existingIds = new Set(results.filter((r) => r.exists).map((r) => r.videoId));
  return videos.filter((v) => !existingIds.has(v.videoId));
}
