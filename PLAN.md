# Plan — Content Router

## Goal
Build the dispatch/routing layer (`Content Router`) that takes a video record with transcript and decides which platforms (Twitter, Instagram, LinkedIn, TikTok, Email) should receive content.

---

## Step 1 — `src/router/platforms.json`

Per-platform routing constraints loaded at runtime.

```json
{
  "twitter": {
    "maxLength": 280,
    "maxPosts": 5,
    "contentTypes": ["text", "thread"],
    "minDuration": 0,
    "maxDuration": null
  },
  "instagram": {
    "maxLength": 2200,
    "maxPosts": 2,
    "contentTypes": ["caption", "reel"],
    "minDuration": 15,
    "maxDuration": null
  },
  "tiktok": {
    "maxLength": 150,
    "maxPosts": 2,
    "contentTypes": ["text-overlay"],
    "minDuration": 0,
    "maxDuration": 60
  },
  "linkedin": {
    "maxLength": 3000,
    "maxPosts": 1,
    "contentTypes": ["article", "share"],
    "minDuration": 0,
    "maxDuration": null,
    "longFormThreshold": 600,
    "educationalKeywords": ["how-to", "how to", "explainer", "tutorial", "guide", "explain"]
  },
  "email": {
    "maxLength": null,
    "maxPosts": 1,
    "contentTypes": ["drip-email"],
    "minTranscriptLength": 100
  }
}
```

---

## Step 2 — `src/router/rules.ts`

Pure functions for eligibility and scoring.

### Eligibility Rules

| Platform | Rule |
|----------|------|
| tiktok | duration < 60s (from platforms.json maxDuration) |
| twitter | transcript has >3 bullet-worthy insights (short sentences ≤100 chars) |
| instagram | has visual-related tags OR duration 15s–10min OR has hook phrases |
| linkedin | long-form educational: duration >600s AND (how-to/explainer in title OR tags) |
| email | transcript.length > minTranscriptLength (100 chars) |

### Score Platform
Each platform gets a base score of 0. Eligibile platforms get boosted:
- tiktok: +1 if short, +2 if very short (<30s)
- twitter: +1 per insight (max 4), +1 if tech/business keywords
- instagram: +2 if visual tags, +1 if good duration
- linkedin: +3 if educational keywords, +2 if long
- email: +2 if rich transcript

### Bullet-worthy Insight Detection
- Split transcript on `. ` (period + space)
- Count sentences ≤100 chars that aren't filler (no "um", "uh", "like ", length > 20)
- Return count

---

## Step 3 — `src/router/contentRouter.ts`

### Main Function
```typescript
routeContent(videoRecord: VideoRecord): Promise<RouteResult>
```

Returns:
```typescript
interface RouteResult {
  postTasks: PostTask[];
  routingExplanation: string;
}
```

### Steps inside routeContent:
1. **Validate input** — missing transcript → warn + return `{postTasks:[], routingExplanation:"No transcript"}`
2. **Load platforms.json** — read at runtime (cached)
3. **Analyze video** — countInsights, detectTags, isEducational, duration
4. **Score each platform** — for each platform: isEligible + scorePlatform
5. **Select platforms** — pick top-scoring platforms, enforce maxPosts from config
6. **Generate PostTasks** — 1 task per platform (or maxPosts count), priority from score
7. **Save to Airtable** — call createPostTask for each task
8. **Return** — {postTasks, routingExplanation}

### PostTask structure
```typescript
interface PostTask {
  platform: 'twitter' | 'instagram' | 'linkedin' | 'tiktok' | 'email';
  contentType: string;
  priority: number; // 1-3, 1=highest
  videoId: string;
  status: 'queued';
  estimatedEffort: number; // minutes
  routingExplanation: string;
}
```

---

## Step 4 — `src/lib/airtable.ts` additions

Add to `src/lib/airtable.ts`:

```typescript
// Posts table helper
export interface PostTaskRecord {
  platform: string;
  contentType: string;
  priority: number;
  videoId: string;
  status: 'queued';
  estimatedEffort: number;
  routingExplanation: string;
}

export async function createPostTask(task: PostTaskRecord): Promise<AirtableRecord> {
  const url = `${baseUrl()}/Posts`;
  const fields = {
    PostTaskId: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
```

Also remove the stub `routeContent` from airtable.ts (replace with the real one in router).

---

## Step 5 — Unit Tests

### `tests/unit/rules.test.ts`
- vitest, no mocks needed (pure functions)
- Test all rule functions listed in BMAD_ANALYSIS.md

### `tests/unit/contentRouter.test.ts`
- Mock `src/lib/airtable.ts` with `vi.mock('./src/lib/airtable')`
- Mock createPostTask to track calls
- Test routeContent return shape and Airtable calls

---

## Edge Cases

1. **Missing optional fields** (tags: undefined) → treat as empty array, no crash
2. **Transcript is whitespace only** → treat as empty, return []
3. **All platforms ineligible** → return {postTasks: [], routingExplanation: "No eligible platforms"}
4. **Airtable API failure** → throw descriptive error (not silent)
5. **platforms.json missing fields** → use defaults (0, null, [])
6. **Very long transcript** → insight detection capped at first 5000 chars for performance
7. **Priority ties** → prefer platforms with higher base priority (linkedin=3, twitter=2, etc.)

---

## Definition of Done Checklist

- [ ] routeContent returns 3-8 PostTasks for standard video
- [ ] PostTasks saved to Airtable with status='queued'
- [ ] platforms.json change alters routing without code change
- [ ] Empty transcript → warn + return [] (no crash)
- [ ] Malformed videoRecord → error log + return [] (no crash)
- [ ] Video <60s → TikTok included
- [ ] No eligible platforms → empty array (not error)
- [ ] Airtable failure → descriptive error thrown
- [ ] routeContent < 500ms (no blocking I/O)
- [ ] routingExplanation included on each PostTask
- [ ] Unit tests for rules.ts and contentRouter.ts (>80% coverage intent)
- [ ] Info-level logging for routing decisions
