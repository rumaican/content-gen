# BMAD_ANALYSIS.md — LinkedIn Content Generator

## Card Summary
- **What:** Generate LinkedIn posts and articles from video content (transcript + summary)
- **Input:** PostTask (platform=linkedin) with videoId → fetch from Videos table
- **Output:** Short post (150-300 chars) + long-form article (800-3000 chars), published to LinkedIn, saved to Airtable

## Acceptance Criteria (ACs)
1. ✅ Generates both short post (150-300 chars) and long-form article
2. ✅ Article includes 3-5 bullet points with key takeaways
3. ✅ All posts include video link + author attribution
4. ✅ Successfully publishes to LinkedIn (user or Company Page)
5. ✅ Returns permalink and saves to Airtable Posts table

## Existing Codebase Patterns
- `src/generators/twitterGenerator.ts` — canonical generator pattern (fetch video, LLM call, validate, return)
- `src/prompts/twitterThread.ts` — prompt + output types in same file
- `src/platforms/linkedin.ts` — `postShare()`, `fetchLinkedInProfile()` already exist
- `src/auth/linkedin.ts` — OAuth + token storage (`getStoredAccessToken()`, `getStoredOrgId()`)
- `src/lib/airtable.ts` — `listVideos()`, `pipelineConfig`
- `src/router/contentRouter.ts` — `PostTask` type: `{ platform, contentType, priority, videoId, status, estimatedEffort, routingExplanation }`

## Key Design Decisions

### Generator ↔ Poster Split
Following Twitter's pattern (`twitterGenerator.ts` → `postAndNotify.ts`), split into:
- `linkedinGenerator.ts` — LLM generation only (pure, testable)
- `linkedinPoster.ts` — API publish + Airtable update (side-effectful)

### Output Shape
```typescript
interface LinkedInContentOutput {
  shortPost: string;       // 150-300 chars
  articleTitle: string;    // headline
  articleBody: string;     // 800-3000 chars with bullets
  videoUrl: string;        // source video link
  authorAttribution: string;
}
```

### Content Types (from platforms.json)
- `share` → short post (150-300 chars)
- `article` → long-form (800-3000 chars, formatted with bullets)

### LinkedIn API
- User post: `POST /v2/ugcPosts` with author=`urn:li:person:{me}`
- Org post: `POST /v2/ugcPosts` with author=`urn:li:organization:{orgId}`
- Articles: `shareMediaCategory: 'ARTICLE'` + `title` field in `specificContent`

### LLM Strategy
- Model: `gpt-4o-mini` (same as Twitter, cost-efficient)
- Single LLM call with structured JSON returning both short + long-form
- Fall back to separate calls if needed

### Prompt Design
- System: LinkedIn thought leader persona
- User: transcript excerpt + title + channel metadata
- Output: JSON with shortPost + articleTitle + articleBody + bulletPoints[]

### Validation
- shortPost: ≤300 chars, ≥150 chars
- articleBody: ≤3000 chars, ≥800 chars
- bulletPoints: 3-5 items
- Both include video link + author

## Edge Cases
1. **Empty/short transcript** → throw `LinkedInGeneratorError`, don't publish garbage
2. **LLM returns markdown** → strip ```json fences before JSON.parse
3. **Already generated** → idempotency check via Airtable status='generated'
4. **LinkedIn API 429** → exponential backoff retry (up to 5 attempts)
5. **No OAuth token** → clear error message pointing to OAuth setup
6. **Video link missing** → use channel URL as fallback attribution
7. **Bullets too long** → validate each bullet individually
8. **Long transcript** → truncate to 12k chars (same as Twitter)
