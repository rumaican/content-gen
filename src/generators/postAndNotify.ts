/**
 * postAndNotify — Post a Twitter thread and update Airtable.
 *
 * This is the final step in the Twitter content pipeline:
 * 1. Post the first tweet
 * 2. Reply to it with subsequent tweets (threading via in_reply_to_status_id)
 * 3. Update the Airtable Posts table with status='generated' and the generated content
 *
 * Rate limit handling: on 429, exponential backoff with up to 5 retries.
 */

import { getTwitterClient } from '../auth/twitter.js';
import { pipelineConfig } from '../lib/airtable.js';
import type { PostTask } from '../router/contentRouter.js';
import type { TwitterThreadOutput } from '../prompts/twitterThread.js';

const AIRTABLE_BASE = 'https://api.airtable.com/v0';

const USER_CONTEXT_CONFIG_ERROR =
  'Twitter user-context client is not configured. ' +
  'Ensure TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and ' +
  'TWITTER_ACCESS_SECRET are set in your .env file.';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PostAndNotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostAndNotifyError';
  }
}

// ---------------------------------------------------------------------------
// Rate limit retry helper
// ---------------------------------------------------------------------------

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 5, baseDelayMs = 1000 } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Check if it's a rate limit error (429)
      const is429 =
        err instanceof Error &&
        (err.message.includes('429') ||
          err.message.includes('rate limit') ||
          err.message.includes('Too Many Requests'));

      if (is429 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[PostAndNotify] Rate limited — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Twitter thread posting
// ---------------------------------------------------------------------------

/**
 * Post a Twitter thread in order, using in_reply_to_status_id for threading.
 *
 * @param thread — Validated TwitterThreadOutput from generateTwitterContent
 * @returns Array of posted tweet IDs in order
 */
async function postThreadToTwitter(thread: TwitterThreadOutput): Promise<string[]> {
  const client = getTwitterClient();

  if (!client) {
    throw new PostAndNotifyError(USER_CONTEXT_CONFIG_ERROR);
  }

  const postedIds: string[] = [];

  for (let i = 0; i < thread.tweets.length; i++) {
    const tweet = thread.tweets[i];
    const isReply = i > 0;

    const postFn = async () => {
      if (isReply) {
        const replyToId = postedIds[i - 1];
        const result = await client.v2.tweet({
          text: tweet.text,
          reply: { in_reply_to_tweet_id: replyToId },
        });
        return result.data.id;
      } else {
        const result = await client.v2.tweet(tweet.text);
        return result.data.id;
      }
    };

    const tweetId = await withRetry(postFn, { maxRetries: 5, baseDelayMs: 1000 });
    postedIds.push(tweetId);

    console.info(
      `[PostAndNotify] Posted tweet ${i + 1}/${thread.tweets.length} (id=${tweetId})${isReply ? ` [reply to ${postedIds[i - 1]}]` : ''}`
    );

    // Small delay between tweets to avoid burst rate limits
    if (i < thread.tweets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return postedIds;
}

// ---------------------------------------------------------------------------
// Airtable Posts table update
// ---------------------------------------------------------------------------

/**
 * Update a PostTask record in the Airtable Posts table.
 * Updates status to 'generated' and stores the generated content + posted tweet IDs.
 */
async function updatePostTaskInAirtable(
  postTask: PostTask,
  thread: TwitterThreadOutput,
  postedTweetIds: string[]
): Promise<void> {
  const { AIRTABLE_BASE_ID, AIRTABLE_API_KEY } = pipelineConfig;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    console.warn('[PostAndNotify] Airtable credentials missing — skipping Posts table update');
    return;
  }

  // Find the PostTask record by videoId + platform
  const filterFormula = `AND({videoId}="${postTask.videoId}", {platform}="twitter")`;
  const listUrl = new URL(`${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/Posts`);
  listUrl.searchParams.set('filterByFormula', filterFormula);

  const listRes = await fetch(listUrl.toString(), {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!listRes.ok) {
    const body = await listRes.text();
    throw new PostAndNotifyError(`Airtable list PostTask failed: ${listRes.status} ${body}`);
  }

  const listData = (await listRes.json()) as { records: Array<{ id: string; fields: Record<string, unknown> }> };

  if (!listData.records || listData.records.length === 0) {
    throw new PostAndNotifyError(`No PostTask record found for videoId=${postTask.videoId}, platform=twitter`);
  }

  const recordId = listData.records[0].id;

  // Build generated content payload
  const generatedContent = {
    tweets: thread.tweets.map((t) => ({ text: t.text, mediaSuggestion: t.mediaSuggestion })),
    threadTheme: thread.threadTheme,
    pinnedQuote: thread.pinnedQuote,
    postedTweetIds,
    postedAt: new Date().toISOString(),
  };

  const updateUrl = `${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/Posts/${recordId}`;
  const updateRes = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        status: 'generated',
        generatedContent: JSON.stringify(generatedContent),
        postedAt: new Date().toISOString(),
      },
    }),
  });

  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new PostAndNotifyError(`Airtable update PostTask failed: ${updateRes.status} ${body}`);
  }

  console.info(`[PostAndNotify] Updated Airtable Posts record ${recordId} → status=generated`);
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

/**
 * Check if a PostTask already has status='generated'.
 * Returns true if already generated (skip processing).
 */
async function isAlreadyGenerated(postTask: PostTask): Promise<boolean> {
  const { AIRTABLE_BASE_ID, AIRTABLE_API_KEY } = pipelineConfig;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return false;

  const filterFormula = `AND({videoId}="${postTask.videoId}", {platform}="twitter")`;
  const listUrl = new URL(`${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/Posts`);
  listUrl.searchParams.set('filterByFormula', filterFormula);

  try {
    const res = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { records: Array<{ fields: Record<string, unknown> }> };
    if (!data.records || data.records.length === 0) return false;

    const status = data.records[0].fields['status'] as string | undefined;
    return status === 'generated';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Post a Twitter thread and update Airtable.
 *
 * This is the final step — call this after generateTwitterContent().
 *
 * @param thread — TwitterThreadOutput from generateTwitterContent()
 * @param postTask — Original PostTask from Airtable
 */
export async function postTwitterThread(
  thread: TwitterThreadOutput,
  postTask: PostTask
): Promise<string[]> {
  console.info(
    `[PostAndNotify] Starting post for videoId=${postTask.videoId} (${thread.tweets.length} tweets)`
  );

  // Idempotency: skip if already generated
  if (await isAlreadyGenerated(postTask)) {
    console.info(`[PostAndNotify] PostTask already generated — skipping`);
    return [];
  }

  // Step 1: post thread to Twitter
  const postedTweetIds = await postThreadToTwitter(thread);

  // Step 2: update Airtable Posts table
  await updatePostTaskInAirtable(postTask, thread, postedTweetIds);

  console.info(`[PostAndNotify] Done — ${postedTweetIds.length} tweets posted`);

  return postedTweetIds;
}
