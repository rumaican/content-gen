/**
 * Video Download Script
 * Usage: npm run download -- <video-url> [--audio-only] [--output-dir <dir>]
 *
 * Dependencies: yt-dlp must be available (see YTDLP_PATH in .env)
 */

import { downloadVideo, DownloadOptions } from '../src/pipelines/downloader'

async function main() {
  const args = process.argv.slice(2)
  const url = args[0]

  if (!url) {
    console.error('Usage: npm run download -- <video-url> [--audio-only] [--output-dir <dir>]')
    process.exit(1)
  }

  const options: DownloadOptions = {}

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--audio-only') {
      options.audioOnly = true
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i]
    }
  }

  console.log(`[download] Starting download: ${url}`)
  console.log(`[download] Options: ${JSON.stringify(options)}`)

  try {
    const result = await downloadVideo(url, options)
    console.log('\n✅ Download complete!')
    console.log(`   Title:    ${result.metadata.title}`)
    console.log(`   Channel:  ${result.metadata.channel ?? 'N/A'}`)
    console.log(`   Duration: ${result.metadata.duration ? `${Math.round(result.metadata.duration)}s` : 'N/A'}`)
    if (result.videoPath) console.log(`   Video:    ${result.videoPath}`)
    if (result.audioPath) console.log(`   Audio:    ${result.audioPath}`)
  } catch (err) {
    console.error(`\n❌ Download failed: ${err instanceof Error ? err.message : String(err)}`)
    if (err instanceof Error && 'code' in err) {
      console.error(`   Code: ${(err as { code: string }).code}`)
    }
    process.exit(1)
  }
}

main()
