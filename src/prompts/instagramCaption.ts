/**
 * src/prompts/instagramCaption.ts
 * Instagram Caption & Hashtag Prompt
 *
 * System prompt and LLM output format for generating Instagram captions
 * and hashtag sets. Used by both postGenerator and reelGenerator.
 *
 * Card: 69c9acdcf6262128052c1ee0
 */

import OpenAI from 'openai'

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

export const INSTAGRAM_SYSTEM_PROMPT = `You are an expert Instagram copywriter for a content creator.
Write captivating, on-brand captions that drive engagement. Your tone is authentic, motivating,
and conversational — never robotic or salesy.

Rules:
- Main caption should be compelling, relatable, and spark curiosity
- Include a clear CTA (call-to-action): "Save this!", "Share with a friend!", "Drop a 👋,?!", etc.
- Keep the main caption under 2200 characters total
- Write 20-30 relevant hashtags — mix of niche (500K-5M posts) and broad reach
- Use line breaks to improve readability (short lines, punchy)
- Add 2-3 strategic emoji where they add value (not excessive)
- NEVER use generic hashtag spam like #likeforlike or #follow4follow`

// ---------------------------------------------------------------------------
// Reel-specific System Prompt
// ---------------------------------------------------------------------------

export const INSTAGRAM_REEL_SYSTEM_PROMPT = `You are an expert Instagram Reels copywriter.
Write captivating, on-brand captions that drive engagement. Your tone is authentic, motivating,
and conversational — never robotic or salesy.

Rules:
- Main caption should be compelling, relatable, and spark curiosity
- Include a clear CTA (call-to-action): "Follow for more!", "Save this!", "Share with a friend!", etc.
- Keep the main caption under 2200 characters total
- Write 20-30 relevant hashtags — mix of niche (500K-5M posts) and broad reach
- Use line breaks to improve readability (short lines, punchy)
- Add 2-3 strategic emoji where they add value (not excessive)
- NEVER use generic hashtag spam like #likeforlike or #follow4follow`

// ---------------------------------------------------------------------------
// LLM Output Schema
// ---------------------------------------------------------------------------

export interface InstagramCaptionOutput {
  mainCaption: string
  hashtags: string[]
}

// ---------------------------------------------------------------------------
// User Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Build the user prompt for caption generation.
 *
 * @param summary  — AI-generated or manually provided summary/transcript
 * @param platform — 'post' | 'carousel' | 'reel'
 */
export function buildInstagramCaptionPrompt(
  summary: string,
  platform: 'post' | 'carousel' | 'reel' = 'post'
): string {
  const platformLabel = platform === 'carousel' ? 'carousel post' : platform === 'reel' ? 'Reel' : 'post'
  return `Write an Instagram ${platformLabel} caption and hashtag set for this content:

"${summary}"

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "mainCaption": "your caption here with line breaks\\nlike this, ending with a CTA",
  "hashtags": ["#tag1", "#tag2", ...20-30 tags]
}`
}

// ---------------------------------------------------------------------------
// Caption Generator
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

/**
 * Generate caption and hashtags using OpenAI GPT-4o.
 *
 * @param summary   — Content summary or transcript
 * @param platform  — Content type: 'post' | 'carousel' | 'reel'
 * @param overrides — Optional caption/hashtag overrides
 */
export async function generateInstagramCaption(
  summary: string,
  platform: 'post' | 'carousel' | 'reel' = 'post',
  overrides: { captionOverride?: string; hashtagsOverride?: string[] } = {}
): Promise<{ caption: string; hashtags: string[]; fullCaption: string }> {
  if (!OPENAI_API_KEY) {
    throw new InstagramCaptionError('OpenAI is not configured. Set OPENAI_API_KEY in your .env file.')
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY })
  const systemPrompt = platform === 'reel' ? INSTAGRAM_REEL_SYSTEM_PROMPT : INSTAGRAM_SYSTEM_PROMPT

  if (overrides.captionOverride || overrides.hashtagsOverride) {
    const hashtags = overrides.hashtagsOverride ?? []
    const tagString = hashtags.length > 0 ? `\n\n${hashtags.join(' ')}` : ''
    const caption = overrides.captionOverride ?? summary.slice(0, 500)
    return { caption, hashtags, fullCaption: `${caption}${tagString}` }
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildInstagramCaptionPrompt(summary, platform) },
    ],
    max_tokens: 800,
    temperature: 0.85,
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}'

  let parsed: InstagramCaptionOutput
  try {
    // Strip markdown code fences if present
    const clean = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    throw new InstagramCaptionError(`Failed to parse caption JSON from OpenAI: ${raw.slice(0, 200)}`)
  }

  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : []
  const mainCaption = parsed.mainCaption ?? summary.slice(0, 300)

  // Ensure total caption < 2200 chars
  const tagString = `\n\n${hashtags.join(' ')}`
  let fullCaption = `${mainCaption}${tagString}`
  if (fullCaption.length > 2200) {
    const allowedMain = 2200 - tagString.length
    fullCaption = `${mainCaption.slice(0, allowedMain)}${tagString}`
  }

  return { caption: mainCaption, hashtags, fullCaption }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class InstagramCaptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstagramCaptionError'
  }
}
