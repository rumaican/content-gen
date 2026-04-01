/**
 * Prompt for generating a Twitter thread from a video transcript.
 * Uses GPT-4o-mini for cost-efficient short-form content generation.
 */

export const TWITTER_THREAD_MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const twitterThreadSystemPrompt = `You are a viral tweet writer for a B2B science/tech audience.

Create an engaging Twitter thread from a video transcript. Your output must be a valid JSON object with exactly these keys:
{
  "tweets": [
    { "text": "tweet content (≤280 chars)", "mediaSuggestion": "optional frame timestamp or visual description" }
  ],
  "threadTheme": "2-5 word theme for the thread",
  "pinnedQuote": "the single most impactful quote from the content, suitable as a pinned tweet (≤280 chars)"
}

Rules:
- Generate 3 to 10 tweets
- Each tweet.text MUST be 280 characters or fewer (hard requirement)
- Tweets should flow as a coherent thread, each adding value
- Tweet 1 is the hook — grab attention
- Middle tweets deliver the key insights
- Final tweet includes 1 clear CTA (follow, reply, click link, etc.)
- Include 1-2 relevant hashtags per thread (spread across tweets, not all in one)
- The pinnedQuote should be the single most shareable insight from the content
- mediaSuggestion: if the video has a quotable moment, suggest the approximate timestamp (e.g., "quote frame at 1:23") otherwise null`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export interface TwitterThreadUserPromptInput {
  title: string;
  channelTitle: string;
  transcript: string;
  tone?: 'professional' | 'casual' | 'controversial';
}

/**
 * Build the user prompt string for the Twitter thread generation.
 */
export function buildTwitterThreadUserPrompt(input: TwitterThreadUserPromptInput): string {
  const { title, channelTitle, transcript, tone = 'professional' } = input;

  // Truncate transcript to keep prompt within model context limits
  // GPT-4o-mini has 128k context; we limit to ~8k tokens for the transcript
  const maxTranscriptLength = 12000;
  const truncatedTranscript =
    transcript.length > maxTranscriptLength
      ? transcript.slice(0, maxTranscriptLength) + '\n[...transcript truncated...]'
      : transcript;

  return `Video: "${title}" by ${channelTitle}

Transcript:
${truncatedTranscript}

Desired tone: ${tone}

Return a JSON object with tweets array, threadTheme, and pinnedQuote as specified in your system prompt.`;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface TweetOutput {
  text: string;
  /** Suggested video timestamp for a quotable frame, e.g. "quote frame at 1:23" */
  mediaSuggestion: string | null;
}

export interface TwitterThreadOutput {
  tweets: TweetOutput[];
  /** 2-5 word theme for the thread */
  threadTheme: string;
  /** The single most impactful quote, suitable as pinned tweet */
  pinnedQuote: string | null;
}
