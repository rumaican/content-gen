/**
 * Video Downloader — downloads videos from YouTube and other platforms via yt-dlp.
 * Invokes yt-dlp as a CLI subprocess from Node.js.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { pipelineConfig } from '../config/index';
import { updateVideoRecord } from '../lib/trello';
import { getFileExt, getFileSize, ensureDir } from '../utils/fileUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadOptions {
  /** Format: 'best' (default) or 'worst'. Passed to yt-dlp -f */
  format?: 'best' | 'worst';
  /** If true, extract audio only as MP3 */
  audioOnly?: boolean;
  /** Output directory (default: 'downloads') */
  outputDir?: string;
  /** Airtable record ID to update status on */
  airtableRecordId?: string;
  /** YouTube video ID (used to find output files) */
  videoId?: string;
}

export interface DownloadMetadata {
  title: string;
  channel: string | null;
  duration: number | null; // seconds
  videoId: string;
  webpageUrl: string;
}

export interface DownloadResult {
  videoPath: string | null;
  audioPath: string | null;
  metadata: DownloadMetadata;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DownloadError extends Error {
  code: string;
  url: string;

  constructor(message: string, code: string, url: string) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
    this.url = url;
  }
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

const YT_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

function validateUrl(url: string): void {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new DownloadError('Invalid URL: must be a non-empty string', 'ERR_INVALID_URL', url);
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error();
    }
  } catch {
    throw new DownloadError(`Invalid URL format: ${url}`, 'ERR_INVALID_URL', url);
  }
  if (!YT_REGEX.test(url)) {
    throw new DownloadError(
      `Unsupported platform — only YouTube is currently supported: ${url}`,
      'ERR_UNSUPPORTED_PLATFORM',
      url,
    );
  }
}

// ---------------------------------------------------------------------------
// Progress parsing
// ---------------------------------------------------------------------------

interface ProgressInfo {
  percent: number | null;
  speed: string | null;
  eta: string | null;
}

/**
 * Parses a yt-dlp stderr line into a ProgressInfo object.
 * Returns null if the line doesn't contain progress info.
 */
function parseProgressLine(line: string): ProgressInfo {
  // e.g. "[download]  45.3% of ~312.50MiB at  1.23MiB/s ETA 00:32"
  const match = line.match(/\[download\]\s+([\d.]+)%\s+(?:of\s+~?([\d.]+\w+))?\s*(?:at\s+([\d.\w\/]+))?\s*(?:ETA\s+([\d:]+))?/);
  if (!match) return { percent: null, speed: null, eta: null };
  return {
    percent: parseFloat(match[1]),
    speed: match[3] ?? null,
    eta: match[4] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

interface YtDlpMetadata {
  title?: string;
  channel?: string;
  duration?: number;
  id?: string;
  webpage_url?: string;
}

/**
 * Extracts metadata from yt-dlp JSON output lines (lines starting with '{').
 */
function parseMetadataLine(line: string): YtDlpMetadata | null {
  try {
    const obj = JSON.parse(line);
    if (obj && typeof obj === 'object' && 'title' in obj) {
      return obj as YtDlpMetadata;
    }
  } catch {
    // Not JSON — ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main download function
// ---------------------------------------------------------------------------

/**
 * Downloads a video (or audio only) from a URL using yt-dlp.
 *
 * @param url - The video URL
 * @param options - Download options
 * @returns DownloadResult with file paths and metadata
 * @throws DownloadError on validation failure, download failure, or file not found
 */
export async function downloadVideo(url: string, options: DownloadOptions = {}): Promise<DownloadResult> {
  const { format = 'best', audioOnly = false, outputDir = 'downloads', airtableRecordId, videoId } = options;

  // 1. Validate URL
  validateUrl(url);

  // 2. Ensure output directory exists
  ensureDir(outputDir);

  // 3. Build yt-dlp arguments
  const ytdlp = pipelineConfig.YTDLP_PATH ? path.resolve(pipelineConfig.YTDLP_PATH) : 'yt-dlp';

  // Output template: title-id.ext (unique per video)
  const outputTemplate = path.join(outputDir, '%(title)s-%(id)s.%(ext)s');

  const args: string[] = [];

  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    const fmt = format === 'worst' ? 'worst' : 'bestvideo+bestaudio/best';
    args.push('-f', fmt, '--merge-output-format', 'mp4');
  }

  args.push(
    '-o', outputTemplate,
    '--print', '%(title)s\n%(channel)s\n%(duration)s\n%(id)s\n%(webpage_url)s',
    '--no-playlist',
    url,
  );

  // 4. Update Airtable status -> 'downloading'
  if (airtableRecordId) {
    await updateVideoRecord(airtableRecordId, { downloadStatus: 'downloading' }).catch(() => {
      // Non-fatal — log but continue
      console.warn(`[downloader] Failed to update Airtable status for record ${airtableRecordId}`);
    });
  }

  // 5. Spawn subprocess
  const metadataLines: string[] = [];
  let finalMetadata: DownloadMetadata | null = null;

  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlp, args);

    let rejected = false;

    function rejectOnce(err: Error) {
      if (!rejected) {
        rejected = true;
        reject(err);
      }
    }

    // Stream stderr for progress and metadata
    proc.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);

      for (const line of lines) {
        // Check for metadata JSON lines
        const meta = parseMetadataLine(line);
        if (meta) {
          metadataLines.push(line);
          finalMetadata = {
            title: meta.title ?? 'Unknown',
            channel: meta.channel ?? null,
            duration: meta.duration ?? null,
            videoId: meta.id ?? videoId ?? 'unknown',
            webpageUrl: meta.webpage_url ?? url,
          };
          continue;
        }

        // Progress lines
        const prog = parseProgressLine(line);
        if (prog.percent !== null) {
          const parts = [];
          if (prog.percent !== null) parts.push(`${prog.percent.toFixed(1)}%`);
          if (prog.speed) parts.push(`@${prog.speed}`);
          if (prog.eta) parts.push(`ETA ${prog.eta}`);
          console.log(`[yt-dlp] ${parts.join(' ')}`);
        }
      }
    });

    proc.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        rejectOnce(
          new DownloadError(
            `yt-dlp not found at '${ytdlp}'. Install: pip install yt-dlp or set YTDLP_PATH in .env`,
            'ERR_YTDLP_NOT_FOUND',
            url,
          ),
        );
      } else {
        rejectOnce(new DownloadError(`Failed to start yt-dlp: ${err.message}`, 'ERR_SPAWN', url));
      }
    });

    proc.on('close', async (code: number | null) => {
      if (rejected) return;

      if (code !== 0) {
        // Try to extract a descriptive error from the metadata captured
        let errMsg = `yt-dlp exited with code ${code}`;
        if (metadataLines.length > 0) {
          // Last few lines might contain the error
          const lastLines = metadataLines.slice(-5).join('\n');
          if (lastLines.toLowerCase().includes('error') || lastLines.toLowerCase().includes('unavailable')) {
            errMsg = lastLines;
          }
        }
        rejectOnce(new DownloadError(errMsg, 'ERR_YTDLP_FAILED', url));
        return;
      }

      // 6. Find output files
      if (!finalMetadata) {
        rejectOnce(new DownloadError('No metadata received from yt-dlp', 'ERR_NO_METADATA', url));
        return;
      }

      const { title, channel, duration, videoId: vid, webpageUrl } = finalMetadata;

      // Sanitize title for filename matching (yt-dlp sanitizes automatically)
      // We use vid to locate the file since we control the output template
      const searchPattern = `${title}-${vid}`;

      let videoPath: string | null = null;
      let audioPath: string | null = null;

      if (!audioOnly) {
        // Video + audio merged → mp4
        const candidates = fs.existsSync(outputDir)
          ? fs.readdirSync(outputDir)
          : [];
        const mp4Match = candidates.find(
          (f) => f.startsWith(searchPattern) && getFileExt(f) === 'mp4',
        );
        videoPath = mp4Match ? path.join(outputDir, mp4Match) : null;
      }

      if (audioOnly) {
        const candidates = fs.existsSync(outputDir)
          ? fs.readdirSync(outputDir)
          : [];
        const mp3Match = candidates.find(
          (f) => f.startsWith(searchPattern) && getFileExt(f) === 'mp3',
        );
        audioPath = mp3Match ? path.join(outputDir, mp3Match) : null;
      }

      // 7. Update Airtable status -> 'downloaded'
      if (airtableRecordId) {
        await updateVideoRecord(airtableRecordId, { downloadStatus: 'completed' }).catch(() => {
          console.warn(`[downloader] Failed to update Airtable status -> completed for ${airtableRecordId}`);
        });
      }

      if (!videoPath && !audioPath) {
        rejectOnce(
          new DownloadError(
            `Download completed (yt-dlp exit 0) but output file not found in ${outputDir}. Title: ${title}`,
            'ERR_FILE_NOT_FOUND',
            url,
          ),
        );
        return;
      }

      resolve({
        videoPath,
        audioPath,
        metadata: { title, channel, duration, videoId: vid, webpageUrl },
      });
    });
  });
}
