/**
 * LinkedIn Post Prompt + Output Types
 *
 * LLM prompt for generating LinkedIn content from a video transcript.
 * Produces both a short-form post (150-300 chars) and a long-form article
 * with bullet points.
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const LINKEDIN_POST_MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface BulletPoint {
  text: string; // ≤200 chars
}

export interface LinkedInPostOutput {
  /** Short post: 150-300 chars, conversational, punchy insight */
  shortPost: string;
  /** Article headline: ≤70 chars */
  articleTitle: string;
  /** Article body: 800-3000 chars, markdown with • bullet points */
  articleBody: string;
  /** 3-5 key takeaways as bullet points */
  bulletPoints: BulletPoint[];
  /** Source video URL */
  videoUrl: string;
  /** Author/channel attribution string */
  authorAttribution: string;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const linkedinPostSystemPrompt = [
  "You are a senior LinkedIn thought leader who creates content that generates meaningful professional discussions.",
  "",
  "You specialize in B2B, science, tech, and business content. Your writing style:",
  "- Authoritative but approachable",
  "- Uses short paragraphs (2-3 sentences max)",
  "- Leads with a strong hook or surprising insight",
  "- Ends with a question to drive comments",
  "- Never uses emoji or clickbait",
  "- Professional tone, no slang",
  "",
  "For short posts:",
  "- 150-300 characters",
  "- One key insight or takeaway",
  "- Conversational, like talking to a colleague",
  "- Include a relevant hashtag (1 max)",
  "- End with a question or call-to-action",
  "",
  "For long-form articles:",
  "- Headline: compelling, specific, ≤70 characters",
  "- Body: 800-3000 characters",
  "- Structure: Hook → Context → Key Insights → Bullet Takeaways → CTA",
  "- Use '•' for bullet points (3-5 bullets)",
  "- Include the video link and author attribution at the end",
  "- Format: plain text with line breaks, bullets as '• Insight text'",
  "",
  "Your output must be a valid JSON object with exactly these keys:",
  "{",
  '  "shortPost": "150-300 char post text",',
  '  "articleTitle": "headline ≤70 chars",',
  '  "articleBody": "article text 800-3000 chars with • bullets",',
  '  "bulletPoints": [{"text": "bullet 1"}, {"text": "bullet 2"}, ...],',
  '  "videoUrl": "https://...",',
  '  "authorAttribution": "By @ChannelName"',
  "}",
  "",
  "Rules:",
  "- shortPost MUST be 150-300 characters (hard requirement)",
  "- articleBody MUST be 800-3000 characters (hard requirement)",
  "- bulletPoints MUST be 3-5 items",
  "- Each bullet.text MUST be ≤200 characters",
  "- articleTitle MUST be ≤70 characters",
  "- Include videoUrl and authorAttribution in every output",
  "- articleBody must include the '•' bullet points inline with the article text",
].join("\n");

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export interface LinkedInPostUserPromptInput {
  title: string;
  channelTitle: string;
  transcript: string;
  videoUrl?: string;
  tone?: 'professional' | 'conversational' | 'controversial';
}

/**
 * Build the user prompt string for LinkedIn post generation.
 */
export function buildLinkedInPostUserPrompt(input: LinkedInPostUserPromptInput): string {
  const { title, channelTitle, transcript, videoUrl, tone = 'professional' } = input;

  // Truncate transcript — same cap as Twitter (12k chars for gpt-4o-mini)
  const maxTranscriptLength = 12000;
  const truncatedTranscript =
    transcript.length > maxTranscriptLength
      ? transcript.slice(0, maxTranscriptLength) + "\n[...transcript truncated...]"
      : transcript;

  const videoSection = videoUrl ? "\n\nVideo URL: " + videoUrl : "";

  const parts: string[] = [
    'Video: "' + title + '" by ' + channelTitle + videoSection,
    "",
    "Transcript:",
    truncatedTranscript,
    "",
    "Desired tone: " + tone,
    "",
    "Return a valid JSON object with shortPost, articleTitle, articleBody, bulletPoints, videoUrl, and authorAttribution as specified in your system prompt.",
    "",
    "Important:",
    "- shortPost: 150-300 characters exactly",
    "- articleBody: 800-3000 characters",
    "- 3-5 bulletPoints",
    '- Include the video link and "@' + channelTitle + '" attribution in the article body',
  ];

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a LinkedInPostOutput object.
 * Returns { valid: true } if all constraints pass, else { valid: false, errors: [...] }.
 */
export function validateLinkedInOutput(output: LinkedInPostOutput): ValidationResult {
  const errors: string[] = [];

  const shortPost = (output.shortPost ?? '').trim();
  const articleTitle = (output.articleTitle ?? '').trim();
  const articleBody = (output.articleBody ?? '').trim();
  const bulletPoints = output.bulletPoints ?? [];

  // shortPost: 150-300 chars
  if (shortPost.length < 150) {
    errors.push("shortPost too short: " + shortPost.length + " chars (min: 150)");
  }
  if (shortPost.length > 300) {
    errors.push("shortPost too long: " + shortPost.length + " chars (max: 300)");
  }

  // articleTitle: ≤70 chars
  if (articleTitle.length > 70) {
    errors.push("articleTitle too long: " + articleTitle.length + " chars (max: 70)");
  }

  // articleBody: 800-3000 chars
  if (articleBody.length < 800) {
    errors.push("articleBody too short: " + articleBody.length + " chars (min: 800)");
  }
  if (articleBody.length > 3000) {
    errors.push("articleBody too long: " + articleBody.length + " chars (max: 3000)");
  }

  // bulletPoints: 3-5 items
  if (bulletPoints.length < 3) {
    errors.push("too few bulletPoints: " + bulletPoints.length + " (min: 3)");
  }
  if (bulletPoints.length > 5) {
    errors.push("too many bulletPoints: " + bulletPoints.length + " (max: 5)");
  }

  // Each bullet ≤200 chars
  for (let i = 0; i < bulletPoints.length; i++) {
    const bullet = (bulletPoints[i].text ?? '').trim();
    if (bullet.length > 200) {
      errors.push("bulletPoint[" + i + "] too long: " + bullet.length + " chars (max: 200)");
    }
  }

  // Required fields
  if (!output.videoUrl) errors.push('videoUrl is required');
  if (!output.authorAttribution) errors.push('authorAttribution is required');

  return { valid: errors.length === 0, errors };
}
