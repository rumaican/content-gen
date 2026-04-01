/**
 * contentRouter.ts — Main routing function.
 *
 * Takes a VideoRecord, analyzes it, scores platforms, generates PostTasks,
 * saves them to Airtable, and returns the result.
 */

import { createPostTask, updateVideoRecord } from '../lib/trello.js';
import type { VideoRecord as AirtableVideoRecord } from '../lib/trello.js';
import {
  isEligible,
  scorePlatform,
  selectPlatforms,
  chooseContentType,
  estimateEffort,
  countInsights,
  type PlatformName,
} from './rules.js';

export interface PostTask {
  platform: PlatformName;
  contentType: string;
  priority: number; // 1-3, 1=highest
  videoId: string;
  status: 'queued';
  estimatedEffort: number;
  routingExplanation: string;
}

export interface RouteResult {
  postTasks: PostTask[];
  routingExplanation: string;
}

// ---------------------------------------------------------------------------
// Visibility tag helpers
// ---------------------------------------------------------------------------

function parseTags(tags: string | null | undefined): string[] {
  if (!tags || typeof tags !== 'string') return [];
  return tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Build routing explanation
// ---------------------------------------------------------------------------

function buildExplanation(
  videoRecord: AirtableVideoRecord,
  selectedPlatforms: PlatformName[],
  scores: Map<PlatformName, number>
): string {
  const parts: string[] = [];
  const title = videoRecord.title ?? '';
  const duration = videoRecord.duration ?? 0;
  const tags = parseTags(videoRecord.tags);
  const transcript = videoRecord.transcript ?? '';
  const insights = countInsights(transcript);

  parts.push(`Video: "${title}" (${Math.round(duration)}s, ${insights} insights)`);
  parts.push(`Selected platforms: ${selectedPlatforms.join(', ')}`);

  for (const platform of selectedPlatforms) {
    const score = scores.get(platform) ?? 0;
    const reasons: string[] = [];

    if (platform === 'tiktok' && duration < 60) {
      reasons.push(`short video (${Math.round(duration)}s < 60s)`);
    }
    if (platform === 'twitter' && insights > 3) {
      reasons.push(`${insights} bullet-worthy insights`);
    }
    if (platform === 'linkedin') {
      if (duration > 600) reasons.push('long-form');
      if (hasKeyword(title, ['how-to', 'how to', 'explainer', 'tutorial', 'guide'])) {
        reasons.push('educational content');
      }
    }
    if (platform === 'instagram') {
      if (tags.some((t) => ['visual', 'demo', 'screen', 'product', 'show'].includes(t))) {
        reasons.push('visual content');
      }
    }
    if (platform === 'email' && transcript.length > 100) {
      reasons.push(`rich transcript (${transcript.trim().length} chars)`);
    }

    parts.push(`  ${platform}: score=${score} — ${reasons.join(', ') || 'eligible'}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Priority from score (1=highest)
// ---------------------------------------------------------------------------

function priorityFromScore(score: number): number {
  if (score >= 6) return 1;
  if (score >= 4) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// main routing function
// ---------------------------------------------------------------------------

/**
 * Route a video record to appropriate platforms.
 *
 * @param videoRecord — Video record from Airtable (with transcript, title, duration, tags)
 * @returns RouteResult containing PostTasks and routing explanation
 */
export async function routeContent(videoRecord: AirtableVideoRecord): Promise<RouteResult> {
  // Validate: need videoId
  if (!videoRecord.videoId) {
    console.error('[ContentRouter] ERROR: videoRecord missing videoId — returning empty');
    return { postTasks: [], routingExplanation: 'Error: videoRecord missing videoId' };
  }

  // Handle missing/empty transcript gracefully
  if (!videoRecord.transcript || videoRecord.transcript.trim().length === 0) {
    console.warn(`[ContentRouter] WARN: video ${videoRecord.videoId} has no transcript — returning empty`);
    return { postTasks: [], routingExplanation: 'No transcript available — no routing performed' };
  }

  // Select platforms using rule engine
  const selectedPlatforms = selectPlatforms(videoRecord);

  if (selectedPlatforms.length === 0) {
    console.info(`[ContentRouter] INFO: video ${videoRecord.videoId} — no eligible platforms`);
    return {
      postTasks: [],
      routingExplanation: 'No eligible platforms for this content',
    };
  }

  // Build scores map for explanation
  const scores = new Map<PlatformName, number>();
  for (const p of selectedPlatforms) {
    scores.set(p, scorePlatform(p, videoRecord));
  }

  // Build explanation
  const routingExplanation = buildExplanation(videoRecord, selectedPlatforms, scores);

  console.info(
    `[ContentRouter] INFO: video ${videoRecord.videoId} — ${selectedPlatforms.length} platforms selected: ${selectedPlatforms.join(', ')}`
  );

  // Generate PostTasks
  const postTasks: PostTask[] = selectedPlatforms.map((platform) => {
    const score = scores.get(platform) ?? 1;
    const contentType = chooseContentType(platform, videoRecord);

    return {
      platform,
      contentType,
      priority: priorityFromScore(score),
      videoId: videoRecord.videoId,
      status: 'queued',
      estimatedEffort: estimateEffort(platform),
      routingExplanation,
    };
  });

  // Save each PostTask to Airtable
  const savedTasks: PostTask[] = [];
  for (const task of postTasks) {
    try {
      await createPostTask({
        platform: task.platform,
        contentType: task.contentType,
        priority: task.priority,
        videoId: task.videoId,
        status: task.status,
        estimatedEffort: task.estimatedEffort,
        routingExplanation: task.routingExplanation,
      });
      savedTasks.push(task);
    } catch (err) {
      // Airtable failure → throw descriptive error (not silent)
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[ContentRouter] Airtable createPostTask failed for platform=${task.platform}: ${msg}`);
    }
  }

  // Update video routingStatus to 'routed'
  try {
    await updateVideoRecord(videoRecord.videoId, { routingStatus: 'routed' });
  } catch (err) {
    // Non-fatal: log but don't fail the whole operation
    console.warn(`[ContentRouter] WARN: failed to update routingStatus for ${videoRecord.videoId}: ${err}`);
  }

  return { postTasks: savedTasks, routingExplanation };
}

// ---------------------------------------------------------------------------
// Exported for testing
// ---------------------------------------------------------------------------
export { countInsights, isEligible, scorePlatform, selectPlatforms, chooseContentType };
