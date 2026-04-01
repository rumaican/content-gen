/**
 * Music Library — src/utils/musicLibrary.js
 * Card: [Content Generator] TikTok Background Music Adder (69c9aab8728a6aae5acdf05a)
 *
 * Provides a curated library of royalty-free background music tracks.
 * Tracks are stored in assets/music/ and indexed with mood/BPM/duration metadata.
 */

import fs from 'fs'
import path from 'path'

const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music')

/**
 * @typedef {Object} TrackMeta
 * @property {string} filename
 * @property {string} mood      - 'upbeat' | 'chill' | 'cinematic' | 'trending'
 * @property {number} bpm
 * @property {number} duration  - seconds
 * @property {string} title
 */

export interface TrackMeta {
  filename: string
  mood: 'upbeat' | 'chill' | 'cinematic' | 'trending'
  bpm: number
  duration: number
  title: string
}

/** @type {TrackMeta[]} */
const TRACKS: TrackMeta[] = [
  // Upbeat — high energy, viral TikTok vibes
  {
    filename: 'upbeat-viral.mp3',
    mood: 'upbeat',
    bpm: 120,
    duration: 30,
    title: 'Upbeat Viral',
  },
  {
    filename: 'energetic-catchy.mp3',
    mood: 'upbeat',
    bpm: 110,
    duration: 30,
    title: 'Energetic Catchy',
  },
  // Chill — relaxed, lo-fi, study beats
  {
    filename: 'chill-lofi.mp3',
    mood: 'chill',
    bpm: 85,
    duration: 30,
    title: 'Chill Lo-Fi',
  },
  {
    filename: 'relaxed-vibes.mp3',
    mood: 'chill',
    bpm: 90,
    duration: 30,
    title: 'Relaxed Vibes',
  },
  // Cinematic — emotional, epic, storytelling
  {
    filename: 'cinematic-epic.mp3',
    mood: 'cinematic',
    bpm: 100,
    duration: 30,
    title: 'Cinematic Epic',
  },
  {
    filename: 'emotional-piano.mp3',
    mood: 'cinematic',
    bpm: 75,
    duration: 30,
    title: 'Emotional Piano',
  },
]

const MANIFEST_FILENAME = 'manifest.json'

/**
 * Ensures the assets/music/ directory exists.
 */
function ensureMusicDir() {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true })
  }
}

/**
 * Reads the local track manifest, or writes the default one if absent.
 * @returns {TrackMeta[]}
 */
function getManifest() {
  ensureMusicDir()
  const manifestPath = path.join(MUSIC_DIR, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, JSON.stringify(TRACKS, null, 2), 'utf-8')
  }
  const raw = fs.readFileSync(manifestPath, 'utf-8')
  return JSON.parse(raw) as TrackMeta[]
}

/**
 * Returns all available tracks, optionally filtered by mood.
 * Falls back to 'upbeat' if mood is unknown.
 */
export function listTracks(opts: { mood?: string } = {}): TrackMeta[] {
  const { mood } = opts
  const all = getManifest()
  if (!mood || mood === 'auto') return all
  const normalized = all.filter((t: TrackMeta) => t.mood === mood)
  return normalized.length > 0 ? normalized : all.filter((t: TrackMeta) => t.mood === 'upbeat')
}

/**
 * Returns a single track path by filename.
 */
export function getTrackPath(filename: string): string | null {
  const trackPath = path.join(MUSIC_DIR, filename)
  return fs.existsSync(trackPath) ? trackPath : null
}

/**
 * Picks the best track for a given mood and approximate video duration.
 * Mood 'auto' falls back to 'upbeat'.
 */
export function pickTrack(opts: { mood?: string; duration?: number } = {}): TrackMeta | null {
  const { mood = 'upbeat', duration } = opts
  const candidates = listTracks({ mood })
  if (!candidates.length) return null
  const exact = candidates.find((t: TrackMeta) => !duration || Math.abs(t.duration - duration) < 5)
  return exact || candidates[0]
}

export { MUSIC_DIR }
