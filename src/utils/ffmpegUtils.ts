import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// FFmpeg availability check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if ffmpeg binary is found and prints version.
 */
export async function ffmpegReady(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress reporting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses FFmpeg -progress output and calls onProgress with 0–100.
 * FFmpeg -progress emits lines like:
 *   out_time_ms=1234567
 *   frame=123
 *   fps=30.0
 *   bitrate=1234.5kbits/s
 *   total_size=12345678
 *
 * We also need the estimated total duration from the probe step.
 */
export function parseProgress(
  progressOut: NodeJS.ReadableStream,
  totalDurationSecs: number,
  onProgress: (pct: number) => void
): void {
  let lastPct = -1;

  progressOut.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('out_time_ms=')) {
        const ms = parseInt(line.split('=')[1] ?? '0', 10);
        const secs = ms / 1_000_000;
        if (totalDurationSecs > 0) {
          const pct = Math.min(100, Math.round((secs / totalDurationSecs) * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            onProgress(pct);
          }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration probe
// ─────────────────────────────────────────────────────────────────────────────

export function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`[ffmpegUtils] ffprobe failed for ${videoPath}: ${err.message}`));
        return;
      }
      const dur = metadata.format.duration;
      if (dur == null) {
        reject(new Error(`[ffmpegUtils] Could not read duration from ${videoPath}`));
        return;
      }
      resolve(dur);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Command runner with timeout
// ─────────────────────────────────────────────────────────────────────────────

export function runFfmpeg(
  cmd: ffmpeg.FfmpegCommand,
  options?: { timeoutSecs?: number; onProgress?: (pct: number) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      cmd.kill('SIGTERM');
      reject(new Error('[ffmpegUtils] FFmpeg process timed out'));
    }, (options?.timeoutSecs ?? 300) * 1000);

    cmd.on('end', () => {
      clearTimeout(timeout);
      if (!timedOut) resolve();
    });

    cmd.on('error', (err) => {
      clearTimeout(timeout);
      if (!timedOut) reject(err);
    });

    if (options?.onProgress) {
      // We need total duration for progress. The cmd must have run ffprobe first,
      // or we pass duration in via a side channel. Simpler: we read duration from
      // a temp ffprobe call, then re-run.
      // To keep this utility clean, the caller passes onProgress with totalDuration
      // already factored in (see addTextOverlay).
      cmd.on('progress', (progress) => {
        // progress.percent is available on newer fluent-ffmpeg
        if (progress.percent != null) {
          options.onProgress!(Math.round(progress.percent));
        }
      });
    }

    cmd.run();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SRT validation helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface SrtEntry {
  index: number;
  startTime: string; // HH:MM:SS,mmm
  endTime: string;
  text: string;
}

/**
 * Parses an SRT file and returns entries. Throws on malformed SRT.
 */
export function parseSrt(srtPath: string): SrtEntry[] {
  if (!fs.existsSync(srtPath)) {
    throw new Error(`[ffmpegUtils] SRT file not found: ${srtPath}`);
  }

  const raw = fs.readFileSync(srtPath, 'utf8');
  const entries: SrtEntry[] = [];

  // Normalize line breaks
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue; // skip malformed blocks

    // First line: numeric index
    const indexLine = lines[0].trim();
    if (!/^\d+$/.test(indexLine)) continue;

    // Second line: timestamp range
    const timeLine = lines[1].trim();
    const timeMatch = timeLine.match(
      /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue; // skip malformed timestamps

    // Rest: text
    const text = lines.slice(2).join('\n').trim();

    entries.push({
      index: parseInt(indexLine, 10),
      startTime: timeMatch[1],
      endTime: timeMatch[2],
      text,
    });
  }

  return entries;
}

/**
 * Returns true if the SRT has at least one non-empty entry.
 */
export function isSrtPopulated(srtPath: string): boolean {
  try {
    return parseSrt(srtPath).length > 0;
  } catch {
    return false;
  }
}
