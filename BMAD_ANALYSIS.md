# BMAD Analysis — Content Router

## Card
- **ID:** 69c9aab42a45862d6efbfc05
- **Name:** [Content Router] Content Router
- **ShortLink:** https://trello.com/c/ZClMP0Wp

---

## Analysis

### Business Context
Dispatch/routing layer of the content pipeline. After videos are transcribed and summarized, the Content Router decides which platforms (Twitter, Instagram, LinkedIn, TikTok, Email) should receive content and what type.

### User Story
As the **automated content pipeline**, I want to analyze a video's transcript and metadata and produce a set of platform-specific PostTasks, so that downstream generators receive clear instructions on what content to create for each target platform.

---

## Acceptance Criteria Breakdown

| AC | Rule | Edge |
|----|------|------|
| AC1 | routeContent returns 3-8 PostTasks covering 2-5 platforms | standard video |
| AC2 | duration < 60s → TikTok included | short video |
| AC3 | transcript has >3 bullet-worthy insights → Twitter/thread included | insight-rich |
| AC4 | long-form educational (>10min + how-to/explainer in title/tags) → LinkedIn Article | educational |
| AC5 | missing/empty transcript → warn + return [] | no crash |
| AC6 | platforms.json change → new rule applied without code change | configurable |
| AC7 | PostTask saved to Airtable → status='queued', required fields populated | Airtable write |

---

## Technical Notes from Card

**Files to create:**
- `src/router/platforms.json` — per-platform constraints (maxLength, maxPosts, contentTypes)
- `src/router/rules.ts` — isEligible(platform, videoRecord), scorePlatform(platform, videoRecord)
- `src/router/contentRouter.ts` — routeContent(videoRecord) → {postTasks, routingExplanation}
- `tests/unit/rules.test.ts` — unit tests for rules
- `tests/unit/contentRouter.test.ts` — unit tests for router

**Files to modify:**
- `src/lib/airtable.ts` — add createPostTask helper

**Airtable Posts table schema:**
- PostTaskId (text, primary)
- videoId (text)
- platform (select): twitter | instagram | linkedin | tiktok | email
- contentType (select): text, thread, caption, reel, article, drip-email
- priority (number): 1-3
- status (select): queued | generated | published | failed
- estimatedEffort (number) — minutes
- scheduledTime (datetime) — optional
- routingExplanation (long text)

**Airtable Videos table fields used:**
- videoId, transcript, title, duration, tags, routingStatus

---

## TDD Test Cases

### rules.test.ts
1. isEligible_returns_true_for_short_video_on_tiktok → {duration: 45} → tiktok eligible
2. isEligible_returns_false_for_long_video_on_tiktok → {duration: 180} → tiktok NOT eligible
3. isEligible_returns_true_for_insight_rich_transcript_on_twitter → 8 short sentences → twitter eligible
4. isEligible_returns_false_for_short_transcript_on_twitter → 1 sentence → twitter NOT eligible
5. scorePlatform_returns_higher_score_for_visual_hook_on_instagram → "visual hook" tag → instagram score > tiktok score
6. isEligible_handles_missing_transcript_gracefully → {transcript: null} → no crash
7. isEligible_respects_maxPosts_per_platform → maxPosts: 2 → max 2 posts

### contentRouter.test.ts
1. routeContent_returns_3_to_8_tasks → standard video → postTasks.length in [3,8]
2. routeContent_returns_empty_array_for_unsupported_video → no eligible platforms → postTasks.length == 0
3. routeContent_saves_postTasks_to_airtable → mock Airtable.create → called once per task

---

## Key Implementation Decisions

1. **TypeScript** — project uses TS, all new files will be `.ts`
2. **Pure rules** — rules.ts will be pure functions, fully unit-testable without mocking
3. **Airtable REST** — use fetch-based REST calls (no airtable npm package in deps)
4. **Configurable platforms.json** — read at runtime, not hardcoded
5. **Insight detection** — short sentences (<100 chars) separated by periods = bullet-worthy
6. **No LLM** — rule-based only, no AI calls in this step
