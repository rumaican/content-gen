/**
 * src/platforms/instagram.ts
 * Instagram Platform — post photos and reels via Meta Graph API
 *
 * Depends on:
 *   src/auth/instagram — getAccountInfo, createMediaContainer, publishMediaContainer, withRetry
 */

import {
  getAccountInfo,
  createMediaContainer,
  publishMediaContainer,
  listMedia,
  getStoredAccessToken,
  getStoredAccountId,
  InstagramAccountInfo,
} from '../auth/instagram.js'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InstagramPlatformError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstagramPlatformError'
  }
}

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<InstagramAccountInfo> {
  const token = getStoredAccessToken()
  const accountId = getStoredAccountId()
  if (!token || !accountId) {
    throw new InstagramPlatformError(
      'Instagram is not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID in your .env file.'
    )
  }
  return getAccountInfo()
}

// ---------------------------------------------------------------------------
// postInstagramPhoto
// ---------------------------------------------------------------------------

export interface PostPhotoResult {
  containerId: string
  postId: string
  permalink: string
}

/**
 * Post a photo to Instagram Business account.
 *
 * @param caption  — Post caption / alt text
 * @param imageUrl — Publicly accessible image URL
 */
export async function postInstagramPhoto(caption: string, imageUrl: string): Promise<PostPhotoResult> {
  if (!imageUrl) {
    throw new InstagramPlatformError('imageUrl is required for posting a photo.')
  }

  // Step 1: Create media container
  const container = await createMediaContainer({
    imageUrl,
    caption,
    mediaType: 'IMAGE',
  })

  // Step 2: Publish container
  const published = await publishMediaContainer(container.id)

  // Step 3: Get permalink via listMedia
  const mediaList = await listMedia({ limit: 1 })
  const latest = mediaList.data?.[0]
  const permalink = latest?.permalink || `https://www.instagram.com/p/${published.id}/`

  return {
    containerId: container.id,
    postId: published.id,
    permalink,
  }
}

// ---------------------------------------------------------------------------
// postInstagramReel
// ---------------------------------------------------------------------------

export interface PostReelResult {
  containerId: string
  postId: string
  permalink: string
}

/**
 * Post a reel (video) to Instagram Business account.
 *
 * @param caption  — Reel caption
 * @param videoUrl — Publicly accessible video URL (MP4, max 15 min for Reels)
 * @param coverUrl — Optional cover/thumbnail URL
 */
export async function postInstagramReel(
  caption: string,
  videoUrl: string,
  coverUrl?: string
): Promise<PostReelResult> {
  if (!videoUrl) {
    throw new InstagramPlatformError('videoUrl is required for posting a reel.')
  }

  // Step 1: Create media container (video)
  const container = await createMediaContainer({
    videoUrl,
    caption,
    coverUrl,
    mediaType: 'VIDEO',
  })

  // Step 2: Publish container
  const published = await publishMediaContainer(container.id)

  // Step 3: Get permalink
  const mediaList = await listMedia({ limit: 1 })
  const latest = mediaList.data?.[0]
  const permalink = latest?.permalink || `https://www.instagram.com/p/${published.id}/`

  return {
    containerId: container.id,
    postId: published.id,
    permalink,
  }
}

// ---------------------------------------------------------------------------
// Legacy passthrough
// ---------------------------------------------------------------------------

export async function postInstagram(content: string): Promise<void> {
  // Stub for backward compatibility
  console.log('Instagram post (legacy):', content.slice(0, 50))
}
