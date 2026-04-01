/**
 * Content Pipeline - Main Entry Point
 *
 * Coordinates the full content generation pipeline:
 * YouTube RSS → Download → Transcribe → Summarize → Route → Post
 */

import 'dotenv/config'
import { downloadVideo } from './pipelines/downloader.js'
import { fetchYouTubeRSS } from './pipelines/rss.js'
import { transcribeVideo } from './pipelines/transcriber.js'
import { summarizeContent } from './pipelines/summarizer.js'
import { routeContent } from './pipelines/router.js'
import { postTweet } from './platforms/twitter.js'
import { postShare as postLinkedIn } from './platforms/linkedin.js'
import { postInstagram } from './platforms/instagram.js'
import { sendEmailSequence } from './platforms/email/sequences/index.js'

async function main() {
  console.log('🚀 Content Pipeline starting...')

  // Step 1: Check YouTube RSS for new videos
  const newVideos = await fetchYouTubeRSS()
  console.log(`Found ${newVideos.length} new videos`)

  for (const video of newVideos) {
    console.log(`Processing: ${video.title}`)

    // Step 2: Download video
    const result = await downloadVideo(video.url)
    const videoPath = result.videoPath ?? result.audioPath ?? video.url
    console.log(`Downloaded to: ${videoPath}`)

    // Step 3: Transcribe
    const transcript = await transcribeVideo(videoPath)
    console.log(`Transcribed: ${transcript.length} chars`)

    // Step 4: Summarize
    const summary = await summarizeContent(transcript)
    console.log(`Summary: ${summary.slice(0, 100)}...`)

    // Step 5: Route to platforms
    const routes = await routeContent(summary)
    console.log(`Routed to: ${routes.join(', ')}`)

    // Step 6: Post to each platform
    for (const route of routes) {
      switch (route) {
        case 'twitter':
          await postTweet(summary)
          break
        case 'linkedin':
          await postLinkedIn({ text: summary })
          break
        case 'instagram':
          await postInstagram(summary)
          break
        case 'email':
          await sendEmailSequence(summary)
          break
      }
    }
  }

  console.log('✅ Content Pipeline complete')
}

main().catch(console.error)
