# Plan — [Pipeline] Whisper Transcription

## Context
Pipeline stage: RSS Monitor → Video Downloader → **Whisper Transcription** → AI Summarizer → Content Generators.
Input: downloaded audio file (mp3/mp4/m4a/wav). Output: transcript text + SRT subtitles, both saved to Airtable.

---

## Implementation

### 1. Install `srt` npm package
```bash
npm install srt
```
(Already in card spec; openai SDK already installed.)

---

### 2. `src/utils/audioToSrt.ts`
Converts Whisper word-level timestamp array → SRT subtitle string.

```typescript
interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

/**
 * Convert Whisper word timestamps to SRT format.
 * Groups consecutive words into subtitle entries (~3s max per entry).
 */
export function wordsToSrt(words: WordTimestamp[]): string
```

**SRT format rules:**
- Sequential index starting at 1
- Timecode: `HH:MM:SS,mmm --> HH:MM:SS,mmm`
- Blank line between entries
- Entry duration capped at ~3s to avoid too-long subtitles

---

### 3. `src/pipelines/transcribe.ts`
Main function: `async function transcribe(videoId: string, audioPath: string): Promise<TranscribeResult>`

**TranscribeResult:**
```typescript
interface TranscribeResult {
  videoId: string;
  transcript: string;
  srtPath: string | null;  // null if SRT skipped
  durationSeconds: number;
}
```

**Steps within `transcribe()`:**
1. Validate `OPENAI_API_KEY` env var exists
2. Validate file extension (mp3/mp4/mpeg/mpga/m4a/wav/webm)
3. Check file size ≤ 25MB; throw `FileTooLargeError` if exceeded
4. Read audio file as `File` object (for OpenAI SDK)
5. Call Whisper API:
   ```
   model: 'whisper-1'
   file: audioFile
   response_format: 'verbose_json'
   timestamp_granularities: ['word']
   ```
6. Extract text and word timestamps from response
7. Save transcript text → `$TRANSCRIPT_DIR/{videoId}.txt`
8. If word timestamps exist → call `wordsToSrt()` → save → `$SRT_DIR/{videoId}.srt`
9. Update Airtable Video record fields:
   - `transcriptStatus`: `'completed'`
   - `transcriptText`: full transcript string
   - `srtPath`: path to SRT file (if generated)
10. Return `TranscribeResult`

**Error types:**
```typescript
class FileTooLargeError extends Error  // >25MB
class UnsupportedFormatError extends Error  // bad extension
class TranscriptionError extends Error  // API failure
```

**Airtable update failure** → log warning, don't re-throw (primary output already saved to disk).

---

### 4. `src/pipelines/index.ts`
Add export:
```typescript
export { transcribe } from './transcribe.js'
```
Keep existing `transcribeVideo` (YouTube URL path) and `summarize` etc.

---

### 5. `.env.example`
Add:
```
# Whisper Transcription
TRANSCRIPT_DIR=./transcripts
SRT_DIR=./outputs/srt
```

---

### 6. `tests/transcribe.test.ts`
Using vitest.

**`audioToSrt` tests:**
- Sequential numbering starts at 1 and increments
- Timecode format `HH:MM:SS,mmm`
- Groups words correctly
- Empty input → empty string

**`transcribe` tests:**
- Validates file extension
- Rejects file >25MB
- Mocks OpenAI response, verifies transcript text extracted
- Mocks Airtable PATCH call

---

## Acceptance Criteria
- [ ] `transcribe(videoId, audioPath)` returns `{ videoId, transcript, srtPath, durationSeconds }`
- [ ] Transcript saved to `$TRANSCRIPT_DIR/{videoId}.txt`
- [ ] SRT file generated at `$SRT_DIR/{videoId}.srt` with correct sequential numbering and timecodes
- [ ] Airtable Video record updated with `transcriptStatus='completed'`, `transcriptText`, `srtPath`
- [ ] `FileTooLargeError` thrown for files >25MB
- [ ] `UnsupportedFormatError` thrown for unsupported file types
- [ ] `TranscriptionError` on API failure (with 1 retry for transient errors)
- [ ] Test suite passes: `npm test`
