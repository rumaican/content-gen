/**
 * Pipeline Configuration
 */
export const pipelineConfig = {
  downloadDir: process.env.DOWNLOAD_DIR || './downloads',
  outputDir: process.env.OUTPUT_DIR || './output',
  maxConcurrent: 3,
  ytDlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  YTDLP_PATH: process.env.YTDLP_PATH || 'yt-dlp',
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID || '',
  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY || '',
};
