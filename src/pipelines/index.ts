/**
 * Pipelines — barrel export
 * Each pipeline is imported lazily to avoid loading unused dependencies.
 */

export { downloadVideo } from './downloader.js'
export { fetchYouTubeRSS } from './rss.js'
export { transcribeVideo } from './transcriber.js'
export { summarize, saveToAirtable, summarizeAndSave, summarizeContent } from './summarizer.js'
export { routeContent } from './router.js'
