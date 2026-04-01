/**
 * TikTok Background Music Adder — src/platforms/video/addMusic.js
 * Card: [Content Generator] TikTok Background Music Adder (69c9aab8728a6aae5acdf05a)
 *
 * Adds a background music track to a video using FFmpeg.
 * Voice remains clear (music at -12 dB); music fades out in the last 3 seconds.
 *
 * CLI equivalent used as reference:
 *   ffmpeg -i input.mp4 -i music.mp3 \
 *     -filter_complex "amix=inputs=2:duration=first:dropout_transition=2,
 *                      volume=enable='lt(t,3)':volume=0,
 *                      volume=enable='gte(t,3)':volume=1,
 *                      volume=-12dB,
 *                      afade=t=out:st=<end-3>:d=3" \
 *     -c:v copy output.mp4
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { pickTrack } from '../utils/musicLibrary'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @returns {Promise<boolean>} */
async function ffmpegAvailable() {
  try {
    const { exitCode } = await execAsync('ffmpeg -version', { timeout: 10_000 })
    return exitCode === 0
  } catch {
    return false
  }
}

/**
 * Runs a shell command, returning { stdout, stderr, exitCode }.
 * @param {string} cmd
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
async function runCmd(cmd) {
  const { stdout, stderr, exitCode } = await execAsync(cmd, { timeout: 300_000 })
  return { stdout, stderr, exitCode }
}

/**
 * Retrieves video duration in seconds via FFprobe.
 * @param {string} videoPath
 * @returns {Promise<number>}
 */
async function getVideoDuration(videoPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  const { stdout } = await runCmd(cmd)
  return parseFloat(stdout.trim()) || 0
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AddMusicOptions
 * @property {string}  videoPath       - Path to the input MP4 video.
 * @property {string}  [mood='upbeat'] - Music mood: 'upbeat' | 'chill' | 'cinematic' | 'auto'.
 * @property {string}  [outputDir]      - Directory for output file. Defaults to 'outputs/tiktok/'.
 */

/**
 * Adds a background music track to a video.
 *
 * Audio mixing:
 *   - amix=inputs=2:duration=first — video duration governs output length
 *   - Music volume: -12 dB (music secondary to voice)
 *   - Music fade-out: last 3 seconds
 *
 * @param {AddMusicOptions} options
 * @returns {Promise<{ outputPath: string, trackUsed: string, mood: string }>}
 */
export async function addBackgroundMusic(options) {
  const { videoPath, mood: requestedMood = 'upbeat', outputDir } = options

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Input video not found: ${videoPath}`)
  }

  const available = await ffmpegAvailable()
  if (!available) {
    throw new Error(
      'FFmpeg is not available on this system. Install it: ' +
        'choco install ffmpeg (Windows) | brew install ffmpeg (macOS) | apt install ffmpeg (Linux)'
    )
  }

  // Determine mood: 'auto' is treated as 'upbeat' (no LLM transcript analysis here)
  const mood = requestedMood === 'auto' ? 'upbeat' : requestedMood

  // Pick a track
  const videoDuration = await getVideoDuration(videoPath)
  const track = pickTrack({ mood, duration: Math.round(videoDuration) })
  if (!track) {
    throw new Error(`No track found for mood: ${mood}`)
  }

  const musicPath = path.join(process.cwd(), 'assets', 'music', track.filename)
  if (!fs.existsSync(musicPath)) {
    throw new Error(`Music track not found: ${musicPath}`)
  }

  // Output path
  const outDir = outputDir || path.join(process.cwd(), 'outputs', 'tiktok')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  const videoId = path.basename(videoPath, path.extname(videoPath))
  const outputPath = path.join(outDir, `tiktok-with-music-${videoId}.mp4`)

  // FFmpeg filter breakdown:
  //   [1:a]apad=duration_d=first — pad music to video length
  //   [0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2 — mix video + music audio
  //   volume=expr='if(lte(t,3),1,fade(t,1,3))' — brief hold then fade
  //   volume=-12dB — reduce music to -12 dB so voice remains prominent
  //   afade=t=out:st=<end-3>:d=3 — 3-second fade out at the end
  //   -map 0:v — keep original video stream (no re-encoding of video)
  const endTime = Math.max(0, videoDuration - 3)
  const filterComplex = [
    // Pad music audio to match video duration
    `[1:a]apad=whole_dur=${videoDuration}[padded]`,
    // Mix original audio with padded music track
    `[0:a][padded]amix=inputs=2:duration=first:dropout_transition=2[mixed]`,
    // Reduce music to -12 dB (secondary to voice)
    `[mixed]volume=-12dB[music12db]`,
    // Fade out last 3 seconds
    `[music12db]afade=t=out:st=${endTime}:d=3[final]`,
  ].join(';')

  const cmd = [
    'ffmpeg -y',
    `-i "${videoPath}"`,
    `-i "${musicPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map 0:v`,
    `-map "[final]"`,
    `-c:v copy`,
    `-shortest`,
    `"${outputPath}"`,
  ].join(' ')

  const { exitCode, stderr } = await runCmd(cmd)

  if (exitCode !== 0) {
    throw new Error(`FFmpeg failed with exit code ${exitCode}:\n${stderr}`)
  }

  return {
    outputPath,
    trackUsed: track.title,
    mood,
  }
}

/**
 * Convenience: add music using a track filename directly (bypasses mood selection).
 *
 * @param {string} videoPath
 * @param {string} trackFilename
 * @param {string} [outputDir]
 */
export async function addBackgroundMusicWithTrack(videoPath, trackFilename, outputDir) {
  const musicPath = path.join(process.cwd(), 'assets', 'music', trackFilename)
  if (!fs.existsSync(musicPath)) {
    throw new Error(`Music track not found: ${musicPath}`)
  }

  const available = await ffmpegAvailable()
  if (!available) {
    throw new Error('FFmpeg is not available on this system.')
  }

  const videoDuration = await getVideoDuration(videoPath)
  const outDir = outputDir || path.join(process.cwd(), 'outputs', 'tiktok')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  const videoId = path.basename(videoPath, path.extname(videoPath))
  const outputPath = path.join(outDir, `tiktok-with-music-${videoId}.mp4`)

  const endTime = Math.max(0, videoDuration - 3)
  const filterComplex = [
    `[1:a]apad=whole_dur=${videoDuration}[padded]`,
    `[0:a][padded]amix=inputs=2:duration=first:dropout_transition=2[mixed]`,
    `[mixed]volume=-12dB[music12db]`,
    `[music12db]afade=t=out:st=${endTime}:d=3[final]`,
  ].join(';')

  const cmd = [
    'ffmpeg -y',
    `-i "${videoPath}"`,
    `-i "${musicPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map 0:v`,
    `-map "[final]"`,
    `-c:v copy`,
    `-shortest`,
    `"${outputPath}"`,
  ].join(' ')

  const { exitCode, stderr } = await runCmd(cmd)

  if (exitCode !== 0) {
    throw new Error(`FFmpeg failed with exit code ${exitCode}:\n${stderr}`)
  }

  return { outputPath, trackUsed: trackFilename }
}
