/**
 * Whisper Transcription Pipeline
 *
 * Transcribes a downloaded audio file using OpenAI Whisper API.
 * Saves transcript text + SRT subtitles, and updates Airtable Video record.
 *
 * Pipeline position: downstream of Video Downloader, upstream of AI Summarizer.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import OpenAI from 'openai';
import { wordsToSrt, type WordTimestamp } from '../utils/audioToSrt.js';
import { updateVideoRecord } from '../lib/trello.js';

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new TranscriptionError('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TRANSCRIPT_DIR = process.env.TRANSCRIPT_DIR || './transcripts';
const SRT_DIR = process.env.SRT_DIR || './outputs/srt';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB Whisper limit

const SUPPORTED_FORMATS = new Set(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']);

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class FileTooLargeError extends Error {
  readonly sizeBytes: number;
  constructor(sizeBytes: number) {
    super(`Audio file too large: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB (max 25 MB)`);
    this.name = 'FileTooLargeError';
    this.sizeBytes = sizeBytes;
  }
}

export class UnsupportedFormatError extends Error {
  readonly extension: string;
  constructor(ext: string) {
    super(`Unsupported audio format: .${ext} (supported: ${[...SUPPORTED_FORMATS].join(', ')})`);
    this.name = 'UnsupportedFormatError';
    this.extension = ext;
  }
}

export class TranscriptionError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TranscriptionError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export interface TranscribeResult {
  videoId: string;
  transcript: string;
  srtPath: string | null;       // null if SRT skipped (no word timestamps)
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileExtension(filePath: string): string {
  const base = basename(filePath);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

function getFileSize(filePath: string): number {
  return statSync(filePath).size;
}

function validateFile(filePath: string): void {
  const ext = getFileExtension(filePath);
  if (!SUPPORTED_FORMATS.has(ext)) {
    throw new UnsupportedFormatError(ext);
  }
  const size = getFileSize(filePath);
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new FileTooLargeError(size);
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio file using OpenAI Whisper API.
 *
 * @param videoId     - Unique video ID (used for filenames and Airtable lookup)
 * @param audioPath   - Absolute or relative path to the audio file
 * @returns TranscribeResult with transcript text, SRT path, and duration
 *
 * @throws UnsupportedFormatError  - If file extension is not supported
 * @throws FileTooLargeError       - If file exceeds 25 MB
 * @throws TranscriptionError      - On API failure after retry
 */
export async function transcribe(videoId: string, audioPath: string): Promise<TranscribeResult> {
  // 1. Get authenticated client (throws if key missing)
  const client = getOpenAIClient();

  // 2. Validate file
  const absoluteAudioPath = resolve(audioPath);
  validateFile(absoluteAudioPath);

  // 3. Read audio file
  const fileBuffer = readFileSync(absoluteAudioPath);
  const ext = getFileExtension(absoluteAudioPath);
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };
  const mimeType = mimeMap[ext] || 'audio/mpeg';
  const fileName = basename(absoluteAudioPath);

  // Create a File-like object for the OpenAI SDK
  const file = {
    name: fileName,
    type: mimeType,
    buffer: fileBuffer,
  } as unknown as File;

  // 4. Call Whisper API with word timestamps
  let result: Awaited<ReturnType<OpenAI['audio']['transcriptions']['create']>>;
  try {
    result = await client.audio.transcriptions.create(
      {
        model: 'whisper-1',
        file,
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      },
      { timeout: 60_000 } // 60s timeout for large files
    );
  } catch (err: unknown) {
    // One retry for transient errors
    console.warn(`[Transcribe] Whisper API call failed, retrying once: ${err}`);
    try {
      result = await client.audio.transcriptions.create(
        {
          model: 'whisper-1',
          file,
          response_format: 'verbose_json',
          timestamp_granularities: ['word'],
        },
        { timeout: 60_000 }
      );
    } catch (retryErr: unknown) {
      throw new TranscriptionError(
        `Whisper API failed after retry: ${retryErr}`,
        retryErr
      );
    }
  }

  // 5. Extract transcript text
  const transcript = result.text?.trim() ?? '';
  if (!transcript) {
    console.warn(`[Transcribe] Empty transcript for ${videoId}`);
  }

  // 6. Save transcript text to file
  mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  const transcriptPath = resolve(TRANSCRIPT_DIR, `${videoId}.txt`);
  writeFileSync(transcriptPath, transcript, 'utf-8');
  console.log(`[Transcribe] Saved transcript: ${transcriptPath}`);

  // 7. Generate and save SRT if word timestamps available
  let srtPath: string | null = null;
  const words: WordTimestamp[] = (result as { words?: WordTimestamp[] }).words;
  if (words && words.length > 0) {
    const srtContent = wordsToSrt(words);
    mkdirSync(SRT_DIR, { recursive: true });
    const srtFilePath = resolve(SRT_DIR, `${videoId}.srt`);
    writeFileSync(srtFilePath, srtContent, 'utf-8');
    srtPath = srtFilePath;
    console.log(`[Transcribe] Saved SRT: ${srtFilePath}`);
  } else {
    console.log(`[Transcribe] No word timestamps available, skipping SRT for ${videoId}`);
  }

  // 8. Update Trello Video record
  const trelloFields: Record<string, unknown> = {
    transcriptStatus: 'completed',
    transcript: transcript,
  };
  if (srtPath) {
    trelloFields.srtPath = srtPath;
  }

  try {
    await updateVideoRecord(videoId, trelloFields);
    console.log(`[Transcribe] Updated Trello for ${videoId}`);
  } catch (airtableErr) {
    // Log warning but don't throw — primary output is on disk
    console.warn(`[Transcribe] Airtable update failed for ${videoId}: ${airtableErr}`);
  }

  const durationSeconds = (result as { duration?: number }).duration ?? 0;

  return {
    videoId,
    transcript,
    srtPath,
    durationSeconds,
  };
}
