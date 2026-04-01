/**
 * TikTok Background Music Adder — src/platforms/video/addMusic.ts
 * Card: [Content Generator] TikTok Background Music Adder (69c9aab8728a6aae5acdf05a)
 *
 * Adds a background music track to a video using FFmpeg.
 * Voice remains clear (music at -12 dB); music fades out in the last 3 seconds.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import { pickTrack } from '../../utils/musicLibrary.js'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CmdResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function runCmd(cmd: string): Promise<CmdResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 300_000 })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code ?? 1
    return { stdout: '', stderr: String(err), exitCode: code }
  }
}

async function ffmpegAvailable(): Promise<boolean> {
  try {
    const { exitCode } = await runCmd('ffmpeg -version')
    return exitCode === 0
  } catch {
    return false
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  const { stdout } = await runCmd(cmd)
  return parseFloat(stdout.trim()) || 0
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export interface AddMusicOptions {
  videoPath: string
  mood?: 'upbeat' | 'chill' | 'cinematic' | 'auto'
  outputDir?: string
}

/**
 * Adds a background music track to a video.
 *
 * Audio mixing:
 *   - amix=inputs=2:duration=first — video duration governs output length
 *   - Music volume: -12 dB (music secondary to voice)
 *   - Music fade-out: last 3 seconds
 */
export async function addBackgroundMusic(options: AddMusicOptions): Promise<{ outputPath: string; trackUsed: string; mood: string }> {
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

  const mood = requestedMood === 'auto' ? 'upbeat' : requestedMood

  const videoDuration = await getVideoDuration(videoPath)
  const track = pickTrack({ mood, duration: Math.round(videoDuration) })
  if (!track) {
    throw new Error(`No track found for mood: ${mood}`)
  }

  const musicPath = path.join(process.cwd(), 'assets', 'music', track.filename)
  if (!fs.existsSync(musicPath)) {
    throw new Error(`Music track not found: ${musicPath}`)
  }

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

  return { outputPath, trackUsed: track.title, mood }
}

/**
 * Convenience: add music using a track filename directly (bypasses mood selection).
 */
export async function addBackgroundMusicWithTrack(
  videoPath: string,
  trackFilename: string,
  outputDir?: string
): Promise<{ outputPath: string; trackUsed: string }> {
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
