/**
 * Twitter Content Generator
 *
 * Takes a PostTask (platform=twitter) from Airtable, fetches the video
 * transcript from the Videos table, generates a Twitter thread via GPT-4o-mini,
 * validates each tweet <280 chars, and returns the thread.
 *
 * Does NOT post to Twitter — that is handled by postAndNotify.ts.
 */

import OpenAI from 'openai';
import { getVideo } from '../lib/trello.js';
import type { PostTask } from '../router/contentRouter.js';
import {
  buildTwitterThreadUserPrompt,
  twitterThreadSystemPrompt,
  TWITTER_THREAD_MODEL,
  type TwitterThreadOutput,
} from '../prompts/twitterThread.js';

// Lazy initialization — avoids requiring OPENAI_API_KEY at module load time (e.g., in tests)
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

export class TwitterGeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitterGeneratorError';
  }
}

// ---------------------------------------------------------------------------
// Transcript validation / truncation
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPT_CHARS = 12000;

/**
 * Fetch the video record from Airtable Videos table by videoId.
 * Throws if the record is not found or transcript is missing.
 */
async function fetchVideoTranscript(videoId: string): Promise<{
  title: string;
  channelTitle: string;
  transcript: string;
}> {
  const video = await getVideo(videoId);

  if (!video) {
    throw new TwitterGeneratorError(`Video record not found for videoId=${videoId}`);
  }

  const title = video.title ?? '(Untitled)';
  const channelTitle = video.channelTitle ?? 'Unknown Channel';
  const transcript = video.transcript ?? '';

  if (!transcript.trim()) {
    throw new TwitterGeneratorError(
      `Video ${videoId} has no transcript — cannot generate Twitter content`
    );
  }

  return { title, channelTitle, transcript };
}

// ---------------------------------------------------------------------------
// Tweet validation — ensure each tweet is ≤280 chars
// ---------------------------------------------------------------------------

/**
 * Validate and fix a tweet string to be ≤280 characters.
 * Splits on sentence boundary near 280, or hard-truncates with ellipsis.
 */
export function validateTweet(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 280) return trimmed;

  // Try to split at a sentence boundary closest to but before 280
  const splitPoint = trimmed.lastIndexOf('. ', 275);
  if (splitPoint > 80) {
    return trimmed.slice(0, splitPoint + 1);
  }

  // Fallback: hard truncate with ellipsis
  return trimmed.slice(0, 277) + '…';
}

/**
 * Validate all tweets in a thread — ensure each is ≤280 chars.
 * Also caps the thread at 10 tweets.
 */
export function validateThread(output: TwitterThreadOutput): TwitterThreadOutput {
  let tweets = output.tweets.map((t) => ({
    text: validateTweet(t.text),
    mediaSuggestion: t.mediaSuggestion,
  }));

  // Cap at 10 tweets
  if (tweets.length > 10) {
    console.warn(`[TwitterGenerator] WARN: ${tweets.length} tweets generated — capping at 10`);
    tweets = tweets.slice(0, 10);
  }

  // Ensure at least 3 tweets
  if (tweets.length < 3) {
    console.warn(`[TwitterGenerator] WARN: only ${tweets.length} tweets — expected 3-10`);
  }

  return {
    tweets,
    threadTheme: output.threadTheme,
    pinnedQuote: output.pinnedQuote ? validateTweet(output.pinnedQuote) : null,
  };
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

/**
 * Generate a Twitter thread for a given PostTask.
 *
 * Steps:
 * 1. Fetch video record from Airtable by videoId
 * 2. Build user prompt with transcript + metadata
 * 3. Call GPT-4o-mini with thread prompt
 * 4. Parse and validate JSON response
 * 5. Enforce ≤280 char per tweet, cap at 10 tweets
 * 6. Return TwitterThreadOutput
 *
 * @param postTask — PostTask from Airtable Posts table (platform=twitter)
 * @param tone — desired tweet tone (default: professional)
 * @returns TwitterThreadOutput ready for posting
 */
export async function generateTwitterContent(
  postTask: PostTask,
  tone: 'professional' | 'casual' | 'controversial' = 'professional'
): Promise<TwitterThreadOutput> {
  const { videoId } = postTask;

  console.info(`[TwitterGenerator] Generating Twitter thread for videoId=${videoId}`);

  // Step 1: fetch video + transcript
  const { title, channelTitle, transcript } = await fetchVideoTranscript(videoId);

  // Step 2: build prompt
  const userPrompt = buildTwitterThreadUserPrompt({
    title,
    channelTitle,
    transcript,
    tone,
  });

  // Step 3: call LLM
  let rawOutput: string;
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: TWITTER_THREAD_MODEL,
      messages: [
        { role: 'system', content: twitterThreadSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2048,
    });

    rawOutput = completion.choices[0]?.message?.content ?? '';
    if (!rawOutput.trim()) {
      throw new TwitterGeneratorError('LLM returned empty response');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TwitterGeneratorError(`OpenAI call failed: ${msg}`);
  }

  // Step 4: parse JSON
  let parsed: TwitterThreadOutput;
  try {
    // Strip markdown code fences if present
    const jsonStr = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(jsonStr) as TwitterThreadOutput;
  } catch {
    throw new TwitterGeneratorError(
      `LLM output is not valid JSON: ${rawOutput.slice(0, 200)}`
    );
  }

  // Validate structure
  if (!Array.isArray(parsed.tweets) || parsed.tweets.length === 0) {
    throw new TwitterGeneratorError(
      `LLM output missing or empty tweets array: ${rawOutput.slice(0, 200)}`
    );
  }

  // Step 5: validate thread (≤280 chars per tweet, cap at 10)
  const validated = validateThread(parsed);

  console.info(
    `[TwitterGenerator] Generated ${validated.tweets.length} tweets (theme: "${validated.threadTheme}")`
  );

  return validated;
}

// ---------------------------------------------------------------------------
// Convenience: check if transcript is available before full generation
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
