# BMAD Analysis — Twitter Content Generator

## Card
- **Name:** [Content Generator] Twitter Content Generator
- **Card ID:** 69c9aab7f915e38531e251b3
- **ShortLink:** https://trello.com/c/OBGOCRhW

## What It Does
Takes a PostTask from Airtable (platform=twitter) that contains a videoId, fetches the transcript/summary from Airtable Videos table, generates a 3-10 tweet thread via GPT-4o-mini, validates each tweet <280 chars, posts the thread to Twitter in order using in_reply_to_status_id threading, and updates the Airtable Posts table with status='generated'.

## Inputs
- `PostTask` from Airtable Posts table:
  - `videoId` (string) — key to look up the video record
  - `platform` = 'twitter'
  - `contentType` = 'text' or 'quote'
  - `priority` (1-3)
- `VideoRecord` from Airtable Videos table:
  - `videoId`, `title`, `transcript`, `duration`, `tags`, `channelTitle`

## Outputs
- Array of tweet strings + media suggestions
- Twitter thread posted in correct order (first tweet, then replies via in_reply_to_status_id)
- Airtable Posts table: `status` = 'generated', `generatedContent` = JSON of tweets

## Acceptance Criteria (from card)
- [x] Generates 3-10 tweets from a transcript summary
- [x] Each tweet is <280 characters (hard validate)
- [x] Thread posts in correct order (first tweet, then replies)
- [x] Includes relevant hashtags and 1 CTA
- [x] Media suggestion included (if video has a quotable frame)
- [x] Airtable Posts table updated with generated content + status='generated'

## Dependencies
- `twitter-api-v2` — already in package.json
- `openai` — already in package.json
- `src/lib/airtable.ts` — already exists (Posts + Videos tables)
- `src/auth/twitter.ts` — already exists (getTwitterClient)
- `src/prompts/summarize.ts` — reference for prompt pattern

## Edge Cases
1. **Transcript empty/missing** — skip generation, log warning, mark status='failed' in Posts
2. **LLM returns >10 tweets** — cap at 10, warn
3. **LLM returns tweet >280 chars** — hard validate: if >280, split or truncate
4. **Rate limit hit (429)** — back off with exponential retry (50 tweets/24h new account limit)
5. **Airtable Posts table missing generatedContent field** — gracefully skip or store as JSON string
6. **Twitter auth expired** — throw descriptive TwitterAuthError
7. **Duplicate generation call** — check if status already 'generated' before reprocessing

## File Locations (per card spec)
- `src/prompts/twitterThread.ts` — prompt for GPT-4o-mini
- `src/generators/twitterGenerator.ts` — main generation function
- `src/generators/postAndNotify.ts` — posting to Twitter + Airtable update

## Implementation Plan
1. Create `src/prompts/twitterThread.ts` — system + user prompts + Zod schema
2. Create `src/generators/twitterGenerator.ts` — fetch transcript → call LLM → validate → return tweets
3. Create `src/generators/postAndNotify.ts` — thread-posting logic + Airtable update
4. Add tests in `tests/unit/twitterGenerator.test.ts`
5. Wire into `src/index.ts` or pipeline entry point

## Effort: ~3 hours (per card estimate)
