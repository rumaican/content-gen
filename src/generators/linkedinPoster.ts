/**
 * linkedinPoster — Publish LinkedIn content and update Airtable.
 *
 * Final step in the LinkedIn content pipeline:
 * 1. Idempotency check — skip if already generated
 * 2. Publish short post to LinkedIn via /ugcPosts
 * 3. Optionally publish article to LinkedIn
 * 4. Update Airtable Posts table with status='generated', postUrl, generatedContent
 *
 * Supports both user posts (urn:li:person) and organization posts (urn:li:organization).
 */

import { getStoredAccessToken, getStoredOrgId } from '../auth/linkedin.js';
import { pipelineConfig, AIRTABLE_BASE } from '../lib/airtable.js';
import type { PostTask } from '../router/contentRouter.js';
import type { LinkedInPostOutput } from '../prompts/linkedinPost.js';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LinkedInPosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedInPosterError';
  }
}

// ---------------------------------------------------------------------------
// Rate limit retry
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

      const is429 =
        err instanceof Error &&
        (err.message.includes('429') ||
          err.message.includes('rate limit') ||
          err.message.includes('Too Many Requests'));

      if (is429 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[LinkedInPoster] Rate limited — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
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
// Low-level LinkedIn API helper
// ---------------------------------------------------------------------------

async function linkedInFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const accessToken = getStoredAccessToken();
  if (!accessToken) {
    throw new LinkedInPosterError(
      'LinkedIn access token is not set. Complete OAuth flow or set LINKEDIN_ACCESS_TOKEN in .env.'
    );
  }

  const url = endpoint.startsWith('http') ? endpoint : `${LINKEDIN_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202304',
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new LinkedInPosterError(
      `LinkedIn API error for ${endpoint}: ${response.status} ${text}`
    );
  }

  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Build author URN
// ---------------------------------------------------------------------------

function buildAuthorUrn(useOrg: boolean): string {
  if (useOrg) {
    const orgId = getStoredOrgId() || process.env.LINKEDIN_ORG_ID;
    if (!orgId) {
      throw new LinkedInPosterError(
        'Organization ID not configured. Set LINKEDIN_ORG_ID in .env or pass useOrg=false.'
      );
    }
    return `urn:li:organization:${orgId}`;
  }

  // For user posts, LinkedIn uses your own person URN
  // We need to look it up — for now, use a placeholder and let the API resolve it
  // via the /me endpoint pattern. The ugcPosts API accepts "me" as author for user tokens.
  return 'urn:li:person:me';
}

// ---------------------------------------------------------------------------
// Publish short post (share)
// ---------------------------------------------------------------------------

interface PublishResult {
  postId: string;
  postUrl: string;
}

/**
 * Publish a short post to LinkedIn via /ugcPosts.
 *
 * @param text — Post text (up to 3000 chars)
 * @param useOrg — Post as organization (true) or user (false)
 * @param linkUrl — Optional URL to attach (video or article)
 */
async function publishShortPost(
  text: string,
  useOrg: boolean,
  linkUrl?: string
): Promise<PublishResult> {
  const authorUrn = buildAuthorUrn(useOrg);

  const ugcPostBody = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text,
        },
        shareMediaCategory: linkUrl ? 'ARTICLE' : 'NONE',
        media: linkUrl
          ? [{ status: 'READY', originalUrl: linkUrl }]
          : [],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const result = (await withRetry(() =>
    linkedInFetch('/ugcPosts', {
      method: 'POST',
      body: JSON.stringify(ugcPostBody),
    })
  )) as { id: string };

  const postId = result.id;
  // Permalink format: https://www.linkedin.com/feed/update/{urn:li:ugcPost:{id}}
  const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

  return { postId, postUrl };
}

// ---------------------------------------------------------------------------
// Publish article
// ---------------------------------------------------------------------------

/**
 * Publish an article to LinkedIn via /ugcPosts with shareMediaCategory=ARTICLE.
 *
 * @param title — Article headline
 * @param body — Article body text (with bullet points)
 * @param videoUrl — Source video URL
 * @param useOrg — Post as organization (true) or user (false)
 */
async function publishArticle(
  title: string,
  body: string,
  videoUrl: string,
  useOrg: boolean
): Promise<PublishResult> {
  const authorUrn = buildAuthorUrn(useOrg);

  // Combine title and body, include video attribution
  const articleText = `${title}\n\n${body}\n\n${videoUrl}`;

  const ugcPostBody = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: articleText,
        },
        shareMediaCategory: 'ARTICLE',
        media: [
          {
            status: 'READY',
            originalUrl: videoUrl,
            title,
          },
        ],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const result = (await withRetry(() =>
    linkedInFetch('/ugcPosts', {
      method: 'POST',
      body: JSON.stringify(ugcPostBody),
    })
  )) as { id: string };

  const postId = result.id;
  const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

  return { postId, postUrl };
}

// ---------------------------------------------------------------------------
// Airtable Posts table update
// ---------------------------------------------------------------------------

async function updatePostTaskInAirtable(
  postTask: PostTask,
  content: LinkedInPostOutput,
  shortPostResult: PublishResult,
  articleResult: PublishResult | null
): Promise<void> {
  const { AIRTABLE_BASE_ID, AIRTABLE_API_KEY } = pipelineConfig;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    console.warn('[LinkedInPoster] Airtable credentials missing — skipping Posts table update');
    return;
  }

  // Find the PostTask record by videoId + platform
  const filterFormula = `AND({videoId}="${postTask.videoId}", {platform}="linkedin")`;
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
    throw new LinkedInPosterError(`Airtable list PostTask failed: ${listRes.status} ${body}`);
  }

  const listData = (await listRes.json()) as {
    records: Array<{ id: string; fields: Record<string, unknown> }>;
  };

  if (!listData.records || listData.records.length === 0) {
    throw new LinkedInPosterError(
      `No PostTask record found for videoId=${postTask.videoId}, platform=linkedin`
    );
  }

  const recordId = listData.records[0].id;

  // Build generated content payload
  const generatedContent = {
    shortPost: {
      text: content.shortPost,
      postId: shortPostResult.postId,
      postUrl: shortPostResult.postUrl,
    },
    article: articleResult
      ? {
          title: content.articleTitle,
          body: content.articleBody,
          bulletPoints: content.bulletPoints,
          postId: articleResult.postId,
          postUrl: articleResult.postUrl,
        }
      : null,
    videoUrl: content.videoUrl,
    authorAttribution: content.authorAttribution,
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
        postUrl: shortPostResult.postUrl, // primary post URL
      },
    }),
  });

  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new LinkedInPosterError(`Airtable update PostTask failed: ${updateRes.status} ${body}`);
  }

  console.info(`[LinkedInPoster] Updated Airtable Posts record ${recordId} → status=generated`);
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

async function isAlreadyGenerated(postTask: PostTask): Promise<boolean> {
  const { AIRTABLE_BASE_ID, AIRTABLE_API_KEY } = pipelineConfig;

  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return false;

  const filterFormula = `AND({videoId}="${postTask.videoId}", {platform}="linkedin")`;
  const listUrl = new URL(`${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/Posts`);
  listUrl.searchParams.set('filterByFormula', filterFormula);

  try {
    const res = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!res.ok) return false;

    const data = (await res.json()) as {
      records: Array<{ fields: Record<string, unknown> }>;
    };
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

export interface PostLinkedInOptions {
  /** Post as organization (Company Page) instead of personal profile */
  useOrg?: boolean;
  /** Skip publishing the article (only publish short post) */
  skipArticle?: boolean;
}

/**
 * Publish LinkedIn content (short post + article) and update Airtable.
 *
 * Call this after generateLinkedInContent().
 *
 * @param content — LinkedInPostOutput from generateLinkedInContent()
 * @param postTask — Original PostTask from Airtable
 * @param options — Posting options (useOrg, skipArticle)
 * @returns { shortPost: PublishResult, article: PublishResult | null }
 */
export async function postLinkedInContent(
  content: LinkedInPostOutput,
  postTask: PostTask,
  options: PostLinkedInOptions = {}
): Promise<{ shortPost: PublishResult; article: PublishResult | null }> {
  const { useOrg = false, skipArticle = false } = options;

  console.info(
    `[LinkedInPoster] Posting LinkedIn content for videoId=${postTask.videoId} (useOrg=${useOrg}, skipArticle=${skipArticle})`
  );

  // Idempotency: skip if already generated
  if (await isAlreadyGenerated(postTask)) {
    console.info('[LinkedInPoster] PostTask already generated — skipping');
    return { shortPost: { postId: '', postUrl: '' }, article: null };
  }

  // Step 1: publish short post
  const shortPostResult = await withRetry(
    () => publishShortPost(content.shortPost, useOrg, content.videoUrl),
    { maxRetries: 5, baseDelayMs: 1000 }
  );

  console.info(
    `[LinkedInPoster] Published short post — id=${shortPostResult.postId}, url=${shortPostResult.postUrl}`
  );

  // Step 2: optionally publish article
  let articleResult: PublishResult | null = null;
  if (!skipArticle) {
    try {
      articleResult = await withRetry(
        () => publishArticle(content.articleTitle, content.articleBody, content.videoUrl, useOrg),
        { maxRetries: 5, baseDelayMs: 1000 }
      );
      console.info(
        `[LinkedInPoster] Published article — id=${articleResult.postId}, url=${articleResult.postUrl}`
      );
    } catch (err) {
      // Non-fatal: log and continue — short post already published
      console.warn(
        `[LinkedInPoster] WARN: article publish failed (continuing with short post only): ${err}`
      );
    }
  }

  // Step 3: update Airtable
  await updatePostTaskInAirtable(postTask, content, shortPostResult, articleResult);

  console.info('[LinkedInPoster] Done — LinkedIn content posted and Airtable updated');

  return { shortPost: shortPostResult, article: articleResult };
}
