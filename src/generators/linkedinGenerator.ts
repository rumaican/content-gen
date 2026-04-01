/**
 * LinkedIn Content Generator
 *
 * Takes a PostTask (platform=linkedin) from Airtable, fetches the video
 * transcript from the Videos table, generates a short post + article via GPT-4o-mini,
 * validates the output, and returns LinkedInPostOutput.
 *
 * Does NOT post to LinkedIn — that is handled by linkedinPoster.ts.
 */

import OpenAI from 'openai';
import { getVideo } from '../lib/trello.js';
import type { PostTask } from '../router/contentRouter.js';
import {
  buildLinkedInPostUserPrompt,
  linkedinPostSystemPrompt,
  LINKEDIN_POST_MODEL,
  validateLinkedInOutput,
  type LinkedInPostOutput,
} from '../prompts/linkedinPost.js';

// Lazy initialization — avoids requiring OPENAI_API_KEY at module load time
let _openai: OpenAI | undefined;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI();
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LinkedInGeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedInGeneratorError';
  }
}

// ---------------------------------------------------------------------------
// Video transcript fetch
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPT_CHARS = 12000;

interface VideoMeta {
  title: string;
  channelTitle: string;
  transcript: string;
  videoUrl?: string;
}

/**
 * Fetch the video record from Airtable Videos table by videoId.
 * Throws if the record is not found or transcript is missing.
 */
async function fetchVideoTranscript(videoId: string): Promise<VideoMeta> {
  const video = await getVideo(videoId);

  if (!video) {
    throw new LinkedInGeneratorError(`Video record not found for videoId=${videoId}`);
  }

  const title = video.title ?? '(Untitled)';
  const channelTitle = video.channelTitle ?? 'Unknown Channel';
  const transcript = video.transcript ?? '';
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  if (!transcript.trim()) {
    throw new LinkedInGeneratorError(
      `Video ${videoId} has no transcript — cannot generate LinkedIn content`
    );
  }

  return { title, channelTitle, transcript, videoUrl };
}

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

/**
 * Parse JSON from LLM output, stripping markdown code fences.
 */
function parseLLMJson<T>(raw: string, context: string): T {
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new LinkedInGeneratorError(
      `LLM output is not valid JSON${context}: ${jsonStr.slice(0, 200)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export interface GenerateLinkedInOptions {
  /** Override tone for content generation (default: professional) */
  tone?: 'professional' | 'conversational' | 'controversial';
  /** Skip validation (not recommended) */
  skipValidation?: boolean;
}

/**
 * Generate LinkedIn content (short post + article) for a given PostTask.
 *
 * Steps:
 * 1. Fetch video record from Airtable by videoId
 * 2. Build user prompt with transcript + metadata
 * 3. Call GPT-4o-mini
 * 4. Parse and validate JSON response
 * 5. Validate character limits and bullet point count
 * 6. Return LinkedInPostOutput
 *
 * @param postTask — PostTask from Airtable Posts table (platform=linkedin)
 * @param options — Generation options (tone, skipValidation)
 * @returns LinkedInPostOutput ready for posting
 */
export async function generateLinkedInContent(
  postTask: PostTask,
  options: GenerateLinkedInOptions = {}
): Promise<LinkedInPostOutput> {
  const { videoId } = postTask;
  const { tone = 'professional', skipValidation = false } = options;

  console.info(`[LinkedInGenerator] Generating LinkedIn content for videoId=${videoId}`);

  // Step 1: fetch video + transcript
  const { title, channelTitle, transcript, videoUrl } = await fetchVideoTranscript(videoId);

  // Step 2: build prompt
  const userPrompt = buildLinkedInPostUserPrompt({
    title,
    channelTitle,
    transcript,
    videoUrl,
    tone,
  });

  // Step 3: call LLM
  let rawOutput: string;
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: LINKEDIN_POST_MODEL,
      messages: [
        { role: 'system', content: linkedinPostSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    rawOutput = completion.choices[0]?.message?.content ?? '';
    if (!rawOutput.trim()) {
      throw new LinkedInGeneratorError('LLM returned empty response');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LinkedInGeneratorError(`OpenAI call failed: ${msg}`);
  }

  // Step 4: parse JSON
  let parsed: LinkedInPostOutput;
  try {
    parsed = parseLLMJson<LinkedInPostOutput>(rawOutput, '');
  } catch (err) {
    throw err; // already a LinkedInGeneratorError
  }

  // Validate required fields exist (even if validation is skipped for length)
  if (!parsed.shortPost) throw new LinkedInGeneratorError('LLM output missing shortPost');
  if (!parsed.articleTitle) throw new LinkedInGeneratorError('LLM output missing articleTitle');
  if (!parsed.articleBody) throw new LinkedInGeneratorError('LLM output missing articleBody');
  if (!parsed.bulletPoints) parsed.bulletPoints = [];
  if (!parsed.videoUrl) parsed.videoUrl = videoUrl ?? `https://www.youtube.com/watch?v=${videoId}`;
  if (!parsed.authorAttribution) {
    parsed.authorAttribution = `By @${channelTitle}`;
  }

  // Step 5: validate
  if (!skipValidation) {
    const result = validateLinkedInOutput(parsed);
    if (!result.valid) {
      const errorMsg = result.errors.join('; ');
      throw new LinkedInGeneratorError(
        `LinkedIn content validation failed: ${errorMsg}`
      );
    }
  }

  console.info(
    `[LinkedInGenerator] Generated — shortPost=${parsed.shortPost.length} chars, ` +
    `articleBody=${parsed.articleBody.length} chars, bullets=${parsed.bulletPoints.length}`
  );

  return parsed;
}

// ---------------------------------------------------------------------------
// Pre-flight check
// ---------------------------------------------------------------------------

/**
 * Returns true if a transcript is available for the given videoId,
 * without doing the full LLM generation. Useful for pre-flight checks.
 */
export async function hasTranscript(videoId: string): Promise<boolean> {
  try {
    const { transcript } = await fetchVideoTranscript(videoId);
    return transcript.trim().length > 0;
  } catch {
    return false;
  }
}
