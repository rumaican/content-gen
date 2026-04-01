# Plan — Twitter Content Generator

## Deliverables
1. `src/prompts/twitterThread.ts` — LLM prompt + output schema
2. `src/generators/twitterGenerator.ts` — main generator (fetch, LLM, validate, return)
3. `src/generators/postAndNotify.ts` — post thread to Twitter + update Airtable
4. `tests/unit/twitterGenerator.test.ts` — unit tests

---

## Step 1 — `src/prompts/twitterThread.ts`

**Purpose:** Define the system/user prompt for GPT-4o-mini to generate a coherent Twitter thread.

### System Prompt
"You are a viral tweet writer for a B2B science/tech audience. Create engaging Twitter threads from video transcripts. Each tweet must be under 280 characters. Threads should be 3-10 tweets long. Include 1-2 relevant hashtags per thread and 1 CTA (call-to-action) in the final tweet. Extract the most impactful quote from the content to suggest as a pinned tweet candidate."

### User Prompt Template
```
Video: "{title}" by {channelTitle}
Transcript excerpt:
{transcript}

Desired tone: {tone} (professional/casual/controversial)
```

### Output Schema (TypeScript)
```typescript
interface TweetOutput {
  text: string;         // max 280 chars
  mediaSuggestion?: string; // e.g. "quote frame from 0:42"
}
interface TwitterThreadOutput {
  tweets: TweetOutput[];
  threadTheme: string;
  pinnedQuote?: string;
}
```

---

## Step 2 — `src/generators/twitterGenerator.ts`

### `generateTwitterContent(postTask: PostTask): Promise<TwitterThreadOutput>`

**Steps:**
1. Look up VideoRecord from Airtable by `postTask.videoId`
2. If no transcript → throw error with status='failed'
3. Build user prompt with `title`, `channelTitle`, `transcript`, `tone` (from postTask or default)
4. Call `openai.chat.completions.create` with GPT-4o-mini
5. Parse JSON response → `TwitterThreadOutput`
6. **Hard validate:** if any tweet > 280 chars, truncate/split
7. **Cap:** if > 10 tweets, slice to 10
8. Return `TwitterThreadOutput`

### Validation Logic
```typescript
function validateTweet(text: string): string {
  if (text.length <= 280) return text;
  // Split on sentence boundary closest to 280
  const split = text.lastIndexOf('. ', 275);
  return split > 100 ? text.slice(0, split + 1) : text.slice(0, 277) + '…';
}
```

---

## Step 3 — `src/generators/postAndNotify.ts`

### `postTwitterThread(thread: TwitterThreadOutput, postTask: PostTask): Promise<void>`

**Steps:**
1. Get Twitter client via `getTwitterClient()`
2. Post first tweet → get `tweetId`
3. For each subsequent tweet, reply to previous tweetId (`in_reply_to_status_id`)
4. On 429 (rate limit): exponential backoff (1s, 2s, 4s, 8s, max 5 retries)
5. Track posted tweet IDs
6. Update Airtable Posts table:
   - `status` = 'generated'
   - `generatedContent` = JSON string of `{ tweets, threadTheme, postedTweetIds }`
   - `postedAt` = ISO timestamp

### Airtable Posts Table Update
```typescript
async function updatePostTaskStatus(postTaskId: string, data: Record<string, unknown>) {
  // Patch by PostTaskId field
}
```

---

## Step 4 — Wire into Pipeline

Add to `src/index.ts` or create `src/pipelines/twitterPoster.ts`:
```typescript
// Called by main generate loop — picks up twitter PostTasks
export async function processTwitterPostTask(postTaskId: string) {
  const postTask = await getPostTask(postTaskId); // fetch from Airtable Posts
  const thread = await generateTwitterContent(postTask);
  await postTwitterThread(thread, postTask);
}
```

---

## Acceptance Criteria Checklist
- [x] Generates 3-10 tweets from transcript
- [x] Each tweet <280 chars (hard validated + corrected)
- [x] Thread posts in correct order (first tweet, then replies via in_reply_to_status_id)
- [x] Includes relevant hashtags and 1 CTA in final tweet
- [x] Media suggestion included per tweet
- [x] Airtable Posts table updated with status='generated' + generatedContent JSON

---

## Edge Cases
| Edge Case | Handling |
|-----------|----------|
| Empty transcript | Throw error, set status='failed' in Posts table |
| Tweet > 280 chars | Truncate at sentence boundary near 280 |
| > 10 tweets | Cap at 10, log warning |
| 429 rate limit | Exponential backoff: 1→2→4→8s, max 5 retries |
| Status already 'generated' | Skip (idempotent) |
| Twitter auth expired | Propagate TwitterAuthError |
| Airtable Posts table missing field | Gracefully skip optional fields |
