/**
 * src/generators/instagramGenerator.ts
 * Instagram Content Generator — unified entry point
 *
 * Orchestrates all Instagram content generation:
 *  - generateInstagramCaption: caption + hashtag generation (OpenAI)
 *  - createInstagramPost: single image post from video
 *  - createInstagramCarousel: carousel post from video
 *  - createInstagramReel: full reel creation pipeline
 *
 * Card: 69c9acdcf6262128052c1ee0
 */

import {
  generateInstagramCaption as genCaption,
} from '../prompts/instagramCaption.js'

import { createPostImage, createCarouselPost } from '../platforms/instagram/postGenerator.js'
import { createReel } from '../platforms/instagram/reelGenerator.js'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InstagramGeneratorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstagramGeneratorError'
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramCaptionResult {
  caption: string
  hashtags: string[]
  fullCaption: string
}

export interface InstagramPostResult {
  imagePath: string
  caption: string
  hashtags: string[]
  fullCaption: string
}

export interface InstagramCarouselResult {
  postId: string
  containerId: string
  permalink: string
}

export interface InstagramReelResult {
  outputPath: string
  caption: string
  hashtags: string[]
  fullCaption: string
  thumbnailPath: string
  duration: number
  publishResult?: { containerId: string; postId: string; permalink: string }
}

// ---------------------------------------------------------------------------
// generateInstagramCaption — public API
// ---------------------------------------------------------------------------

/**
 * Generate an Instagram caption and hashtag set.
 *
 * @param summary  — Content summary or transcript
 * @param platform — 'post' | 'carousel' | 'reel'
 */
export async function generateInstagramCaption(
  summary: string,
  platform: 'post' | 'carousel' | 'reel' = 'post'
): Promise<InstagramCaptionResult> {
  return genCaption(summary, platform)
}

// ---------------------------------------------------------------------------
// createInstagramPost — single image post
// ---------------------------------------------------------------------------

/**
 * Create a single Instagram image post from a video source.
 *
 * Uses createPostImage from postGenerator which handles:
 *  1. Extract cover frame from video (via FFmpeg)
 *  2. Generate caption + hashtags (OpenAI GPT-4o)
 *  3. Publish photo to Instagram
 */
export async function createInstagramPost(options: {
  videoPath: string
  summary: string
  captionOverride?: string
  hashtagsOverride?: string[]
  airtableRecordId?: string
}): Promise<InstagramPostResult> {
  const result = await createPostImage({
    videoPath: options.videoPath,
    summary: options.summary,
    captionOverride: options.captionOverride,
    hashtagsOverride: options.hashtagsOverride,
    })

  return {
    imagePath: result.imagePath,
    caption: result.caption,
    hashtags: result.hashtags,
    fullCaption: result.fullCaption,
  }
}

// ---------------------------------------------------------------------------
// createInstagramCarousel — carousel post
// ---------------------------------------------------------------------------

/**
 * Create an Instagram carousel post from a video.
 */
export async function createInstagramCarousel(options: {
  videoPath: string
  summary: string
  timestamps: number[]
  imageUrls: string[]
  captionOverride?: string
  hashtagsOverride?: string[]
  airtableRecordId?: string
}): Promise<InstagramCarouselResult> {
  if (!options.imageUrls || options.imageUrls.length < 2) {
    throw new InstagramGeneratorError('At least 2 image URLs are required for carousel')
  }

  const result = await createCarouselPost({
    videoPath: options.videoPath,
    summary: options.summary,
    timestamps: options.timestamps,
    imageUrls: options.imageUrls,
    captionOverride: options.captionOverride,
    hashtagsOverride: options.hashtagsOverride,
    })

  return {
    postId: result.postId,
    containerId: result.containerId,
    permalink: result.permalink,
  }
}

// ---------------------------------------------------------------------------
// createInstagramReel — full reel pipeline
// ---------------------------------------------------------------------------

/**
 * Create a full Instagram Reel (video) from a source video.
 *
 * Uses createReel from reelGenerator which handles:
 *  1. Generate hook text + caption + hashtags (GPT-4o)
 *  2. Trim to 30-90s (AI-selected most engaging segment)
 *  3. Apply 9:16 vertical crop + hook overlay + CTA end card
 *  4. Extract thumbnail
 *  5. Optionally publish to Instagram
 */
export async function createInstagramReel(options: {
  videoPath: string
  hookScript: string
  captionOverride?: string
  hashtagsOverride?: string[]
  outputDir?: string
  videoUrl?: string
  coverUrl?: string
  publish?: boolean
  airtableRecordId?: string
}): Promise<InstagramReelResult> {
  const result = await createReel({
    videoPath: options.videoPath,
    hookScript: options.hookScript,
    captionOverride: options.captionOverride,
    hashtagsOverride: options.hashtagsOverride,
    outputDir: options.outputDir,
    videoUrl: options.videoUrl,
    coverUrl: options.coverUrl,
    publish: options.publish ?? false,
    })

  return result
}
