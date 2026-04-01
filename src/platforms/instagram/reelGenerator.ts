/**
 * src/platforms/instagram/reelGenerator.ts
 * Instagram Reel Generator (Video)
 *
 * Takes a full video and creates a TikTok/Instagram Reel —
 * vertical 9:16, 30–90 seconds, with text overlays (hook + CTA)
 * and posts to Instagram Reels API.
 *
 * Card: 69c9aaff32c905c5c42ccae9
 *
 * Depends on:
 *   fluent-ffmpeg        — video trimming & text overlays
 *   postInstagramReel    — src/platforms/instagram.ts (publishing)
 *   openai               — GPT-4o for caption generation & hook scoring
 *   src/lib/airtable.ts  — record status updates
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import OpenAI from 'openai'
import { postInstagramReel } from '../instagram.js'
import { updateVideoRecord } from '../../lib/trello.js'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OUTPUT_DIR = path.join(process.cwd(), 'outputs', 'reels')

// Instagram Reel specs
const REEL_WIDTH = 1080
const REEL_HEIGHT = 1920
const REEL_FPS = 30
const REEL_CODEC = 'libx264'
const REEL_AUDIO_CODEC = 'aac'
const REEL_AUDIO_RATE = 48000
const REEL_MAX_DURATION_S = 90
const REEL_MIN_DURATION_S = 30
const REEL_MAX_SIZE_MB = 650
const HOOK_DURATION_S = 3   // first N seconds: hook text overlay
const CTA_DURATION_S = 5    // last N seconds: follow CTA end card

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ReelGeneratorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReelGeneratorError'
  }
}

// ---------------------------------------------------------------------------
// OpenAI client (lazy init)
// ---------------------------------------------------------------------------

function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new ReelGeneratorError('OpenAI is not configured. Set OPENAI_API_KEY in your .env file.')
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY })
}

// ---------------------------------------------------------------------------
// FFmpeg availability
// ---------------------------------------------------------------------------

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version', { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// FFmpeg run helpers (fluent-ffmpeg promise wrappers)
// ---------------------------------------------------------------------------

function ffmpegPromise(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(new ReelGeneratorError(`FFmpeg error: ${err.message}`)))
  })
}

// ---------------------------------------------------------------------------
// Video info
// ---------------------------------------------------------------------------

interface VideoInfo {
  duration: number   // seconds
  width: number
  height: number
  aspectRatio: 'landscape' | 'portrait' | 'square'
}

async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(new ReelGeneratorError(`ffprobe error: ${err.message}`))
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      if (!videoStream) return reject(new ReelGeneratorError('No video stream found'))

      const duration = metadata.format.duration ?? 0
      const width = videoStream.width ?? 0
      const height = videoStream.height ?? 0
      const ratio = width / height

      let aspectRatio: VideoInfo['aspectRatio'] = 'square'
      if (ratio > 1.1) aspectRatio = 'landscape'
      else if (ratio < 0.9) aspectRatio = 'portrait'

      resolve({ duration, width, height, aspectRatio })
    })
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReelHook {
  text: string          // e.g. "3 things you didn't know about..."
  startTime: number     // seconds
  endTime: number       // seconds
}

export interface GeneratedReel {
  outputPath: string    // local MP4 path
  caption: string
  hashtags: string[]
  fullCaption: string
  thumbnailPath: string
  duration: number
}

export interface ReelGeneratorOptions {
  /** Path to source video (already processed with text overlay + music) */
  videoPath: string
  /** AI-generated hook script / summary from AI Summarizer */
  hookScript: string
  /** Optional override for auto-generated caption */
  captionOverride?: string
  /** Optional override for auto-generated hashtags */
  hashtagsOverride?: string[]
  /** Output directory (default: outputs/reels) */
  outputDir?: string
  /** Public video URL for publishing (required if publish=true) */
  videoUrl?: string
  /** Public thumbnail URL for publishing */
  coverUrl?: string
  /** Publish to Instagram after generating (default: false) */
  publish?: boolean
  /** Airtable record ID to update after publishing */
  airtableRecordId?: string
}

// ---------------------------------------------------------------------------
// Hook text generation
// ---------------------------------------------------------------------------

/**
 * Use GPT-4o to generate a compelling hook sentence for the first 3 seconds.
 * The hook should be surprising, curiosity-driven, and match the topic.
 */
async function generateHookText(hookScript: string): Promise<string> {
  const client = getOpenAIClient()

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert short-form video copywriter. ' +
          'Generate ONE short, punchy hook sentence (max 10 words) designed for the FIRST 3 SECONDS of a video. ' +
          'It should create curiosity or promise value. Examples: ' +
          '"3 things理发店不会告诉你", "I tried this for 30 days and...", ' +
          '"99%的人都不知道...". Be direct, no preamble.',
      },
      {
        role: 'user',
        content: `Based on this topic/script, generate the opening hook text (max 10 words):\n\n"${hookScript.slice(0, 500)}"`,
      },
    ],
    max_tokens: 50,
    temperature: 0.9,
  })

  const hook = response.choices[0]?.message?.content?.trim() ?? 'Watch this!'
  // Strip any quotes
  return hook.replace(/^["']|["']$/g, '').slice(0, 80)
}

// ---------------------------------------------------------------------------
// Caption & Hashtag Generation
// ---------------------------------------------------------------------------

const INSTAGRAM_REEL_SYSTEM_PROMPT = `You are an expert Instagram Reels copywriter.
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

export async function generateCaptionAndHashtags(
  hookScript: string,
  options: { captionOverride?: string; hashtagsOverride?: string[] } = {}
): Promise<{ caption: string; hashtags: string[]; fullCaption: string }> {
  const client = getOpenAIClient()

  if (options.captionOverride) {
    const hashtags = options.hashtagsOverride ?? []
    const tagString = hashtags.length > 0 ? `\n\n${hashtags.join(' ')}` : ''
    const full = `${options.captionOverride}${tagString}`
    return { caption: options.captionOverride, hashtags, fullCaption: full }
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: INSTAGRAM_REEL_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Write an Instagram Reel caption and hashtag set for this content:\n\n"${hookScript}"\n\nRespond ONLY with valid JSON in this exact format (no markdown, no explanation):\n{\n  "mainCaption": "your caption here with line breaks\\nlike this, ending with a CTA",\n  "hashtags": ["#tag1", "#tag2", ...20-30 tags]\n}`,
      },
    ],
    max_tokens: 800,
    temperature: 0.85,
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}'
  let parsed: { mainCaption: string; hashtags: string[] }

  try {
    const clean = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    throw new ReelGeneratorError(`Failed to parse caption JSON from OpenAI: ${raw.slice(0, 200)}`)
  }

  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : []
  const mainCaption = parsed.mainCaption ?? hookScript.slice(0, 300)

  const tagString = `\n\n${hashtags.join(' ')}`
  let fullCaption = `${mainCaption}${tagString}`
  if (fullCaption.length > 2200) {
    const allowed = 2200 - tagString.length
    fullCaption = `${mainCaption.slice(0, allowed)}${tagString}`
  }

  return { caption: mainCaption, hashtags, fullCaption }
}

// ---------------------------------------------------------------------------
// trimToShort
// ---------------------------------------------------------------------------

/**
 * Trim a video to 30–90 seconds, targeting the most engaging segment.
 * If the video is already within range, returns it unchanged.
 * Uses AI to pick the best starting point.
 *
 * @param videoPath    — Source video path
 * @param outputPath   — Destination (trimmed) video path
 * @param hookScript   — Used by AI to find the most impactful segment
 */
async function trimToShort(
  videoPath: string,
  outputPath: string,
  hookScript: string
): Promise<{ outputPath: string; startTime: number; duration: number }> {
  const available = await ffmpegAvailable()
  if (!available) throw new ReelGeneratorError('FFmpeg is not available on this system.')

  const info = await getVideoInfo(videoPath)
  const duration = info.duration

  // Already within range — return as-is (copy)
  if (duration >= REEL_MIN_DURATION_S && duration <= REEL_MAX_DURATION_S) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(outputPath)
        .noAudio()
        .videoCodec(REEL_CODEC)
        .on('end', () => resolve({ outputPath, startTime: 0, duration }))
        .on('error', (err: Error) => reject(new ReelGeneratorError(`FFmpeg: ${err.message}`)))
        .run()
    })
  }

  // Too short — pad with a still frame or loop? Just trim start and pad
  if (duration < REEL_MIN_DURATION_S) {
    // Use the whole video and let the final encode pad with silence/freeze
    // For simplicity: use full video, final encode will handle it
    return { outputPath, startTime: 0, duration }
  }

  // Too long — use AI to find the best 30-90s segment
  let startTime = 0
  let trimDuration = REEL_MAX_DURATION_S

  if (duration > REEL_MAX_DURATION_S) {
    const client = getOpenAIClient()

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a video editing assistant. Given a video topic/script and the total duration, ' +
              'pick the best START TIME (in seconds, integer) to extract a 60-90 second clip that ' +
              'captures the most engaging moment. Respond ONLY with a JSON object: ' +
              '{"startTime": <number>, "reason": "<brief reason>"}. ' +
              'Do not include markdown or explanation.',
          },
          {
            role: 'user',
            content: `Video duration: ${Math.round(duration)} seconds.\nTopic/script: "${hookScript.slice(0, 400)}"\n\nPick the best start time for a 60-90 second engaging clip.`,
          },
        ],
        max_tokens: 100,
        temperature: 0.3,
      })

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}'
      const parsed = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim())
      startTime = Math.max(0, Math.min(parseInt(String(parsed.startTime)) || 0, duration - REEL_MAX_DURATION_S))
      trimDuration = Math.min(REEL_MAX_DURATION_S, Math.round(duration - startTime))
    } catch {
      // Fallback: start at 0
      trimDuration = Math.min(REEL_MAX_DURATION_S, Math.round(duration))
    }
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(startTime)
      .duration(trimDuration)
      .output(outputPath)
      .videoCodec(REEL_CODEC)
      .fps(REEL_FPS)
      .on('end', () => resolve({ outputPath, startTime, duration: trimDuration }))
      .on('error', (err: Error) => reject(new ReelGeneratorError(`FFmpeg trim: ${err.message}`)))
      .run()
  })
}

// ---------------------------------------------------------------------------
// buildVerticalFilter
// ---------------------------------------------------------------------------

/**
 * Build FFmpeg filter_complex string to:
 * 1. Scale to fill 1080x1920 (crop to center for landscape)
 * 2. Add hook text overlay on first HOOK_DURATION_S seconds
 * 3. Add CTA end card on last CTA_DURATION_S seconds
 *
 * For landscape input → center-crop to 9:16.
 * For portrait/square input → scale to fill 1080x1920.
 */
function buildVerticalFilter(hookText: string, totalDuration: number): string[] {
  const filters: string[] = []

  // Scale + crop to 9:16 (1080x1920)
  // Landscape: crop to 1080x1920 from center, then scale
  // Portrait/square: scale to fill height, crop sides
  //
  // Formula for landscape center crop:
  //   crop_h = 1920, crop_w = 1080, crop_x = (iw - crop_w) / 2, crop_y = 0
  //   scale = -2:-2 (divisible by 2)
  const scaleCrop = `crop=1080:1920:(iw-1080)/2:(ih-1920)/2,scale=-2:-2`

  // Hook text overlay — first 3 seconds, centered, white text with shadow
  const hookFilter =
    `drawtext=text='${hookText.replace(/'/g, "\\'")}':` +
    `fontsize=72:fontcolor=white:fontweight=bold:` +
    `x=(w-text_w)/2:y=(h-text_h)/2-100:` +
    `enable='between(t,0,${HOOK_DURATION_S})':` +
    `shadowcolor=black@0.5:shadowx=2:shadowy=2`

  // CTA end card overlay — last 5 seconds
  const ctaText = 'Follow for more! 👉'
  const ctaFilter =
    `drawtext=text='${ctaText.replace(/'/g, "\\'")}':` +
    `fontsize=64:fontcolor=white:fontweight=bold:` +
    `x=(w-text_w)/2:y=(h-text_h)/2:` +
    `enable='gt(t,${totalDuration - CTA_DURATION_S})':` +
    `shadowcolor=black@0.5:shadowx=2:shadowy=2`

  return [`-vf "${scaleCrop},${hookFilter},${ctaFilter}"`]
}

// ---------------------------------------------------------------------------
// applyVerticalFormat
// ---------------------------------------------------------------------------

/**
 * Take a trimmed video and apply:
 * - 9:16 crop/scale to 1080x1920
 * - Hook text overlay (first 3s)
 * - CTA end card (last 5s)
 * - H.264 + AAC re-encode
 *
 * @param inputPath  — Trimmed video path
 * @param outputPath — Final vertical reel path
 * @param hookText   — Hook text for first 3 seconds
 */
async function applyVerticalFormat(
  inputPath: string,
  outputPath: string,
  hookText: string
): Promise<string> {
  const available = await ffmpegAvailable()
  if (!available) throw new ReelGeneratorError('FFmpeg is not available on this system.')

  const info = await getVideoInfo(inputPath)

  // Determine filter based on aspect ratio
  let vf: string
  if (info.aspectRatio === 'landscape') {
    // Center crop and scale to 1080x1920
    vf =
      `crop=1080:1920:(iw-1080)/2:(ih-1920)/2,` +
      `scale=1080:1920,setsar=1`
  } else {
    // Portrait or square: scale to fill height, crop sides
    vf = `scale=1080:-2,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1`
  }

  // Hook overlay: first 3 seconds
  const hookOverlay =
    `drawtext=text='${hookText.replace(/'/g, "\\'").replace(/:/g, '\\:')}':` +
    `fontsize=72:fontcolor=white:fontweight=bold:` +
    `x=(w-text_w)/2:y=(h-text_h)/2-150:` +
    `enable='between(t,0,3)':` +
    `borderw=2:bordercolor=black@0.5`

  // CTA overlay: last 5 seconds
  const ctaOverlay =
    `drawtext=text='Follow for more! \\u2192':` +
    `fontsize=60:fontcolor=white:fontweight=bold:` +
    `x=(w-text_w)/2:y=h-text_h-200:` +
    `enable='gt(t,${info.duration - CTA_DURATION_S})':` +
    `borderw=2:bordercolor=black@0.5`

  const filterComplex = `${vf},${hookOverlay},${ctaOverlay}`

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-vf', filterComplex,
        '-c:v', REEL_CODEC,
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', REEL_AUDIO_CODEC,
        '-ar', String(REEL_AUDIO_RATE),
        '-ac', '2',
        '-r', String(REEL_FPS),
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => reject(new ReelGeneratorError(`FFmpeg vertical format: ${err.message}`)))
      .run()
  })
}

// ---------------------------------------------------------------------------
// extractThumbnail
// ---------------------------------------------------------------------------

/**
 * Extract a thumbnail from the reel video for Instagram cover.
 */
async function extractThumbnail(videoPath: string, outputPath: string, timestamp = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .size('1080x1920')
      .output(outputPath)
      .jpeg()
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => reject(new ReelGeneratorError(`Thumbnail extract: ${err.message}`)))
      .run()
  })
}

// ---------------------------------------------------------------------------
// fileSizeMb
// ---------------------------------------------------------------------------

function fileSizeMb(filePath: string): number {
  const bytes = fs.statSync(filePath).size
  return bytes / (1024 * 1024)
}

// ---------------------------------------------------------------------------
// ensureOutputDir
// ---------------------------------------------------------------------------

function ensureOutputDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// createReel — main public API
// ---------------------------------------------------------------------------

/**
 * Create an Instagram Reel from a source video.
 *
 * Steps:
 *  1. Generate hook text (GPT-4o, first 3 seconds)
 *  2. Trim to 30-90s (AI-selected most engaging segment)
 *  3. Apply 9:16 vertical crop + hook overlay + CTA end card
 *  4. Extract thumbnail
 *  5. Generate caption + hashtags (GPT-4o)
 *  6. Optionally publish to Instagram
 *
 * @param options — ReelGeneratorOptions
 */
export async function createReel(
  options: ReelGeneratorOptions
): Promise<GeneratedReel & { publishResult?: { containerId: string; postId: string; permalink: string } }> {
  const {
    videoPath,
    hookScript,
    captionOverride,
    hashtagsOverride,
    outputDir = OUTPUT_DIR,
    videoUrl,
    coverUrl,
    publish = false,
    airtableRecordId,
  } = options

  // Validate input
  if (!fs.existsSync(videoPath)) {
    throw new ReelGeneratorError(`Source video not found: ${videoPath}`)
  }

  const available = await ffmpegAvailable()
  if (!available) {
    throw new ReelGeneratorError(
      'FFmpeg is not available. Install: choco install ffmpeg (Win) | brew install ffmpeg (macOS) | apt install ffmpeg (Linux)'
    )
  }

  ensureOutputDir(outputDir)

  const videoId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const trimmedPath = path.join(outputDir, `reel-trimmed-${videoId}.mp4`)
  const reelPath = path.join(outputDir, `reel-final-${videoId}.mp4`)
  const thumbPath = path.join(outputDir, `reel-thumb-${videoId}.jpg`)

  // Step 1: Generate hook text
  let hookText = 'Watch this!'
  try {
    hookText = await generateHookText(hookScript)
  } catch (err) {
    console.warn('Hook text generation failed, using default:', err)
  }

  // Step 2: Trim to 30-90s
  let trimmedInfo: { outputPath: string; startTime: number; duration: number }
  try {
    trimmedInfo = await trimToShort(videoPath, trimmedPath, hookScript)
  } catch (err) {
    console.warn('Trim failed, using original video:', err)
    trimmedInfo = { outputPath: videoPath, startTime: 0, duration: (await getVideoInfo(videoPath)).duration }
  }

  // Step 3: Apply 9:16 vertical format + overlays
  let finalReelPath = reelPath
  try {
    finalReelPath = await applyVerticalFormat(trimmedInfo.outputPath, reelPath, hookText)
  } catch (err) {
    console.warn('Vertical format apply failed, using trimmed video:', err)
    // Fallback: just copy the trimmed video
    fs.copyFileSync(trimmedInfo.outputPath, reelPath)
    finalReelPath = reelPath
  }

  // Step 4: Extract thumbnail
  let thumbnailPath = thumbPath
  try {
    thumbnailPath = await extractThumbnail(finalReelPath, thumbPath, 1)
  } catch (err) {
    console.warn('Thumbnail extraction failed:', err)
    thumbnailPath = ''
  }

  // Step 5: Generate caption + hashtags
  const { caption, hashtags, fullCaption } = await generateCaptionAndHashtags(hookScript, {
    captionOverride,
    hashtagsOverride,
  })

  // Step 6: Check file size
  const sizeMb = fileSizeMb(finalReelPath)
  if (sizeMb > REEL_MAX_SIZE_MB) {
    console.warn(`Reel file size (${sizeMb.toFixed(1)} MB) exceeds recommended ${REEL_MAX_SIZE_MB} MB`)
  }

  // Step 7: Optionally publish
  let publishResult: { containerId: string; postId: string; permalink: string } | undefined
  if (publish) {
    if (!videoUrl) {
      throw new ReelGeneratorError('videoUrl is required when publish=true.')
    }
    try {
      publishResult = await publishReel(fullCaption, videoUrl, coverUrl || thumbnailPath)

      // Update Airtable
      if (airtableRecordId) {
        await updateVideoRecord(airtableRecordId, {
          status: 'published',
          platform: 'instagram_reel',
          permalink: publishResult.permalink,
        })
      }
    } catch (err) {
      throw new ReelGeneratorError(`Failed to publish reel: ${(err as Error).message}`)
    }
  }

  return {
    outputPath: finalReelPath,
    caption,
    hashtags,
    fullCaption,
    thumbnailPath,
    duration: trimmedInfo.duration,
    publishResult,
  }
}

// ---------------------------------------------------------------------------
// addCaption
// ---------------------------------------------------------------------------

/**
 * Add a caption (with hashtags) to an already-uploaded video URL and publish it.
 * Thin wrapper around postInstagramReel for compatibility with the ticket API.
 *
 * @param caption  — Full caption (already includes hashtags)
 * @param videoUrl — Publicly accessible video URL
 * @param coverUrl — Optional cover/thumbnail URL
 */
export async function addCaption(
  caption: string,
  videoUrl: string,
  coverUrl?: string
): Promise<{ containerId: string; postId: string; permalink: string }> {
  return postInstagramReel(caption, videoUrl, coverUrl)
}

// ---------------------------------------------------------------------------
// publishReel — wrapper
// ---------------------------------------------------------------------------

/**
 * Publish a generated reel video to Instagram.
 *
 * @param caption  — Full caption text (with hashtags)
 * @param videoUrl — Public video URL (must be accessible by Meta API)
 * @param coverUrl — Optional public cover image URL
 */
export async function publishReel(
  caption: string,
  videoUrl: string,
  coverUrl?: string
): Promise<{ containerId: string; postId: string; permalink: string }> {
  if (!videoUrl) {
    throw new ReelGeneratorError('videoUrl is required for publishing a reel.')
  }
  return postInstagramReel(caption, videoUrl, coverUrl)
}

// ---------------------------------------------------------------------------
// End of src/platforms/instagram/reelGenerator.ts
// ---------------------------------------------------------------------------

