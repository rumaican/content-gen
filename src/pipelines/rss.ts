/**
 * RSS Parser — parses YouTube channel RSS XML feeds into structured video records.
 * Pure function — no I/O, easy to test.
 */

import { XMLParser } from 'fast-xml-parser'

export interface ParsedVideo {
  videoId: string
  title: string
  channelId: string | null
  channelTitle: string | null
  publishedAt: string
  thumbnailUrl: string
  link: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['entry'].includes(name),
})

function extractVideoId(id: string): string {
  if (id.startsWith('yt:video:')) {
    return id.replace('yt:video:', '')
  }
  const match = id.match(/[?&]v=([^&]+)/)
  if (match) return match[1]
  return id
}

export function buildThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export function parseRSSFeed(xml: string): ParsedVideo[] {
  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xml) as Record<string, unknown>
  } catch (err) {
    throw new Error(`Failed to parse RSS XML: ${err instanceof Error ? err.message : String(err)}`)
  }

  const feed = parsed['feed'] as Record<string, unknown>
  if (!feed) {
    throw new Error('Invalid RSS feed: missing root <feed> element')
  }

  const rawEntries = feed['entry']
  if (!rawEntries) return []

  const entries: Record<string, unknown>[] = Array.isArray(rawEntries)
    ? rawEntries
    : [rawEntries]

  const seen = new Set<string>()
  const results: ParsedVideo[] = []

  for (const entry of entries) {
    const idRaw = (entry['id'] as string) ?? ''
    const videoId = extractVideoId(idRaw)

    if (!videoId) continue
    if (seen.has(videoId)) continue
    seen.add(videoId)

    const titleRaw = entry['title']
    const title =
      typeof titleRaw === 'string'
        ? titleRaw
        : (titleRaw as Record<string, unknown>)?.['#text'] ?? ''

    const publishedAt = (entry['published'] as string) ?? ''

    let channelTitle: string | null = null
    let channelId: string | null = null
    const author = entry['author'] as Record<string, unknown>
    if (author) {
      const nameRaw = author['name']
      channelTitle =
        typeof nameRaw === 'string'
          ? nameRaw
          : String((nameRaw as Record<string, unknown>)?.['#text'] ?? '') || null

      const uriRaw = author['uri'] as string
      if (uriRaw) {
        const idMatch = uriRaw.match(/channel_id=([^&]+)/) ?? uriRaw.match(/\/channel\/([^\s?&]+)/)
        channelId = idMatch ? idMatch[1] : null
      }
    }

    let thumbnailUrl = buildThumbnailUrl(videoId)
    const mediaGroup = entry['media:group'] as Record<string, unknown>
    if (mediaGroup) {
      const mediaThumbnail = mediaGroup['media:thumbnail'] as Record<string, string>
      if (mediaThumbnail?.['@_url']) {
        const rawUrl = mediaThumbnail['@_url']
        const ytMatch = rawUrl.match(/i[0-9]+\.ytimg\.com\/vi\/([^/]+)/)
        thumbnailUrl = ytMatch
          ? buildThumbnailUrl(ytMatch[1])
          : rawUrl
      }
    }

    let link = `https://www.youtube.com/watch?v=${videoId}`
    const linkRaw = entry['link']
    if (linkRaw) {
      if (typeof linkRaw === 'string') {
        link = linkRaw
      } else if (Array.isArray(linkRaw)) {
        const alternate = (linkRaw as Record<string, string>[]).find(
          (l) => l['@_rel'] === 'alternate'
        )
        link = alternate?.['@_href'] ?? link
      } else if (typeof linkRaw === 'object') {
        const linkObj = linkRaw as Record<string, string>
        link = linkObj['@_href'] ?? link
      }
    }

    results.push({
      videoId,
      title: String(title),
      channelId,
      channelTitle,
      publishedAt,
      thumbnailUrl,
      link,
    })
  }

  return results
}
