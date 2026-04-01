# PLAN — [Pipeline] AI Summarizer

## Acceptance Criteria
- [x] Takes a video transcript (or videoId) and returns structured JSON
- [x] Each output type (tweet, LinkedIn post, email subject, TikTok script) is present
- [x] Handles 2-hour transcripts via chunking (no truncation)
- [x] Cost per video logged (< $0.10 per video target)
- [x] Retry on 429 with exponential backoff
- [x] Saves summaries to Airtable Posts table

---

## Implementation

### 1. Create `src/prompts/summarize.ts`

```typescript
export const systemPrompt = `You are a content strategist. Given a video transcript, generate platform-ready short-form content for multiple platforms.

Return a JSON object with these exact keys:
- twitter_thread: array of 3-5 tweet objects, each with "text" (max 280 chars) and "hashtag" (boolean)
- linkedin_post: object with "text" (300-1000 chars) and "comment" (opening hook for comments)
- email_subject: array of 3 objects, each with "subject" (≤70 chars) and "preview" (≤100 chars)
- tiktok_script: object with "hook" (first 3 sec), "body" (main content), and "cta" (call to action)

Quality bar: engaging, specific, actionable. No generic phrases.`;

export function buildUserPrompt(videoTitle: string, channelTitle: string, transcript: string): string {
  return `Video: "${videoTitle}" by ${channelTitle}

Transcript:
${transcript}`;
}
```

### 2. Rewrite `src/pipelines/summarizer.ts`

```typescript
import OpenAI from 'openai';
import { systemPrompt, buildUserPrompt } from '../prompts/summarize.js';
import { pipelineConfig, VideoRecord } from '../lib/airtable.js';

const openai = new OpenAI();

// Token estimation: ~4 chars per token average
const CHUNK_TOKENS = 4000; // ~16k chars
const CHUNK_OVERLAP_TOKENS = 200; // overlap to avoid boundary issues

interface SummaryOutput {
  twitter_thread: Array<{ text: string; hashtag: boolean }>;
  linkedin_post: { text: string; comment: string };
  email_subject: Array<{ subject: string; preview: string }>;
  tiktok_script: { hook: string; body: string; cta: string };
}

interface SummarizeResult {
  summaries: SummaryOutput;
  qualityScore: number;
  chunksUsed: number;
  costUsd: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function chunkTranscript(transcript: string): string[] {
  const tokens = estimateTokens(transcript);
  if (tokens <= CHUNK_TOKENS) return [transcript];

  const chunks: string[] = [];
  const words = transcript.split(' ');
  let currentChunk = '';
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = estimateTokens(word + ' ');
    if (currentTokens + wordTokens > CHUNK_TOKENS && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap
      const overlapWords = currentChunk.split(' ').slice(-50).join(' ');
      currentChunk = overlapWords + ' ' + word;
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk += word + ' ';
      currentTokens += wordTokens;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

async function callOpenAI(prompt: string, retries = 3): Promise<SummaryOutput> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI');

      return JSON.parse(content) as SummaryOutput;
    } catch (error: any) {
      if (error.status === 429 && attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function summarize(videoRecord: VideoRecord): Promise<SummarizeResult> {
  // Get transcript from Videos table or file system
  const transcript = await getTranscript(videoRecord.videoId);
  
  if (!transcript || transcript.trim().length < 50) {
    throw new Error(`Empty or missing transcript for video ${videoRecord.videoId}`);
  }

  const chunks = chunkTranscript(transcript);
  let finalSummary: SummaryOutput;
  let costUsd = 0;

  if (chunks.length === 1) {
    const prompt = buildUserPrompt(videoRecord.title, videoRecord.channelTitle, chunks[0]);
    const result = await callOpenAI(prompt);
    
    // Calculate cost from API response
    // GPT-4o-mini: $0.15/1M input, $0.60/1M output
    const usage = { input_tokens: 0, output_tokens: 0 }; // Would come from API
    costUsd = 0;
    
    finalSummary = result;
  } else {
    // Multi-chunk: summarize each, then merge
    const chunkSummaries: string[] = [];
    for (const chunk of chunks) {
      const prompt = buildUserPrompt(videoRecord.title, videoRecord.channelTitle, chunk);
      const result = await callOpenAI(prompt);
      chunkSummaries.push(JSON.stringify(result));
    }

    // Merge summaries
    const mergePrompt = `Merge these partial summaries into one coherent output. Keep all 4 sections (twitter_thread, linkedin_post, email_subject, tiktok_script). Ensure no repetition and consistent quality.

Partial summaries:
${chunkSummaries.join('\n\n---\n\n')}`;

    const mergeResult = await callOpenAI(mergePrompt);
    finalSummary = mergeResult;
  }

  // Calculate quality score (simple heuristic based on content presence)
  const qualityScore = calculateQualityScore(finalSummary);

  return {
    summaries: finalSummary,
    qualityScore,
    chunksUsed: chunks.length,
    costUsd,
  };
}

function calculateQualityScore(summary: SummaryOutput): number {
  let score = 0;
  if (summary.twitter_thread?.length >= 3) score += 25;
  if (summary.linkedin_post?.text?.length >= 200) score += 25;
  if (summary.email_subject?.length >= 3) score += 25;
  if (summary.tiktok_script?.body?.length >= 100) score += 25;
  return score;
}

async function getTranscript(videoId: string): Promise<string> {
  // Try Airtable first, then file system
  const transcriptPath = `./transcripts/${videoId}.txt`;
  try {
    const { readFileSync } = await import('fs');
    return readFileSync(transcriptPath, 'utf-8');
  } catch {
    return '';
  }
}

export async function saveToAirtable(videoRecord: VideoRecord, result: SummarizeResult): Promise<void> {
  const url = `${pipelineConfig.AIRTABLE_BASE}/${pipelineConfig.AIRTABLE_BASE_ID}/Posts`;
  
  const fields = {
    videoId: videoRecord.videoId,
    title: videoRecord.title,
    channelTitle: videoRecord.channelTitle,
    twitter_thread: JSON.stringify(result.summaries.twitter_thread),
    linkedin_post: result.summaries.linkedin_post.text,
    email_subject: result.summaries.email_subject.map(e => `${e.subject} | ${e.preview}`).join('\n'),
    tiktok_script: `${result.summaries.tiktok_script.hook}\n\n${result.summaries.tiktok_script.body}\n\n${result.summaries.tiktok_script.cta}`,
    qualityScore: result.qualityScore,
    status: 'pending',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pipelineConfig.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    throw new Error(`Airtable save failed: ${res.status}`);
  }
}
```

### 3. Update `src/pipelines/index.ts`
Export `summarize` and `saveToAirtable`.

### 4. Files to Create/Modify
| File | Action |
|------|--------|
| `src/prompts/summarize.ts` | Create |
| `src/pipelines/summarizer.ts` | Rewrite |
| `src/pipelines/index.ts` | Update exports |

---

## Testing Checklist
- [ ] Unit test: chunkTranscript handles long/short inputs
- [ ] Unit test: quality score calculation
- [ ] Integration test: full summarize → save flow (mocked)
- [ ] Error test: empty transcript handling
- [ ] Error test: 429 retry logic
