/**
 * src/platforms/instagram/postGenerator.ts
 * Instagram Post & Reel Generator
 *
 * Generates Instagram-optimized images from video content,
 * with AI-written captions and hashtag sets.
 *
 * Depends on:
 *   src/platforms/instagram.ts — postInstagramPhoto, postInstagramReel
 *   openai — GPT-4o for caption generation
 *   fluent-ffmpeg — cover frame extraction
 */

import { postInstagramPhoto, postInstagramReel } from '../instagram'
import OpenAI from 'openai'
import ffmpeg from 'fluent-ffmpeg'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import axios from 'axios'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OUTPUT_DIR = join(process.cwd(), 'outputs', 'instagram')

const IMAGE_SPECS = {
  maxFileSizeMb: 8,
  minWidth: 500,
  maxWidth: 1440,
  format: 'jpeg' as const,
}

const CAPTION_MAX_CHARS = 2200

// Instagram API helpers
async function instagramGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = `https://graph.facebook.com/v19.0${path}`
  const res = await axios.get(url, { params: { ...params, access_token: INSTAGRAM_ACCESS_TOKEN } })
  return res.data
}

async function instagramPost(path: string, data: Record<string, unknown> = {}): Promise<unknown> {
  const url = `https://graph.facebook.com/v19.0${path}`
  const res = await axios.post(url, data, { params: { access_token: INSTAGRAM_ACCESS_TOKEN } })
  return res.data
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InstagramPostGeneratorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstagramPostGeneratorError'
  }
}

// ---------------------------------------------------------------------------
// OpenAI client (lazy init)
// ---------------------------------------------------------------------------

function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new InstagramPostGeneratorError(
      'OpenAI is not configured. Set OPENAI_API_KEY in your .env file.'
    )
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CarouselSlide {
  text: string
  timestamp: number // seconds into video
}

export interface GeneratedPost {
  imagePath: string
  caption: string
  hashtags: string[]
  fullCaption: string
}

export interface GeneratedReel {
  thumbnailPath: string
  caption: string
  hashtags: string[]
  fullCaption: string
}

export interface InstagramPostOptions {
  /** Path to the source video file */
  videoPath: string
  /** AI-generated or manually provided summary/transcript */
  summary: string
  /** Output directory for generated images */
  outputDir?: string
  /** Timestamp (seconds) to extract cover frame (default: 1) */
  coverTimestamp?: number
  /** Override auto-generated caption */
  captionOverride?: string
  /** Override auto-generated hashtags */
  hashtagsOverride?: string[]
  /** Public URL for the image (required for API publishing) */
  imageUrl?: string
}

export interface InstagramReelOptions extends InstagramPostOptions {
  /** Cover thumbnail timestamp (default: 1) */
  thumbnailTimestamp?: number
  /** Public URL for the video (required for API publishing) */
  videoUrl?: string
  /** Public URL for the cover thumbnail */
  coverUrl?: string
}

// ---------------------------------------------------------------------------
// FFmpeg helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the output directory exists.
 */
async function ensureOutputDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

/**
 * Extract a cover frame from a video at a given timestamp.
 * Outputs a JPEG file within Instagram specs (maxWidth 1440px).
 *
 * @param videoPath  — Path to source video
 * @param outputPath — Where to save the JPEG
 * @param timestamp  — Second offset to capture frame
 */
export async function extractCoverFrame(
  videoPath: string,
  outputPath: string,
  timestamp = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .size('?')
      .outputOptions([`-vf", "scale='min(${IMAGE_SPECS.maxWidth}\\,iw)':-1'`])
      .output(outputPath)
      .jpeg()
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => reject(new InstagramPostGeneratorError(`FFmpeg error: ${err.message}`)))
      .run()
  })
}

/**
 * Extract multiple key frames from a video for a carousel.
 *
 * @param videoPath   — Path to source video
 * @param outputDir   — Directory to save slides
 * @param timestamps  — Array of second offsets
 * @param baseName    — Slide base filename (default: 'slide')
 */
export async function extractCarouselFrames(
  videoPath: string,
  outputDir: string,
  timestamps: number[],
  baseName = 'slide'
): Promise<string[]> {
  await ensureOutputDir(outputDir)
  const paths: string[] = []

  for (let i = 0; i < timestamps.length; i++) {
    const outputPath = join(outputDir, `${baseName}_${i + 1}.jpg`)
    await extractCoverFrame(videoPath, outputPath, timestamps[i])
    paths.push(outputPath)
  }

  return paths
}

// ---------------------------------------------------------------------------
// Caption & Hashtag Generation (OpenAI)
// ---------------------------------------------------------------------------

const INSTAGRAM_SYSTEM_PROMPT = `You are an expert Instagram copywriter for a content creator.
Write captivating, on-brand captions that drive engagement. Your tone is authentic, motivating,
and conversational — never robotic or salesy.

Rules:
- Main caption should be compelling, relatable, and spark curiosity
- Include a clear CTA (call-to-action): "Save this!", "Share with a friend!", "Drop a ❤️!", etc.
- Keep the main caption under 2200 characters total
- Write 20-30 relevant hashtags — mix of niche (500K-5M posts) and broad reach
- Use line breaks to improve readability (short lines, punchy)
- Add 2-3 strategic emoji where they add value (not excessive)
- NEVER use generic hashtag spam like #likeforlike or #follow4follow`

/**
 * Generate caption and hashtags from a summary/transcript using OpenAI GPT-4o.
 */
export async function generateCaptionAndHashtags(
  summary: string,
  options: { hashtagsOverride?: string[] } = {}
): Promise<{ caption: string; hashtags: string[]; fullCaption: string }> {
  const client = getOpenAIClient()

  if (options.hashtagsOverride && options.hashtagsOverride.length > 0) {
    const hashtags = options.hashtagsOverride
    const caption = summary.slice(0, CAPTION_MAX_CHARS - hashtags.join(' ').length - 10)
    const fullCaption = `${caption}\n\n${hashtags.join(' ')}`
    return { caption, hashtags, fullCaption }
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: INSTAGRAM_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Write an Instagram caption and hashtag set for this content:\n\n"${summary}"\n\nRespond ONLY with valid JSON in this exact format (no markdown, no explanation):\n{\n  "mainCaption": "your caption here with line breaks\\nlike this, ending with a CTA",\n  "hashtags": ["#tag1", "#tag2", ...20-30 tags]\n}`,
      },
    ],
    max_tokens: 800,
    temperature: 0.85,
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}'

  let parsed: { mainCaption: string; hashtags: string[] }
  try {
    // Strip markdown code fences if present
    const clean = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    throw new InstagramPostGeneratorError(`Failed to parse caption JSON from OpenAI: ${raw.slice(0, 200)}`)
  }

  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : []
  const mainCaption = parsed.mainCaption ?? summary.slice(0, 300)

  // Ensure total caption < 2200 chars
  const tagString = `\n\n${hashtags.join(' ')}`
  let fullCaption = `${mainCaption}${tagString}`
  if (fullCaption.length > CAPTION_MAX_CHARS) {
    const allowedMain = CAPTION_MAX_CHARS - tagString.length
    fullCaption = `${mainCaption.slice(0, allowedMain)}${tagString}`
  }

  return { caption: mainCaption, hashtags, fullCaption }
}

// ---------------------------------------------------------------------------
// createCarouselPost — carousel post creation
// ---------------------------------------------------------------------------

export interface CreateCarouselPostOptions {
  /** Path to the source video (used if imageUrls not provided) */
  videoPath: string
  /** AI-generated summary for caption generation */
  summary: string
  /** Timestamps for carousel slides (used if extracting from video) */
  timestamps?: number[]
  /** Pre-uploaded image URLs for carousel (2-10 images) */
  imageUrls?: string[]
  /** Override for auto-generated caption */
  captionOverride?: string
  /** Override for auto-generated hashtags */
  hashtagsOverride?: string[]
  /** Airtable record ID to update after publishing */
  airtableRecordId?: string
}

export interface CarouselPostResult {
  postId: string
  containerId: string
  permalink: string
}

/**
 * Create and publish an Instagram carousel post.
 *
 * @param options — Carousel post options
 */
export async function createCarouselPost(
  options: CreateCarouselPostOptions
): Promise<CarouselPostResult> {
  const { videoPath, summary, timestamps = [], imageUrls, captionOverride, hashtagsOverride, airtableRecordId } = options

  // Validate Instagram credentials
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_ACCOUNT_ID) {
    throw new InstagramPostGeneratorError('Instagram is not configured.')
  }

  // Validate video path if no imageUrls provided
  if (!imageUrls && !existsSync(videoPath)) {
    throw new InstagramPostGeneratorError('Source video not found.')
  }

  // Validate image count
  const images = imageUrls ?? []
  if (images.length < 2) {
    throw new InstagramPostGeneratorError('At least 2 image URLs are required for a carousel.')
  }
  if (images.length > 10) {
    throw new InstagramPostGeneratorError('At most 10 images are allowed for a carousel.')
  }

  // Generate caption + hashtags
  const { caption, hashtags, fullCaption } = await generateCaptionAndHashtags(summary, {
    hashtagsOverride,
  })

  const finalCaption = captionOverride ? `${captionOverride}\n\n${hashtags.join(' ')}` : fullCaption

  // Step 1: Create carousel container
  const containerRes = await instagramPost(`/me/media`, {
    media_type: 'CAROUSEL',
    caption: finalCaption,
  }) as { id: string }

  const containerId = containerRes.id

  // Step 2: Add each image as child media
  for (const imageUrl of images) {
    await instagramPost(`/me/media`, {
      media_type: 'IMAGE',
      image_url: imageUrl,
      parent_media_id: containerId,
    })
  }

  // Step 3: Publish carousel
  const publishRes = await instagramPost(`/me/media/${containerId}`, {
    access_token: INSTAGRAM_ACCESS_TOKEN,
  }) as { id: string }

  // Step 4: Get permalink
  const mediaList = await instagramGet(`/${INSTAGRAM_ACCOUNT_ID}/media`, {
    fields: 'permalink,id',
    limit: '1',
  }) as { data: Array<{ id: string; permalink: string }> }

  const latestMedia = mediaList.data?.[0]
  const permalink = latestMedia?.permalink ?? `https://www.instagram.com/p/${publishRes.id}/`

  // Step 5: Update Airtable if record ID provided
  if (airtableRecordId) {
    try {
      const { updatePostRecord } = await import('../../lib/airtable.js')
      await updatePostRecord(airtableRecordId, {
        status: 'published',
        platform: 'instagram_carousel',
        permalink,
      })
    } catch (err) {
      // Non-blocking: log and continue
      console.warn('Airtable update failed:', err)
    }
  }

  return {
    postId: publishRes.id,
    containerId,
    permalink,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an Instagram-optimized post image from a video.
 * Extracts a cover frame, generates a caption + hashtags, and optionally publishes.
 *
 * @param options.postOptions — Video path + summary
 * @param options.publish     — If true, also post via Instagram API (requires imageUrl)
 * @param options.imageUrl    — Public URL for the image (required if publish=true)
 */
export async function createPostImage(
  options: InstagramPostOptions
): Promise<GeneratedPost> {
  const {
    videoPath,
    summary,
    outputDir = OUTPUT_DIR,
    coverTimestamp = 1,
    captionOverride,
    hashtagsOverride,
  } = options

  await ensureOutputDir(outputDir)

  // 1. Extract cover frame
  const imageName = `post_${Date.now()}.jpg`
  const imagePath = join(outputDir, imageName)
  await extractCoverFrame(videoPath, imagePath, coverTimestamp)

  // 2. Generate or use override caption + hashtags
  const { caption, hashtags, fullCaption } = await generateCaptionAndHashtags(summary, {
    hashtagsOverride,
  })

  const finalCaption = captionOverride ? `${captionOverride}\n\n${hashtags.join(' ')}` : fullCaption

  return { imagePath, caption: finalCaption, hashtags, fullCaption: finalCaption }
}

/**
 * Create a Reel thumbnail image from a video.
 * Extracts a cover frame at a specified timestamp.
 *
 * @param options — Video path + summary + optional override caption
 */
export async function createReelThumbnail(options: InstagramReelOptions): Promise<GeneratedReel> {
  const {
    videoPath,
    summary,
    outputDir = OUTPUT_DIR,
    thumbnailTimestamp = 1,
    captionOverride,
    hashtagsOverride,
  } = options

  await ensureOutputDir(outputDir)

  // 1. Extract thumbnail
  const thumbName = `reel_thumb_${Date.now()}.jpg`
  const thumbnailPath = join(outputDir, thumbName)
  await extractCoverFrame(videoPath, thumbnailPath, thumbnailTimestamp)

  // 2. Generate or use override caption + hashtags
  const { caption, hashtags, fullCaption } = await generateCaptionAndHashtags(summary, {
    hashtagsOverride,
  })

  const finalCaption = captionOverride ? `${captionOverride}\n\n${hashtags.join(' ')}` : fullCaption

  return { thumbnailPath, caption: finalCaption, hashtags, fullCaption: finalCaption }
}

/**
 * Add a caption to an already-uploaded image URL and publish it.
 *
 * @param imageUrl — Public URL of the already-uploaded image
 * @param caption — Full caption (including hashtags)
 */
export async function addCaption(imageUrl: string, caption: string): Promise<{ postId: string; permalink: string }> {
  return postInstagramPhoto(caption, imageUrl)
}

/**
 * Add hashtags to an existing caption string.
 *
 * @param caption — Existing caption text
 * @param hashtags — Array of hashtag strings (with or without #)
 */
export function addHashtags(caption: string, hashtags: string[]): string {
  const formatted = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`))
  const tagString = `\n\n${formatted.join(' ')}`
  const combined = `${caption}${tagString}`
  if (combined.length > CAPTION_MAX_CHARS) {
    const allowedMain = CAPTION_MAX_CHARS - tagString.length
    return `${caption.slice(0, allowedMain)}${tagString}`
  }
  return combined
}

// ---------------------------------------------------------------------------
// CarouselSlide type
// ---------------------------------------------------------------------------

export interface CarouselSlide {
  /** Text to overlay on this slide (at the key moment) */
  text: string
  /** Video timestamp in seconds to extract the frame */
  timestamp: number
}

// ---------------------------------------------------------------------------
// extractCarouselFramesWithText — carousel with text overlays
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside FFmpeg drawtext filter.
 * Handles: single quotes, colons, backslashes, newlines.
 */
function escapeFfmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/\n/g, ' ')
    .slice(0, 200) // Safety cap for drawtext
}

/**
 * Extract carousel frames from a video, each with a text overlay at a key moment.
 *
 * @param options.videoPath  — Source video path
 * @param options.slides     — Array of {text, timestamp} for each slide
 * @param options.outputDir  — Directory to save slide images (default: outputs/instagram)
 */
export async function extractCarouselFramesWithText(options: {
  videoPath: string
  slides: CarouselSlide[]
  outputDir?: string
}): Promise<string[]> {
  const { videoPath, slides, outputDir = OUTPUT_DIR } = options

  if (!existsSync(videoPath)) {
    throw new InstagramPostGeneratorError(`Source video not found: ${videoPath}`)
  }

  if (!Array.isArray(slides) || slides.length < 2) {
    throw new InstagramPostGeneratorError('At least 2 slides are required for a carousel')
  }

  if (slides.length > 10) {
    throw new InstagramPostGeneratorError('At most 10 slides are allowed for a carousel')
  }

  await ensureOutputDir(outputDir)

  const paths: string[] = []

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const outputPath = join(outputDir, `slide_text_${i + 1}.jpg`)
    const escapedText = escapeFfmpegText(slide.text)
    const timestamp = Math.max(0, slide.timestamp)

    // Build drawtext filter:
    // - Center horizontally, near the bottom
    // - White bold text with black shadow for readability
    const textFilter = `drawtext=text='${escapedText}':` +
      `fontsize=h*0.065:` +
      `fontcolor=white:` +
      `fontweight=bold:` +
      `x=(w-text_w)/2:` +
      `y=h-text_h-60:` +
      `shadowcolor=black@0.6:` +
      `shadowx=3:shadowy=3`

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .outputOptions([
          '-vf',
          textFilter,
          '-q:v',
          '2', // JPEG quality
        ])
        .output(outputPath)
        .jpeg()
        .on('end', () => resolve())
        .on('error', (err: Error) =>
          reject(new InstagramPostGeneratorError(`FFmpeg carousel frame error: ${err.message}`))
        )
        .run()
    })

    paths.push(outputPath)
  }

  return paths
}

// ---------------------------------------------------------------------------
// End of src/platforms/instagram/postGenerator.ts
// ---------------------------------------------------------------------------
