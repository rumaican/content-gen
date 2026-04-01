/**
 * poll-rss.ts — Manual/one-shot trigger for the RSS Monitor.
 * Run with: npm run poll-rss
 *
 * Does NOT start the scheduler. Executes a single poll cycle and exits.
 */

import { runPollCycle, loadConfig } from '../src/pipeline/rss-monitor.js';

async function main() {
  console.log('[poll-rss] Loading configuration...');

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error('[poll-rss] Failed to load config:', err);
    process.exit(1);
  }

  console.log(`[poll-rss] Config: ${config.channels.length} channel(s), interval: ${config.pollIntervalMs}ms`);

  if (config.channels.length === 0) {
    console.warn('[poll-rss] No channels configured. Set YOUTUBE_CHANNELS env var or add RSS_CHANNELS to Airtable Settings.');
  }

  try {
    const result = await runPollCycle(config);
    console.log('[poll-rss] Poll complete.', result);
    process.exit(0);
  } catch (err) {
    console.error('[poll-rss] Poll failed:', err);
    process.exit(1);
  }
}

main();
