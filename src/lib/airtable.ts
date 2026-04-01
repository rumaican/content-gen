/**
 * Airtable integration — shared client for pipeline modules.
 * Handles REST API calls to Airtable.
 */

import type { ParsedVideo } from '../pipeline/types.js';

export const AIRTABLE_BASE = 'https://api.airtable.com/v0';

export const pipelineConfig = {
  downloadDir: process.env.DOWNLOAD_DIR || './downloads',
  outputDir: process.env.OUTPUT_DIR || './outputs',
  maxConcurrent: 3,
  ytDlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID || '',
  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY || '',
};

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface AirtableCreateResponse {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

function headers() {
  const key = pipelineConfig.AIRTABLE_API_KEY;
  if (!key) throw new Error('AIRTABLE_API_KEY environment variable is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function baseUrl() {
  const baseId = pipelineConfig.AIRTABLE_BASE_ID;
  if (!baseId) throw new Error('AIRTABLE_BASE_ID environment variable is not set');
  return `${AIRTABLE_BASE}/${baseId}`;
}

// ---------------------------------------------------------------------------
// Videos table
// ---------------------------------------------------------------------------

export interface VideoRecord {
  videoId: string;
  title?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  downloadStatus?: 'pending' | 'downloading' | 'completed' | 'failed';
  transcriptStatus?: 'pending' | 'completed' | 'failed';
  summaryStatus?: 'pending' | 'completed' | 'failed';
  processedStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
  dateDiscovered?: string;
  // Fields read by Content Router
  transcript?: string | null;
  duration?: number | null;
  tags?: string | null;
  routingStatus?: 'pending' | 'routed' | 'failed';
}

/**
 * List video records from Airtable, optionally filtered by a formula.
 * Uses pagination via offset.
 */
export async function listVideos(filterByFormula?: string): Promise<AirtableRecord[]> {
  const url = new URL(`${baseUrl()}/Videos`);
  if (filterByFormula) {
    url.searchParams.set('filterByFormula', filterByFormula);
  }

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const reqUrl = new URL(url);
    if (offset) reqUrl.searchParams.set('offset', offset);

    const res = await fetch(reqUrl.toString(), { headers: headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable listVideos failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as AirtableListResponse;
    allRecords.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return allRecords;
}

/**
 * Check whether a video record already exists in Airtable by videoId.
 * Returns true if a matching record is found.
 */
export async function videoExists(videoId: string): Promise<boolean> {
  const formula = `{videoId}="${videoId}"`;
  const records = await listVideos(formula);
  return records.length > 0;
}

/**
 * Create a new Video record in Airtable.
 * Fields are mapped directly from a ParsedVideo + pipeline defaults.
 */
export async function createVideo(video: ParsedVideo): Promise<AirtableRecord> {
  const url = `${baseUrl()}/Videos`;

  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    videoId: video.videoId,
    title: video.title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    thumbnailUrl: video.thumbnailUrl,
    status: 'discovered',
    downloadStatus: 'pending',
    transcriptStatus: 'pending',
    summaryStatus: 'pending',
    processedStatus: 'pending',
    dateDiscovered: now,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable createVideo failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as AirtableCreateResponse;
  return data;
}

// ---------------------------------------------------------------------------
// Posts table — Content Router PostTasks
// ---------------------------------------------------------------------------

export interface PostTaskRecord {
  platform: string;
  contentType: string;
  priority: number;
  videoId: string;
  status: 'queued';
  estimatedEffort: number;
  routingExplanation: string;
}

/**
 * Create a new PostTask record in the Airtable Posts table.
 * Returns the created AirtableRecord.
 */
export async function createPostTask(task: PostTaskRecord): Promise<AirtableRecord> {
  const url = `${baseUrl()}/Posts`;

  const postTaskId = `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const fields: Record<string, unknown> = {
    PostTaskId: postTaskId,
    videoId: task.videoId,
    platform: task.platform,
    contentType: task.contentType,
    priority: task.priority,
    status: task.status,
    estimatedEffort: task.estimatedEffort,
    routingExplanation: task.routingExplanation,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable createPostTask failed: ${res.status} ${body}`);
  }

  return (await res.json()) as AirtableCreateResponse;
}

// ---------------------------------------------------------------------------
// Settings table
// ---------------------------------------------------------------------------

export interface SettingRecord {
  key: string;
  value: string;
}

/**
 * Read a setting by key from the Airtable Settings table.
 */
export async function getSetting(key: string): Promise<string | null> {
  const formula = `{key}="${key}"`;
  const url = new URL(`${baseUrl()}/Settings`);
  url.searchParams.set('filterByFormula', formula);

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable getSetting failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as AirtableListResponse;
  if (!data.records || data.records.length === 0) return null;

  const fields = data.records[0].fields as Record<string, unknown>;
  return (fields['value'] as string) || null;
}

// ---------------------------------------------------------------------------
// Generic update
// ---------------------------------------------------------------------------

export async function updateVideoRecord(
  videoId: string,
  data: Record<string, unknown>
): Promise<void> {
  const formula = `{videoId}="${videoId}"`;
  const records = await listVideos(formula);
  if (records.length === 0) {
    throw new Error(`updateVideoRecord: no record found for videoId=${videoId}`);
  }

  const recordId = records[0].id;
  const url = `${baseUrl()}/Videos/${recordId}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields: data }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable updateVideoRecord failed: ${res.status} ${body}`);
  }
}

/**
 * Update a social-media post record in Airtable.
 * Stub implementation — logs the update.
 */
export async function updatePostRecord(
  recordId: string,
  data: { status?: string; platform?: string; permalink?: string; [key: string]: unknown }
): Promise<void> {
  console.log('Airtable post record update (stub):', recordId, data);
}
