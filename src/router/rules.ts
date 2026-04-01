/**
 * rules.ts — Pure rule functions for content routing.
 *
 * No I/O, no side effects. Fully unit-testable.
 */

import platformsConfig from './platforms.json' with { type: 'json' };

export interface VideoRecord {
  videoId: string;
  title?: string;
  transcript?: string | null;
  duration?: number | null; // seconds
  tags?: string | null; // comma-separated
  routingStatus?: string;
}

export interface PlatformConfig {
  maxLength: number | null;
  maxPosts: number;
  contentTypes: string[];
  minDuration: number;
  maxDuration: number | null;
  basePriority: number;
  [key: string]: unknown;
}

export type PlatformName = 'twitter' | 'instagram' | 'linkedin' | 'tiktok' | 'email';

// ---------------------------------------------------------------------------
// Insight detection
// ---------------------------------------------------------------------------

const INSIGHT_MAX_LEN = 100;
const INSIGHT_MIN_LEN = 12;
const FILLER_WORDS = ['um', 'uh', 'er', 'ah', 'like '];

/**
 * Count bullet-worthy insights in a transcript.
 * A bullet-worthy insight = a short, self-contained sentence
 * (≤100 chars, ≥20 chars, not a filler phrase).
 */
export function countInsights(transcript: string | null | undefined): number {
  if (!transcript || typeof transcript !== 'string') return 0;

  // Cap processing at 5000 chars for performance
  const text = transcript.slice(0, 5000);
  // Split on period + space (common sentence delimiter)
  const sentences = text.split(/\.\s+/);

  let count = 0;
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < INSIGHT_MIN_LEN) continue;
    if (trimmed.length > INSIGHT_MAX_LEN) continue;

    const lower = trimmed.toLowerCase();
    const isFiller = FILLER_WORDS.some((f) => lower.startsWith(f));
    if (isFiller) continue;

    count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Tag parsing
// ---------------------------------------------------------------------------

function parseTags(tags: string | null | undefined): string[] {
  if (!tags || typeof tags !== 'string') return [];
  return tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Keyword matching
// ---------------------------------------------------------------------------

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

function getDuration(record: VideoRecord): number {
  return typeof record.duration === 'number' ? record.duration : -1;
}

// ---------------------------------------------------------------------------
// isEligible — per-platform eligibility
// ---------------------------------------------------------------------------

export function isEligible(platform: PlatformName, record: VideoRecord): boolean {
  const config = platformsConfig[platform] as PlatformConfig;
  if (!config) return false;

  const duration = getDuration(record);
  const tags = parseTags(record.tags);
  const title = record.title ?? '';
  const transcript = record.transcript ?? '';

  switch (platform) {
    case 'tiktok':
      // Eligible if duration < maxDuration (60s) AND duration is known (>= 0)
      return (
        config.maxDuration !== null &&
        duration >= 0 &&
        duration < config.maxDuration
      );

    case 'twitter': {
      // Eligible if transcript has >3 bullet-worthy insights
      const insights = countInsights(transcript);
      return insights > 3;
    }

    case 'instagram': {
      // Eligible if: has visual keywords in tags/title OR duration in optimal range
      const visualKeywords = (config.visualKeywords as string[]) ?? [];
      const hasVisual = hasKeyword(title, visualKeywords) || tags.some((t) => hasKeyword(t, visualKeywords));
      const optimalMin = (config.durationOptimalMin as number) ?? 15;
      const optimalMax = (config.durationOptimalMax as number) ?? 300;
      const inOptimalRange = duration >= 0 && duration >= optimalMin && duration <= optimalMax;
      return hasVisual || inOptimalRange;
    }

    case 'linkedin': {
      // Eligible if: long-form AND educational keywords in title OR tags
      const longFormThreshold = (config.longFormThreshold as number) ?? 600;
      const eduKeywords = (config.educationalKeywords as string[]) ?? [];
      const isLong = duration >= 0 && duration > longFormThreshold;
      const hasEdu = hasKeyword(title, eduKeywords) || tags.some((t) => hasKeyword(t, eduKeywords));
      return isLong && hasEdu;
    }

    case 'email': {
      // Eligible if transcript is rich enough
      const minLen = (config.minTranscriptLength as number) ?? 100;
      return transcript.trim().length > minLen;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// scorePlatform — relative score for tiebreaking & priority
// ---------------------------------------------------------------------------

export function scorePlatform(platform: PlatformName, record: VideoRecord): number {
  if (!isEligible(platform, record)) return 0;

  const config = platformsConfig[platform] as PlatformConfig;
  const duration = getDuration(record);
  const tags = parseTags(record.tags);
  const title = record.title ?? '';
  const transcript = record.transcript ?? '';

  let score = (config.basePriority as number) ?? 1;

  switch (platform) {
    case 'tiktok': {
      if (duration < 0) return 0; // guard
      const veryShortThreshold = (config.veryShortThreshold as number) ?? 30;
      const shortBonus = (config.shortBonus as number) ?? 2;
      if (duration < veryShortThreshold) {
        score += shortBonus;
      }
      break;
    }

    case 'twitter': {
      const insights = countInsights(transcript);
      const boostPer = (config.insightBoostPerCount as number) ?? 1;
      const maxBoost = (config.maxInsightBoost as number) ?? 4;
      const keywords = (config.keywords as string[]) ?? [];
      score += Math.min(insights * boostPer, maxBoost);
      if (hasKeyword(title, keywords) || tags.some((t) => hasKeyword(t, keywords))) {
        score += 1;
      }
      break;
    }

    case 'instagram': {
      const visualKeywords = (config.visualKeywords as string[]) ?? [];
      if (hasKeyword(title, visualKeywords) || tags.some((t) => hasKeyword(t, visualKeywords))) {
        score += 2;
      }
      break;
    }

    case 'linkedin': {
      const eduKeywords = (config.educationalKeywords as string[]) ?? [];
      const eduBonus = (config.educationalBonus as number) ?? 3;
      const longBonus = (config.longBonus as number) ?? 2;
      if (hasKeyword(title, eduKeywords) || tags.some((t) => hasKeyword(t, eduKeywords))) {
        score += eduBonus;
      }
      score += longBonus;
      break;
    }

    case 'email': {
      const richBonus = (config.richTranscriptBonus as number) ?? 2;
      if (transcript.trim().length > 500) {
        score += richBonus;
      }
      break;
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// selectPlatforms — pick top platforms respecting maxPosts
// ---------------------------------------------------------------------------

export function selectPlatforms(record: VideoRecord): PlatformName[] {
  const allPlatforms: PlatformName[] = ['twitter', 'instagram', 'linkedin', 'tiktok', 'email'];

  const scored = allPlatforms
    .map((p) => ({ platform: p, score: scorePlatform(p, record) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const result: PlatformName[] = [];

  for (const { platform } of scored) {
    const config = platformsConfig[platform] as PlatformConfig;
    const maxPosts = config.maxPosts ?? 1;
    const currentCount = result.filter((p) => p === platform).length;
    if (currentCount < maxPosts) {
      result.push(platform);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// chooseContentType — pick best content type for platform
// ---------------------------------------------------------------------------

export function chooseContentType(platform: PlatformName, record: VideoRecord): string {
  const config = platformsConfig[platform] as PlatformConfig;
  const contentTypes = config.contentTypes ?? ['text'];

  switch (platform) {
    case 'tiktok':
      return 'text-overlay';
    case 'instagram': {
      // Prefer reel for shorter videos, caption for longer
      const duration = getDuration(record);
      return duration < 60 ? 'reel' : 'caption';
    }
    case 'twitter': {
      const insights = countInsights(record.transcript);
      return insights > 5 ? 'thread' : 'text';
    }
    case 'linkedin': {
      const title = record.title ?? '';
      const eduKeywords = (platformsConfig.linkedin.educationalKeywords as string[]) ?? [];
      return hasKeyword(title, eduKeywords) ? 'article' : 'share';
    }
    case 'email':
      return 'drip-email';
    default:
      return contentTypes[0] ?? 'text';
  }
}

// ---------------------------------------------------------------------------
// estimateEffort — minutes to create content for platform
// ---------------------------------------------------------------------------

export function estimateEffort(platform: PlatformName): number {
  switch (platform) {
    case 'tiktok': return 15;
    case 'twitter': return 10;
    case 'instagram': return 20;
    case 'linkedin': return 30;
    case 'email': return 25;
    default: return 20;
  }
}
