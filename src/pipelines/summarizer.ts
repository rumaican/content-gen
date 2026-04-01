/**
 * AI Summarizer — summarizes transcribed content into platform-ready posts
 * 
 * Pipeline position: downstream of Whisper Transcription, upstream of Content Generators
 * Handles: transcript chunking, multi-format output, cost tracking, retry logic
 */

import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { systemPrompt, buildUserPrompt, buildMergePrompt } from '../prompts/summarize.js';

const openai = new OpenAI();

// Token estimation: ~4 chars per token average
const CHUNK_TOKENS = 4000; // ~16k chars per chunk to leave room for response
const CHUNK_OVERLAP_WORDS = 50; // overlap words to avoid boundary issues

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwitterTweet {
  text: string;
  hashtag: boolean;
}

export interface LinkedInPost {
  text: string;
  comment: string;
}

export interface EmailSubject {
  subject: string;
  preview: string;
}

export interface TikTokScript {
  hook: string;
  body: string;
  cta: string;
}

export interface SummaryOutput {
  twitter_thread: TwitterTweet[];
  linkedin_post: LinkedInPost;
  email_subject: EmailSubject[];
  tiktok_script: TikTokScript;
}

export interface SummarizeResult {
  summaries: SummaryOutput;
  qualityScore: number;
  chunksUsed: number;
  costUsd: number;
  videoId: string;
}

// From airtable.ts - VideoRecord
export interface VideoRecord {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
  transcriptStatus: 'pending' | 'completed' | 'failed';
  summaryStatus: 'pending' | 'completed' | 'failed';
  processedStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  dateDiscovered: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TRANSCRIPT_DIR = process.env.TRANSCRIPT_DIR || './transcripts';

const AIRTABLE_BASE = 'https://api.airtable.com/v0';

function getAirtableConfig() {
  return {
    baseId: process.env.AIRTABLE_BASE_ID,
    apiKey: process.env.AIRTABLE_API_KEY,
  };
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Estimate token count from text (rough approximation)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split long transcript into overlapping chunks for processing
 */
function chunkTranscript(transcript: string): string[] {
  const tokens = estimateTokens(transcript);
  
  if (tokens <= CHUNK_TOKENS) {
    return [transcript];
  }

  const chunks: string[] = [];
  const words = transcript.split(/\s+/);
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = estimateTokens(word);
    
    if (currentTokens + wordTokens > CHUNK_TOKENS && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      
      // Keep overlap from end of previous chunk
      const overlap = currentChunk.slice(-CHUNK_OVERLAP_WORDS);
      currentChunk = [...overlap, word];
      currentTokens = estimateTokens(currentChunk.join(' '));
    } else {
      currentChunk.push(word);
      currentTokens += wordTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

/**
 * Call OpenAI with retry logic for rate limits
 */
async function callOpenAI(
  prompt: string,
  retries = 3,
  temperature = 0.7
): Promise<{ content: SummaryOutput; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: 2500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      return {
        content: JSON.parse(content) as SummaryOutput,
        usage: response.usage,
      };
    } catch (error: any) {
      // Handle rate limit (429)
      if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          console.log(`[Summarizer] Rate limited, retrying in ${Math.round(delay)}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Calculate a quality score based on output completeness
 */
function calculateQualityScore(summary: SummaryOutput): number {
  let score = 0;
  
  if (summary.twitter_thread?.length >= 3) score += 25;
  if (summary.linkedin_post?.text?.length >= 200) score += 25;
  if (summary.email_subject?.length >= 3) score += 25;
  if (summary.tiktok_script?.body?.length >= 100) score += 25;
  
  return score;
}

/**
 * Calculate cost in USD based on token usage
 * GPT-4o-mini: $0.15/1M input, $0.60/1M output
 */
function calculateCost(usage?: { prompt_tokens: number; completion_tokens: number }): number {
  if (!usage) return 0;
  const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;
  const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;
  return inputCost + outputCost;
}

/**
 * Get transcript from file system
 */
async function getTranscript(videoId: string): Promise<string> {
  const transcriptPath = resolve(TRANSCRIPT_DIR, `${videoId}.txt`);
  
  try {
    return readFileSync(transcriptPath, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Summarize a video transcript into platform-ready content
 * 
 * @param videoRecord - Video record from Airtable
 * @param transcriptOverride - Optional transcript string (if not using file)
 * @returns Summarized content with quality score and metadata
 */
export async function summarize(
  videoRecord: VideoRecord,
  transcriptOverride?: string
): Promise<SummarizeResult> {
  // Get transcript from file or override
  const transcript = transcriptOverride || (await getTranscript(videoRecord.videoId));

  if (!transcript || transcript.trim().length < 50) {
    throw new Error(`Empty or missing transcript for video ${videoRecord.videoId}`);
  }

  const chunks = chunkTranscript(transcript);
  let finalSummary: SummaryOutput;
  let totalUsage: { prompt_tokens: number; completion_tokens: number } = { prompt_tokens: 0, completion_tokens: 0 };

  if (chunks.length === 1) {
    // Single chunk - direct summarization
    const prompt = buildUserPrompt(videoRecord.title, videoRecord.channelTitle, chunks[0]);
    const result = await callOpenAI(prompt);
    
    finalSummary = result.content;
    if (result.usage) totalUsage = result.usage;
  } else {
    // Multi-chunk: summarize each, then merge
    console.log(`[Summarizer] Processing ${chunks.length} chunks for ${videoRecord.videoId}`);
    
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[Summarizer] Chunk ${i + 1}/${chunks.length}`);
      const prompt = buildUserPrompt(videoRecord.title, videoRecord.channelTitle, chunks[i]);
      const result = await callOpenAI(prompt);
      chunkSummaries.push(JSON.stringify(result.content));
      
      if (result.usage) {
        totalUsage.prompt_tokens += result.usage.prompt_tokens;
        totalUsage.completion_tokens += result.usage.completion_tokens;
      }
    }

    // Merge summaries with lower temperature for consistency
    const mergePrompt = buildMergePrompt(chunkSummaries);
    const mergeResult = await callOpenAI(mergePrompt, 3, 0.5);
    finalSummary = mergeResult.content;
    
    if (mergeResult.usage) {
      totalUsage.prompt_tokens += mergeResult.usage.prompt_tokens;
      totalUsage.completion_tokens += mergeResult.usage.completion_tokens;
    }
  }

  const qualityScore = calculateQualityScore(finalSummary);
  const costUsd = calculateCost(totalUsage);

  console.log(`[Summarizer] Completed ${videoRecord.videoId}: quality=${qualityScore}%, cost=$${costUsd.toFixed(4)}, chunks=${chunks.length}`);

  return {
    summaries: finalSummary,
    qualityScore,
    chunksUsed: chunks.length,
    costUsd,
    videoId: videoRecord.videoId,
  };
}

/**
 * Save summarization result to Airtable Posts table
 */
export async function saveToAirtable(result: SummarizeResult): Promise<void> {
  const { baseId, apiKey } = getAirtableConfig();
  
  if (!baseId || !apiKey) {
    console.warn('[Summarizer] Airtable credentials not configured, skipping save');
    return;
  }

  const url = `${AIRTABLE_BASE}/${baseId}/Posts`;

  const fields: Record<string, unknown> = {
    videoId: result.videoId,
    twitter_thread: JSON.stringify(result.summaries.twitter_thread),
    linkedin_post: result.summaries.linkedin_post.text,
    email_subject: result.summaries.email_subject.map((e) => `${e.subject} | ${e.preview}`).join('\n'),
    tiktok_script: `${result.summaries.tiktok_script.hook}\n\n${result.summaries.tiktok_script.body}\n\n${result.summaries.tiktok_script.cta}`,
    qualityScore: result.qualityScore,
    status: 'pending',
    costUsd: result.costUsd,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable save failed: ${res.status} ${body}`);
  }

  console.log(`[Summarizer] Saved to Airtable Posts table: ${result.videoId}`);
}

/**
 * Main entry point: summarize and save
 */
export async function summarizeAndSave(
  videoRecord: VideoRecord,
  transcriptOverride?: string
): Promise<SummarizeResult> {
  const result = await summarize(videoRecord, transcriptOverride);
  await saveToAirtable(result);
  return result;
}

/**
 * Backwards-compatible wrapper for simple transcript summarization
 * Used by src/index.ts for the main pipeline
 */
export async function summarizeContent(transcript: string): Promise<string> {
  // For backwards compatibility, we just return the twitter thread as a string
  // This is a simplified version - full pipeline should use summarize()
  const mockVideoRecord: VideoRecord = {
    videoId: 'legacy',
    title: 'Video',
    channelId: 'channel',
    channelTitle: 'Channel',
    publishedAt: new Date().toISOString(),
    thumbnailUrl: '',
    downloadStatus: 'completed',
    transcriptStatus: 'completed',
    summaryStatus: 'pending',
    processedStatus: 'pending',
    dateDiscovered: new Date().toISOString(),
  };

  const result = await summarize(mockVideoRecord, transcript);
  return result.summaries.twitter_thread.map((t) => t.text).join('\n\n');
}
