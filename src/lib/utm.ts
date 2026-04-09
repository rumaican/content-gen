/**
 * src/lib/utm.ts
 * GAP-1: UTM Parameter Tracking
 *
 * Provides:
 *  - buildUtmUrl(): add UTM params to any marketing URL
 *  - parseUtmParams(): extract UTM params from a URL string
 *  - captureUtmFromUrl(): capture UTM if source is present (returns null if incomplete)
 *  - isValidUtmSource(): validate known UTM source values
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term?: string | null;
  content?: string | null;
}

// ---------------------------------------------------------------------------
// Known valid UTM sources
// ---------------------------------------------------------------------------

const KNOWN_SOURCES = new Set([
  'instagram',
  'pinterest',
  'facebook',
  'twitter',
  'google',
  'newsletter',
  'email',
  'direct',
  'youtube',
  'tiktok',
  'linkedin',
  'reddit',
  'bing',
]);

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

/**
 * Append UTM query parameters to a base URL.
 *
 * Only includes params that are defined (omits term/content if not provided).
 * Preserves any existing query params on the base URL.
 *
 * @example
 * buildUtmUrl('https://cartographyprints.com/shop', {
 *   source: 'instagram',
 *   medium: 'social',
 *   campaign: 'spring-sale',
 * })
 */
export function buildUtmUrl(baseUrl: string, params: UtmParams): string {
  const url = new URL(baseUrl);

  url.searchParams.set('utm_source', params.source);
  url.searchParams.set('utm_medium', params.medium);
  url.searchParams.set('utm_campaign', params.campaign);

  if (params.term != null) {
    url.searchParams.set('utm_term', params.term);
  }
  if (params.content != null) {
    url.searchParams.set('utm_content', params.content);
  }

  return url.toString();
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse UTM parameters from a URL string.
 * Returns null for any field that is absent or empty.
 *
 * @example
 * parseUtmParams('https://cartographyprints.com/checkout?utm_source=instagram&utm_medium=social&utm_campaign=spring')
 * // → { source: 'instagram', medium: 'social', campaign: 'spring', term: null, content: null }
 */
export function parseUtmParams(urlString: string): UtmParams {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    // If it's not a valid URL, return null fields
    return { source: null, medium: null, campaign: null, term: null, content: null };
  }

  return {
    source: url.searchParams.get('utm_source') || null,
    medium: url.searchParams.get('utm_medium') || null,
    campaign: url.searchParams.get('utm_campaign') || null,
    term: url.searchParams.get('utm_term') || null,
    content: url.searchParams.get('utm_content') || null,
  };
}

/**
 * Capture UTM params from a URL, but only if `utm_source` is present.
 * Returns null if the URL has no utm_source (incomplete attribution data).
 *
 * Use this in checkout/order flow to safely capture attribution.
 */
export function captureUtmFromUrl(urlString: string): UtmParams | null {
  const params = parseUtmParams(urlString);

  if (!params.source) {
    return null;
  }

  return params;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the source is a known/recognized UTM source.
 * Used to filter out bot/spam sources in analytics.
 */
export function isValidUtmSource(source: string): boolean {
  if (!source || typeof source !== 'string') return false;
  const trimmed = source.trim().toLowerCase();
  if (!trimmed) return false;
  return KNOWN_SOURCES.has(trimmed);
}
