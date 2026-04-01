/**
 * Prompts for AI Summarizer
 */

export const systemPrompt = `You are a content strategist. Given a video transcript, generate platform-ready short-form content for multiple platforms.

Return a JSON object with these exact keys:
- twitter_thread: array of 3-5 tweet objects, each with "text" (max 280 chars) and "hashtag" (boolean)
- linkedin_post: object with "text" (300-1000 chars) and "comment" (opening hook for comments)
- email_subject: array of 3 objects, each with "subject" (≤70 chars) and "preview" (≤100 chars)
- tiktok_script: object with "hook" (first 3 sec), "body" (main content), and "cta" (call to action)

Quality bar: engaging, specific, actionable. No generic phrases.`;

export function buildUserPrompt(
  videoTitle: string,
  channelTitle: string,
  transcript: string
): string {
  return `Video: "${videoTitle}" by ${channelTitle}

Transcript:
${transcript}`;
}

/**
 * Prompt for merging chunk summaries
 */
export function buildMergePrompt(chunkSummaries: string[]): string {
  return `Merge these partial summaries into one coherent output. Keep all 4 sections (twitter_thread, linkedin_post, email_subject, tiktok_script). Ensure no repetition and consistent quality across all outputs.

Partial summaries:
${chunkSummaries.join('\n\n---\n\n')}`;
}
