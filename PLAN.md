# PLAN.md — LinkedIn Content Generator

## Deliverables
1. `src/prompts/linkedinPost.ts` — LLM prompt + output types
2. `src/generators/linkedinGenerator.ts` — generation logic (fetch video, call LLM, validate)
3. `src/generators/linkedinPoster.ts` — publish to LinkedIn API + update Airtable

## Implementation Order

### Step 1: `src/prompts/linkedinPost.ts`

Export:
- `LINKEDIN_POST_MODEL = 'gpt-4o-mini'`
- `linkedinPostSystemPrompt` — system prompt string
- `buildLinkedInPostUserPrompt(input)` — user prompt builder
- `LinkedInPostOutput` interface
- `validateLinkedInOutput(output)` — validation function

### Step 2: `src/generators/linkedinGenerator.ts`

Export:
- `LinkedInGeneratorError` — custom error class
- `generateLinkedInContent(postTask, options?)` → `Promise<LinkedInPostOutput>`
  - Fetches video from Airtable by videoId
  - Calls LLM with prompt
  - Parses JSON
  - Validates output
  - Returns LinkedInPostOutput
- `hasTranscript(videoId)` — pre-flight check

### Step 3: `src/generators/linkedinPoster.ts`

Export:
- `postLinkedInContent(content, postTask, options?)` → `Promise<{ postId, postUrl }>`
  - Idempotency check: skip if status='generated'
  - Publish short post via `postShare()` (or article via dedicated method)
  - Build permalink from postId
  - Update Airtable Posts: status='generated', generatedContent JSON, postedAt, postUrl

## LinkedInPostOutput Interface
```typescript
interface BulletPoint {
  text: string;  // ≤200 chars each
}

interface LinkedInPostOutput {
  shortPost: string;       // 150-300 chars
  articleTitle: string;    // ≤70 chars
  articleBody: string;     // 800-3000 chars (markdown with • bullets)
  bulletPoints: BulletPoint[];  // 3-5 items
  videoUrl: string;         // source video link
  authorAttribution: string;  // e.g. "By @channel • Video"
}
```

## Validation Rules
- shortPost: `trim().length >= 150 && trim().length <= 300`
- articleTitle: `trim().length <= 70`
- articleBody: `trim().length >= 800 && trim().length <= 3000`
- bulletPoints: `length >= 3 && length <= 5`
- bullet text: `length <= 200`

## LinkedIn Publishing Details

### Short Post (share)
```
POST /v2/ugcPosts
Author: urn:li:person:{personId}  OR  urn:li:organization:{orgId}
lifecycleState: PUBLISHED
specificContent: {
  "com.linkedin.ugc.ShareContent": {
    shareCommentary: { text: "<shortPost>\n\n<link>" },
    shareMediaCategory: "NONE"
  }
}
visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
```

### Article
```
POST /v2/ugcPosts
Author: ...
specificContent: {
  "com.linkedin.ugc.ShareContent": {
    shareCommentary: { text: "<articleTitle>\n\n<articleBody with bullets>" },
    shareMediaCategory: "ARTICLE",
    media: [{ status: "READY", originalUrl: "<videoUrl>", title: "<articleTitle>" }]
  }
}
```

## Airtable Posts Update Fields
```json
{
  "status": "generated",
  "generatedContent": "<JSON.stringify(LinkedInPostOutput)>",
  "postedAt": "<ISO timestamp>",
  "postUrl": "<LinkedIn permalink URL>"
}
```

## Tests to Write
1. `validateLinkedInOutput` — valid + invalid cases
2. `validateTweet`-equivalent for short post length
3. `buildLinkedInPostUserPrompt` — truncation behavior
4. Generation with mock OpenAI response

## Files Modified
- `src/prompts/linkedinPost.ts` — CREATE
- `src/generators/linkedInGenerator.ts` — CREATE
- `src/generators/linkedinPoster.ts` — CREATE
