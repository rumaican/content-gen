/**
 * Pipeline Configuration
 * Loads environment variables from .env and exports typed config.
 * All pipeline components use this module — no hardcoded secrets.
 */

// Pipeline-specific env vars
export interface PipelineConfig {
  // yt-dlp
  YTDLP_PATH: string | undefined;

  // OpenAI
  OPENAI_API_KEY: string | undefined;

  // Twitter / Bird OAuth 1.0a
  TWITTER_API_KEY: string | undefined;
  TWITTER_API_SECRET: string | undefined;
  TWITTER_ACCESS_TOKEN: string | undefined;
  TWITTER_ACCESS_SECRET: string | undefined;
  TWITTER_BEARER_TOKEN: string | undefined;

  // Instagram / Meta Graph API
  INSTAGRAM_ACCESS_TOKEN: string | undefined;
  IG_ACCOUNT_ID: string | undefined;
  META_APP_ID: string | undefined;
  META_APP_SECRET: string | undefined;

  // Email via Resend
  RESEND_API_KEY: string | undefined;
  RESEND_FROM_EMAIL: string | undefined;

  // Airtable
  AIRTABLE_API_KEY: string | undefined;
  AIRTABLE_BASE_ID: string | undefined;

  // Polling
  RSS_POLL_INTERVAL_MS: number;
}

/**
 * Reads an env var and returns undefined if not set or empty.
 */
function env(key: string): string | undefined {
  const val = process.env[key];
  if (!val || val.trim() === '') return undefined;
  return val;
}

/**
 * Pipeline config — all keys are always present on the object.
 * Values may be undefined for optional vars, or parsed appropriately.
 */
export const pipelineConfig: PipelineConfig = {
  YTDLP_PATH: env('YTDLP_PATH'),
  OPENAI_API_KEY: env('OPENAI_API_KEY'),

  // Twitter
  TWITTER_API_KEY: env('TWITTER_API_KEY'),
  TWITTER_API_SECRET: env('TWITTER_API_SECRET'),
  TWITTER_ACCESS_TOKEN: env('TWITTER_ACCESS_TOKEN'),
  TWITTER_ACCESS_SECRET: env('TWITTER_ACCESS_SECRET'),
  TWITTER_BEARER_TOKEN: env('TWITTER_BEARER_TOKEN'),

  // Instagram / Meta
  INSTAGRAM_ACCESS_TOKEN: env('INSTAGRAM_ACCESS_TOKEN'),
  IG_ACCOUNT_ID: env('IG_ACCOUNT_ID'),
  META_APP_ID: env('META_APP_ID'),
  META_APP_SECRET: env('META_APP_SECRET'),

  // Email
  RESEND_API_KEY: env('RESEND_API_KEY'),
  RESEND_FROM_EMAIL: env('RESEND_FROM_EMAIL'),

  // Airtable
  AIRTABLE_API_KEY: env('AIRTABLE_API_KEY'),
  AIRTABLE_BASE_ID: env('AIRTABLE_BASE_ID'),

  // Defaults
  RSS_POLL_INTERVAL_MS: parseInt(env('RSS_POLL_INTERVAL_MS') ?? '3600000', 10), // 1h default
};

// Re-export for convenience
export default pipelineConfig;
