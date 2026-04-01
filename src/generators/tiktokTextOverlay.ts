import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import {
  ffmpegReady,
  getVideoDuration,
  runFfmpeg,
  parseSrt,
  isSrtPopulated,
} from '../utils/ffmpegUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TikTokOverlayOptions {
  /** How to handle non-9:16 video: 'crop' (default) fills frame by cropping,
   *  'blur' pads with blurred background for landscape */
  padStyle?: 'crop' | 'blur';
  /** Max output duration in seconds. Default 180 (TikTok max). */
  maxDuration?: number;
  /** Override output path. Default: outputs/tiktok-captioned-{uuid}.mp4 */
  outputPath?: string;
  /** Font family. Default: sans-serif (use a font installed on the system) */
  fontFamily?: string;
  /** Font size in points. Default: 28 */
  fontSize?: number;
  /** Primary text colour as hex. Default: #FFFFFF */
  textColor?: string;
  /** Stroke/outline colour as hex. Default: #000000 */
  strokeColor?: string;
  /** Stroke width in points. Default: 2 */
  strokeWidth?: number;
  /** Vertical position: 'bottom' (default) or 'top' */
  position?: 'bottom' | 'top';
  /** Progress callback (0–100). */
  onProgress?: (pct: number) => void;
  /** Called when complete with output path and duration. */
  onComplete?: (outputPath: string, duration: number) => void;
  /** Called on warnings (e.g. empty SRT). */
  onWarning?: (msg: string) => void;
}

export interface TikTokOverlayResult {
  outputPath: string;
  duration: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hex colour helpers (FFmpeg uses BGR&A hex format)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert #RRGGBB → FFmpeg &HBBGGRR */
function toFfmpegColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H00${b}${g}${r}`; // FFmpeg ABGR with full alpha
  }
  return '&H00FFFFFF';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds timed text overlays (captions) to a TikTok video using FFmpeg.
 *
 * @param videoPath  Path to the input MP4
 * @param srtPath    Path to the SRT subtitle file (from Whisper)
 * @param options    Configuration options
 */
export async function addTextOverlay(
  videoPath: string,
  srtPath: string,
  options: TikTokOverlayOptions = {}
): Promise<TikTokOverlayResult> {
  const opts: Required<TikTokOverlayOptions> = {
    padStyle: options.padStyle ?? 'crop',
    maxDuration: options.maxDuration ?? 180,
    outputPath: options.outputPath ?? '',
    fontFamily: options.fontFamily ?? 'sans-serif',
    fontSize: options.fontSize ?? 28,
    textColor: options.textColor ?? '#FFFFFF',
    strokeColor: options.strokeColor ?? '#000000',
    strokeWidth: options.strokeWidth ?? 2,
    position: options.position ?? 'bottom',
    onProgress: options.onProgress ?? (() => {}),
    onComplete: options.onComplete ?? (() => {}),
    onWarning: options.onWarning ?? (() => {}),
  };

  // 1. Validate FFmpeg
  const ready = await ffmpegReady();
  if (!ready) {
    throw new Error(
      '[TikTokTextOverlay] FFmpeg is not installed or not in PATH. ' +
        'Install: brew install ffmpeg  (macOS) or apt install ffmpeg (Linux)'
    );
  }

  // 2. Validate inputs exist
  if (!fs.existsSync(videoPath)) {
    throw new Error(`[TikTokTextOverlay] Video file not found: ${videoPath}`);
  }
  if (!fs.existsSync(srtPath)) {
    throw new Error(`[TikTokTextOverlay] SRT file not found: ${srtPath}`);
  }

  // 3. Validate and parse SRT
  if (!isSrtPopulated(srtPath)) {
    opts.onWarning('[TikTokTextOverlay] SRT file is empty or malformed — outputting video unchanged');
    // Passthrough: copy video without any filter
    return passthrough(videoPath, srtPath, opts);
  }

  const srtEntries = parseSrt(srtPath);

  // 4. Get video duration
  let videoDuration = await getVideoDuration(videoPath);
  const maxDur = opts.maxDuration;
  if (videoDuration > maxDur) {
    opts.onWarning(`[TikTokTextOverlay] Video (${videoDuration.toFixed(1)}s) exceeds maxDuration (${maxDur}s) — will be trimmed`);
    videoDuration = maxDur;
  }

  // 5. Validate SRT max timestamp against video duration
  const srtMaxTime = srtEntries[srtEntries.length - 1]?.endTime ?? '00:00:00,000';
  const srtMaxSecs = srtTimestampToSeconds(srtMaxTime);
  if (srtMaxSecs > videoDuration) {
    opts.onWarning(
      `[TikTokTextOverlay] SRT end time (${srtMaxTime}) exceeds video duration — SRT may be longer than video`
    );
  }

  // 6. Resolve output path
  const outputDir = path.join(process.cwd(), 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath =
    opts.outputPath ||
    path.join(outputDir, `tiktok-captioned-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`);

  // 7. Build FFmpeg filter chain
  const marginV = opts.position === 'bottom' ? 40 : 960 - opts.fontSize - 20;
  const forceStyleParts = [
    `FontSize=${opts.fontSize}`,
    `PrimaryColour=${toFfmpegColor(opts.textColor)}`,
    `Outline=${opts.strokeWidth}`,
    `OutlineColour=${toFfmpegColor(opts.strokeColor)}`,
    `Bold=1`,
    `MarginV=${marginV}`,
  ];
  if (opts.fontFamily !== 'sans-serif') {
    forceStyleParts.push(`FontName=${opts.fontFamily}`);
  }
  const forceStyle = forceStyleParts.join(',');

  // Escape SRT path for FFmpeg filtergraph (colons and backslashes)
  const srtEscaped = srtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

  // Video filter: scale/crop to 9:16 + subtitles
  let videoFilter: string;
  if (opts.padStyle === 'blur') {
    // Scale down to fit inside 1080x1920, pad remaining area with black
    videoFilter =
      `scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `subtitles='${srtEscaped}':force_style='${forceStyle}'`;
  } else {
    // Default: scale up + crop to fill 9:16 (center crop)
    videoFilter =
      `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
      `subtitles='${srtEscaped}':force_style='${forceStyle}'`;
  }

  // 8. Build and run command
  let cmd = ffmpeg()
    .input(videoPath)
    .inputOptions(['-hwaccel', 'auto'])
    .outputOptions([
      '-filter_complex', videoFilter,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-t', String(videoDuration),
    ])
    .output(outputPath);

  opts.onProgress(0);

  await runFfmpeg(cmd, {
    timeoutSecs: Math.ceil(videoDuration * 2) + 30, // 2x + 30s buffer
    onProgress: (pct) => opts.onProgress(pct),
  });

  opts.onProgress(100);
  opts.onComplete(outputPath, videoDuration);

  return { outputPath, duration: videoDuration };
}

// ─────────────────────────────────────────────────────────────────────────────
// Passthrough (empty SRT case)
// ─────────────────────────────────────────────────────────────────────────────

async function passthrough(
  videoPath: string,
  srtPath: string,
  opts: Required<TikTokOverlayOptions>
): Promise<TikTokOverlayResult> {
  const outputDir = path.join(process.cwd(), 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath =
    opts.outputPath ||
    path.join(outputDir, `tiktok-captioned-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`);

  const duration = await getVideoDuration(videoPath);
  const effectiveDuration = Math.min(duration, opts.maxDuration);

  const cmd = ffmpeg()
    .input(videoPath)
    .outputOptions([
      '-c', 'copy',
      '-t', String(effectiveDuration),
      '-movflags', '+faststart',
    ])
    .output(outputPath);

  await runFfmpeg(cmd, {
    timeoutSecs: Math.ceil(effectiveDuration) + 10,
    onProgress: (pct) => opts.onProgress(pct),
  });

  opts.onProgress(100);
  opts.onComplete(outputPath, effectiveDuration);

  return { outputPath, duration: effectiveDuration };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse SRT timestamp (HH:MM:SS,mmm) → total seconds */
function srtTimestampToSeconds(ts: string): number {
  const match = ts.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return 0;
  const [, h, m, s, ms] = match.map(Number);
  return h * 3600 + m * 60 + s + ms / 1000;
}
