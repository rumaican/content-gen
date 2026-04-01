# BMAD Analysis — [Pipeline] AI Summarizer

## 1. Understanding the Architecture

### Context
This summarizer sits in the middle of a content pipeline:
- **Upstream:** RSS Monitor discovers videos → Downloader fetches → Whisper Transcription converts to text
- **This stage:** AI Summarizer takes transcripts → generates platform-ready content
- **Downstream:** Content Generators (Twitter, LinkedIn, Email, TikTok) publish

### Current State
- `src/pipelines/summarizer.ts` exists with a stub `summarizeContent()` function
- Uses basic single-prompt approach, no structured JSON output
- No chunking, no retry logic, no cost tracking
- Does NOT save to Airtable Posts table (only to Videos table)

### Required Output Types
| Type | Format | Length |
|------|--------|--------|
| twitter_thread | Array of 3-5 tweets | ~280 chars each |
| linkedin_post | Single post | 300-1000 chars |
| email_subject | 3 options | subject + preview text |
| tiktok_script | 60-90sec hook + body + CTA | ~2000 chars |

## 2. Key Technical Decisions

### Chunking Strategy
- GPT-4o context: 128k tokens
- Transcript avg: ~150 words/minute → ~90k words for 2hr video
- Use ~5000 token chunks with 200 token overlap
- Summarize each chunk separately, then do a "merge" summary

### JSON Mode
- Use `response_format: { type: 'json_object' }` for structured output
- All 4 output types in one response for efficiency

### Cost Optimization
- gpt-4o-mini for main summarization (90% cheaper than gpt-4o)
- gpt-4o only for merge step if needed

### Airtable Posts Table Schema (assumed)
- videoId, title, channelTitle
- twitter_thread (long text)
- linkedin_post (long text)
- email_subject (text)
- tiktok_script (long text)
- qualityScore (number)
- status (pending/published/failed)

## 3. Dependencies
- `openai` SDK (already in package.json)
- Airtable Posts table (need to create if not exists)

## 4. Edge Cases
1. Transcript > 128k tokens → chunk
2. 429 rate limit → exponential backoff retry
3. Empty transcript → graceful error
4. Airtable write failure → retry + log
5. Video already summarized → skip or re-summarize option
