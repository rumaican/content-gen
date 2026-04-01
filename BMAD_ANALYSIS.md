# BMAD Analysis — [Pipeline] Whisper Transcription

## Card
- **ID:** 69c9aab3ab8008709c801ac3
- **ShortLink:** https://trello.com/c/xYW2C0B9
- **Stage:** RSS Monitor → Whisper Transcription → AI Summarizer → Content Generators

---

## 1. Analysis

### What the Card Asks For
Take a downloaded audio file (from yt-dlp) and send it to OpenAI Whisper API for transcription. Output:
- Full transcript text → saved to Airtable Video record
- SRT subtitles (from word-level timestamps) → file saved locally, path saved to Airtable

### Context in the Pipeline
```
RSS Monitor → Video Downloader → Whisper Transcription → AI Summarizer → Content Generators
                                    ↑ HERE
```
Whisper runs AFTER the video/audio has been downloaded by the downloader pipeline.

### Existing State
- `src/pipelines/transcriber.ts` exists but uses `youtube-transcript-api` for YouTube URLs (not Whisper API for local files)
- `src/pipelines/index.ts` already exports `transcribeVideo` from `transcriber.ts`
- `openai` SDK is already in `package.json`
- `srt` npm package is NOT yet installed (card explicitly requires it)
- Airtable integration exists in `src/lib/airtable.ts` with `updateVideoRecord()`
- Pipeline config in `src/lib/airtable.ts` has no `TRANSCRIPT_DIR` or `SRT_DIR` env vars yet

### Scope
**In scope:**
- New `src/utils/audioToSrt.ts` — converts Whisper word-level timestamps to SRT
- New `src/pipelines/transcribe.ts` — Whisper API transcription with SRT generation
- Update `src/pipelines/index.ts` — add new transcribe export
- Write `tests/transcribe.test.ts`
- Add `srt` package to `package.json`
- Env vars: `OPENAI_API_KEY`, `TRANSCRIPT_DIR`, `SRT_DIR` (add to `.env.example`)
- Airtable update: save transcript text + SRT path to Video record

**Out of scope:**
- Video downloading (that's the previous pipeline stage)
- YouTube transcript API (different approach, already implemented)
- Content generation (next pipeline stage)

### Edge Cases to Handle
1. **File too large (>25MB)** — Whisper API limit; detect and throw clear error before API call
2. **Unsupported format** — Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm. Validate before sending
3. **API failure / timeout** — wrap in try/catch with retry (1 retry for transient errors)
4. **Missing OPENAI_API_KEY** — fail fast with clear message
5. **Word timestamps not available** — if API returns without word-level data, generate SRT from segments if available, or skip SRT
6. **Empty audio file** — Whisper returns empty; treat as error
7. **Airtable update failure** — log warning, don't throw (transcript is the primary output)

---

## 2. Plan

### Step 1: Create `src/utils/audioToSrt.ts`
Convert Whisper word-level timestamp output to SRT subtitle format.
- Input: Whisper word objects `{ word, start, end }`
- Output: SRT string with correct sequential numbering, timecode formatting (HH:MM:SS,mmm)
- Handle overlapping/adjacent words by grouping into subtitle entries

### Step 2: Create `src/pipelines/transcribe.ts`
Main transcription function.
- Validate file format and size
- Read audio file
- Call `openai.audio.transcriptions.create({ model: 'whisper-1', file: ..., response_format: 'verbose_json', timestamp_granularities: ['word'] })`
- Generate SRT from word timestamps using `audioToSrt.ts`
- Save transcript `.txt` to `TRANSCRIPT_DIR/{videoId}.txt`
- Save SRT to `SRT_DIR/{videoId}.srt`
- Update Airtable Video record with transcript text + SRT file path
- Return `{ transcript, srtPath, videoId }`

### Step 3: Update `src/pipelines/index.ts`
Add export for new `transcribe` function alongside existing exports.

### Step 4: Update `.env.example`
Add `TRANSCRIPT_DIR`, `SRT_DIR`.

### Step 5: Write `tests/transcribe.test.ts`
- Mock OpenAI API
- Test SRT generation correctness (sequential numbering, timecode format)
- Test file format validation
- Test size limit check

### Step 6: Install `srt` npm package

---

## 3. Effort
**Estimated: 3 hours** (straightforward API call + SRT formatting)
