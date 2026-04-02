/**
 * Trello integration — shared client for pipeline modules.
 * Replaces Airtable for storing video records, PostTasks, and Email Sequences.
 *
 * Board: https://trello.com/b/69b31ad5cfae859d452e9afc
 *
 * List IDs:
 *   Video Pipeline  — 69cd8a2f22b1f664989fa022
 *   Post Tasks      — 69cd8a2fe6efe28847352b92
 *   Email Sequences — 69cd8a2ff81c8b083f960175
 */

const TRELLO_KEY = process.env.TRELLO_KEY!;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN!;
const TRELLO_BASE = 'https://api.trello.com/1';

export const LISTS = {
  VIDEO_PIPELINE: '69cd8a2f22b1f664989fa022',
  POST_TASKS: '69cd8a2fe6efe28847352b92',
  EMAIL_SEQUENCES: '69cd8a2ff81c8b083f960175',
} as const;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

export async function trelloFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${TRELLO_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Trello API error ${res.status}: ${body}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Video records (Video Pipeline list)
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
  transcript?: string | null;
  duration?: number | null;
  tags?: string | null;
  routingStatus?: 'pending' | 'routed' | 'failed';
  srtPath?: string | null;
  // Content publishing fields (used by Instagram Reel Generator)
  status?: 'discovered' | 'processing' | 'published' | 'failed';
  platform?: string;
  permalink?: string;
}

/**
 * Search for a video card by name (video title) in the Video Pipeline list.
 * Returns the card if found, null otherwise.
 */
async function findVideoCard(videoId: string): Promise<{ id: string; desc: string } | null> {
  const cards = await trelloFetch(
    `/lists/${LISTS.VIDEO_PIPELINE}/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
  ) as Array<{ id: string; name: string; desc: string }>;

  // Search by card name (format: "videoId: title")
  for (const card of cards) {
    if (card.name.startsWith(`${videoId}:`)) {
      return { id: card.id, desc: card.desc };
    }
  }
  return null;
}

/**
 * Check whether a video record already exists in Trello.
 */
export async function videoExists(videoId: string): Promise<boolean> {
  const card = await findVideoCard(videoId);
  return card !== null;
}

/**
 * Create a new Video card in the Video Pipeline list.
 */
export async function createVideo(video: VideoRecord): Promise<string> {
  const name = `${video.videoId}: ${video.title ?? 'Untitled'}`;
  const desc = JSON.stringify({
    videoId: video.videoId,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    thumbnailUrl: video.thumbnailUrl,
    downloadStatus: video.downloadStatus ?? 'pending',
    transcriptStatus: video.transcriptStatus ?? 'pending',
    summaryStatus: video.summaryStatus ?? 'pending',
    processedStatus: video.processedStatus ?? 'pending',
    dateDiscovered: video.dateDiscovered ?? new Date().toISOString(),
  });

  const data = await trelloFetch('/cards', {
    method: 'POST',
    body: JSON.stringify({
      idList: LISTS.VIDEO_PIPELINE,
      name,
      desc,
      key: TRELLO_KEY,
      token: TRELLO_TOKEN,
    }),
  }) as { id: string };

  console.info(`[trello] Created video card ${data.id} for ${video.videoId}`);
  return data.id;
}

/**
 * Get a video record by videoId.
 */
export async function getVideo(videoId: string): Promise<VideoRecord | null> {
  const card = await findVideoCard(videoId);
  if (!card) return null;

  try {
    return JSON.parse(card.desc) as VideoRecord;
  } catch {
    return null;
  }
}

/**
 * Update a video record by videoId.
 */
export async function updateVideoRecord(
  videoId: string,
  data: Partial<VideoRecord>
): Promise<void> {
  const card = await findVideoCard(videoId);
  if (!card) {
    throw new Error(`updateVideoRecord: no card found for videoId=${videoId}`);
  }

  // Merge with existing data
  const existing: Partial<VideoRecord> = JSON.parse(card.desc || '{}');
  const merged = { ...existing, ...data };

  await trelloFetch(`/cards/${card.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      desc: JSON.stringify(merged),
      key: TRELLO_KEY,
      token: TRELLO_TOKEN,
    }),
  });
}

// ---------------------------------------------------------------------------
// PostTask records (Post Tasks list)
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
 * Create a new PostTask card in the Post Tasks list.
 */
export async function createPostTask(task: PostTaskRecord): Promise<string> {
  const postTaskId = `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const name = `[${task.platform}] ${task.contentType} — ${task.videoId}`;
  const desc = JSON.stringify({
    postTaskId,
    ...task,
  });

  const data = await trelloFetch('/cards', {
    method: 'POST',
    body: JSON.stringify({
      idList: LISTS.POST_TASKS,
      name,
      desc,
      key: TRELLO_KEY,
      token: TRELLO_TOKEN,
    }),
  }) as { id: string };

  console.info(`[trello] Created PostTask card ${data.id} for ${task.platform}/${task.videoId}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Email Sequence records (Email Sequences list)
// ---------------------------------------------------------------------------

export interface EmailSequenceRecord {
  sequenceType: 'welcome' | 'abandonedCart';
  to: string;
  videoId: string;
  videoTitle: string;
  status: 'initiated' | 'completed' | 'failed';
  emailCount: number;
  initiatedAt: string;
}

/**
 * Create an email sequence card in the Email Sequences list.
 */
export async function createEmailSequence(seq: EmailSequenceRecord): Promise<string> {
  const name = `[${seq.sequenceType}] ${seq.to} — ${seq.videoTitle}`;
  const desc = JSON.stringify(seq);

  const data = await trelloFetch('/cards', {
    method: 'POST',
    body: JSON.stringify({
      idList: LISTS.EMAIL_SEQUENCES,
      name,
      desc,
      key: TRELLO_KEY,
      token: TRELLO_TOKEN,
    }),
  }) as { id: string };

  console.info(`[trello] Created EmailSequence card ${data.id} for ${seq.sequenceType}/${seq.to}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Comment on a card
// ---------------------------------------------------------------------------

export async function addCardComment(
  cardId: string,
  comment: string
): Promise<void> {
  await trelloFetch(`/cards/${cardId}/actions/comments`, {
    method: 'POST',
    body: JSON.stringify({
      text: comment,
      key: TRELLO_KEY,
      token: TRELLO_TOKEN,
    }),
  });
}
