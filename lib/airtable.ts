/**
 * Airtable Client — shared Airtable REST API wrapper for pipeline modules.
 * All pipeline components use this module — no hardcoded credentials.
 */

import { pipelineConfig } from '../src/config/index'

const AIRTABLE_BASE = `https://api.airtable.com/v0/${pipelineConfig.AIRTABLE_BASE_ID}`

const headers = {
  Authorization: `Bearer ${pipelineConfig.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
}

export interface VideoRecord {
  id?: string
  videoId: string
  title: string
  channelId: string | null
  channelTitle: string | null
  publishedAt: string
  thumbnailUrl: string
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed'
  transcriptStatus: 'pending' | 'completed' | 'failed'
  summaryStatus: 'pending' | 'completed' | 'failed'
  processedStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
  dateDiscovered: string
}

export interface SettingsRecord {
  key: string
  value: string
}

async function airtableFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${AIRTABLE_BASE}${path}`
  return fetch(url, { ...options, headers }).then((res) => {
    if (!res.ok) {
      return res.text().then((text) => {
        throw new Error(`Airtable API error ${res.status}: ${text}`)
      })
    }
    return res.json()
  })
}

export async function getSetting(key: string): Promise<string | null> {
  const filter = encodeURIComponent(`{key} = "${key}"`)
  const url = `/Settings?filterByFormula=${filter}&maxRecords=1`
  const data = (await airtableFetch(url)) as { records: Array<{ fields: SettingsRecord }> }
  const record = data.records[0]
  return record ? record.fields.value : null
}

export async function videoExists(videoId: string): Promise<boolean> {
  const filter = encodeURIComponent(`{videoId} = "${videoId}"`)
  const url = `/Videos?filterByFormula=${filter}&maxRecords=1&fields[]=videoId`
  const data = (await airtableFetch(url)) as { records: Array<unknown> }
  return data.records.length > 0
}

export async function createVideoRecord(video: Omit<VideoRecord, 'id'>): Promise<string> {
  const fields: Record<string, unknown> = {
    videoId: video.videoId,
    title: video.title,
    channelId: video.channelId ?? '',
    channelTitle: video.channelTitle ?? '',
    publishedAt: video.publishedAt,
    thumbnailUrl: video.thumbnailUrl,
    downloadStatus: video.downloadStatus,
    transcriptStatus: video.transcriptStatus,
    summaryStatus: video.summaryStatus,
    processedStatus: video.processedStatus,
    dateDiscovered: video.dateDiscovered,
  }

  const data = (await airtableFetch('/Videos', {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  })) as { records: Array<{ id: string }> }

  return data.records[0].id
}

export async function updateVideoRecord(
  recordId: string,
  fields: Partial<Omit<VideoRecord, 'id'>>
): Promise<void> {
  const body: Record<string, unknown> = {
    records: [
      {
        id: recordId,
        fields: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, v ?? ''])
        ),
      },
    ],
  }

  await airtableFetch('/Videos', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
